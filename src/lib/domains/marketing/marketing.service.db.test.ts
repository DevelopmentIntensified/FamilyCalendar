/**
 * The contact use case against the mail port: the budget, the refusals and the
 * message that leaves. Expected values are the legacy contract — the copy from
 * `src/routes/api/contact/+page.server.ts` / `(marketing)/contact/+page.server.ts`
 * and the mail from `(marketing)/contact/page.server.test.ts` — never this
 * module's own output.
 *
 * The service touches no table; it is a `.db.test.ts` because R13 asks a
 * service for a db test, and the fault the boundary files would land there.
 * Every case runs in `rollbackTest`, so nothing is left behind.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect } from 'vitest';
import type { Ctx } from '$lib/kernel/ctx/ctx.server';
import { isAppError, type AppError } from '$lib/kernel/errors/appError';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import {
	CONTACT_EMAIL_MESSAGE,
	CONTACT_HONEYPOT_MESSAGE,
	CONTACT_REQUIRED_MESSAGE,
	CONTACT_THROTTLED_MESSAGE,
	ContactApiBody,
	ContactFormBody
} from './marketing.contract';
import { CONTACT_RECIPIENT, contactMessageHtml, contactSubject } from './marketing.mail.rules';
import {
	sendContactMessage,
	type ContactBudget,
	type ContactSendInput
} from './marketing.service.server';

/** The legacy `/api/contact` budget: 3 sends per 15 minutes. */
const API_BUDGET: ContactBudget = { limit: 3, windowMs: 15 * 60 * 1000 };

/** The legacy `/contact` budget: 5 sends per 10 minutes. */
const FORM_BUDGET: ContactBudget = { limit: 5, windowMs: 10 * 60 * 1000 };

const valid = { name: 'Alex', email: 'alex@example.com', message: 'The grocery list is great.' };

/** A submitted form, form-encoded, from one client IP — what both surfaces receive. */
function submit(
	fields: Record<string, string>,
	options: { ip?: string; body?: ContactSendInput['body']; budget?: ContactBudget } = {}
): ContactSendInput {
	return {
		request: new Request('https://www.familyplanz.com/contact', {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				'x-real-ip': options.ip ?? '203.0.113.1'
			},
			body: new URLSearchParams(fields).toString()
		}),
		body: options.body ?? ContactApiBody,
		budget: options.budget ?? API_BUDGET
	};
}

/** The `AppError` a refusal threw; fails the test when it is anything else. */
function refusalOf(error: unknown): AppError {
	if (!isAppError(error)) throw error;
	return error;
}

async function refusalOfSubmit(ctx: Ctx, input: ContactSendInput): Promise<AppError> {
	try {
		await sendContactMessage(ctx, null, input);
	} catch (error) {
		return refusalOf(error);
	}
	throw new Error('the submit was allowed; a refusal was expected');
}

describe('sendContactMessage', () => {
	rollbackTest(
		"escapes the sender's HTML and pins recipient and subject",
		async (db) => {
			const ctx = testCtx({ db });
			await sendContactMessage(
				ctx,
				null,
				submit({ name: 'A<b>', email: 'a@b.co', message: '<script>' })
			);

			expect(ctx.mail.outbox).toHaveLength(1);
			const sent = ctx.mail.outbox[0];
			expect(sent.to).toBe(CONTACT_RECIPIENT);
			expect(sent.to).toBe('hello@familyplanz.com');
			expect(sent.from).toBe('noReply@familyplanz.com');
			expect(sent.subject).toBe('New Contact Form Submission from A<b>');
			expect(sent.subject).toBe(contactSubject('A<b>'));
			expect(sent.html).toBe(
				contactMessageHtml({ name: 'A<b>', email: 'a@b.co', message: '<script>' })
			);
			expect(sent.html).toContain('&lt;script&gt;');
			expect(sent.html).not.toContain('<script>');
		}
	);

	rollbackTest('does not trim: /api/contact sends a whitespace-only message', async (db) => {
		const ctx = testCtx({ db });
		await sendContactMessage(ctx, null, submit({ ...valid, message: '   ' }));

		expect(ctx.mail.outbox).toHaveLength(1);
		expect(ctx.mail.outbox[0].html).toContain('>   </p>');
	});

	rollbackTest('refuses a blank message on /contact, which trims for the check only', async (db) => {
		const ctx = testCtx({ db });
		const refusal = await refusalOfSubmit(
			ctx,
			submit({ ...valid, message: '   ' }, { body: ContactFormBody, budget: FORM_BUDGET })
		);

		expect(refusal.code).toBe('invalid');
		expect(refusal.status).toBe(400);
		expect(refusal.message).toBe(CONTACT_REQUIRED_MESSAGE);
		expect(ctx.mail.outbox).toEqual([]);
	});

	rollbackTest('refuses a filled honeypot with Invalid submission and sends nothing', async (db) => {
		const ctx = testCtx({ db });
		const refusal = await refusalOfSubmit(
			ctx,
			submit({ ...valid, website: 'http://spam.example' })
		);

		expect(refusal.code).toBe('invalid');
		expect(refusal.status).toBe(400);
		expect(refusal.message).toBe(CONTACT_HONEYPOT_MESSAGE);
		expect(ctx.mail.outbox).toEqual([]);
	});

	rollbackTest('refuses every missing required field, and refuses first', async (db) => {
		const ctx = testCtx({ db });
		const forms = [
			{ email: valid.email, message: valid.message },
			{ name: valid.name, message: valid.message },
			{ name: valid.name, email: valid.email },
			{}
		];
		// One client IP per row: four rows would otherwise spend this ctx's
		// three-submit budget and the last would be a 429, not the required copy.
		for (const [index, fields] of forms.entries()) {
			const refusal = await refusalOfSubmit(
				ctx,
				submit(fields, { ip: `203.0.113.${30 + index}` })
			);
			expect(refusal.code).toBe('invalid');
			expect(refusal.status).toBe(400);
			expect(refusal.message).toBe(CONTACT_REQUIRED_MESSAGE);
		}
		expect(ctx.mail.outbox).toEqual([]);
	});

	rollbackTest('refuses a whitespace-padded address: the legacy regex, never trimmed', async (db) => {
		const ctx = testCtx({ db });
		const refusal = await refusalOfSubmit(
			ctx,
			submit({ ...valid, email: ' alex@example.com' })
		);

		expect(refusal.code).toBe('invalid');
		expect(refusal.status).toBe(400);
		expect(refusal.message).toBe(CONTACT_EMAIL_MESSAGE);
		expect(ctx.mail.outbox).toEqual([]);
	});

	rollbackTest(
		'spends the budget before the form is checked: three refused submits then 429',
		async (db) => {
			const ctx = testCtx({ db });
			const honeypot = { ...valid, website: 'bot' };
			for (let attempt = 0; attempt < API_BUDGET.limit; attempt += 1) {
				const refusal = await refusalOfSubmit(ctx, submit(honeypot));
				expect(refusal.message).toBe(CONTACT_HONEYPOT_MESSAGE);
			}

			// A complete, valid form is still refused: the gate runs before the
			// form is read and before any email is sent.
			const blocked = await refusalOfSubmit(ctx, submit(valid));
			expect(blocked.code).toBe('tooMany');
			expect(blocked.status).toBe(429);
			expect(blocked.message).toBe(CONTACT_THROTTLED_MESSAGE);
			expect(ctx.mail.outbox).toEqual([]);
		}
	);

	rollbackTest('keeps a separate budget per client IP', async (db) => {
		const ctx = testCtx({ db });
		const honeypot = { ...valid, website: 'bot' };
		for (let attempt = 0; attempt < API_BUDGET.limit; attempt += 1) {
			await refusalOfSubmit(ctx, submit(honeypot, { ip: '203.0.113.14' }));
		}

		const otherClient = await refusalOfSubmit(
			ctx,
			submit(honeypot, { ip: '203.0.113.15' })
		);
		expect(otherClient.message).toBe(CONTACT_HONEYPOT_MESSAGE);
	});

	rollbackTest('/contact allows five submits per ten minutes, then 429', async (db) => {
		const ctx = testCtx({ db });
		for (let attempt = 0; attempt < FORM_BUDGET.limit; attempt += 1) {
			await refusalOfSubmit(
				ctx,
				submit({ ...valid, website: 'bot' }, { body: ContactFormBody, budget: FORM_BUDGET })
			);
		}

		const blocked = await refusalOfSubmit(
			ctx,
			submit(valid, { body: ContactFormBody, budget: FORM_BUDGET })
		);
		expect(blocked.code).toBe('tooMany');
		expect(blocked.message).toBe(CONTACT_THROTTLED_MESSAGE);
	});

	rollbackTest('a mail-provider failure is a fault, not a refusal', async (db) => {
		const base = testCtx({ db });
		const ctx: Ctx = {
			...base,
			mail: {
				send: async () => {
					throw new Error('provider down');
				}
			}
		};

		let thrown: unknown;
		try {
			await sendContactMessage(ctx, null, submit(valid));
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toBe('provider down');
		expect(isAppError(thrown)).toBe(false);
		// The boundary logs and files it; the service only throws.
		expect(base.faults.reports).toEqual([]);
	});
});
