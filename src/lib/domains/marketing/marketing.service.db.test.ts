/**
 * The contact use case against the mail port: the budget, the refusals and the
 * message that leaves. Expected values are the legacy contract — the copy from
 * `src/routes/api/contact/+page.server.ts` and the mail from
 * `(marketing)/contact/page.server.test.ts` — never this module's own output.
 *
 * The service touches no table; it is a `.db.test.ts` because R13 asks a
 * service for a db test, and the fault the boundary files would land there.
 * Every case runs in `rollbackTest`, so nothing is left behind.
 *
 * One surface since Q-068 (answer B): the page posts to the `/api` action, so
 * the 3-per-15-minute budget and the non-trimming contract are the only rules
 * here.
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
	CONTACT_THROTTLED_MESSAGE
} from './marketing.contract';
import { CONTACT_RECIPIENT, contactMessageHtml, contactSubject } from './marketing.mail.rules';
import { sendContactMessage } from './marketing.service.server';

/** The legacy budget: 3 sends per 15 minutes per client IP. */
const CONTACT_LIMIT = 3;

const valid = { name: 'Alex', email: 'alex@example.com', message: 'The grocery list is great.' };

/** A submitted form, form-encoded, from one client IP — what the route hands in. */
function submit(fields: Record<string, string>, ip = '203.0.113.1'): Request {
	return new Request('https://www.familyplanz.com/api/contact', {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			'x-real-ip': ip
		},
		body: new URLSearchParams(fields).toString()
	});
}

/** The `AppError` a refusal threw; fails the test when it is anything else. */
function refusalOf(error: unknown): AppError {
	if (!isAppError(error)) throw error;
	return error;
}

async function refusalOfSubmit(ctx: Ctx, request: Request): Promise<AppError> {
	try {
		await sendContactMessage(ctx, null, request);
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
			await sendContactMessage(ctx, null, submit({ name: 'A<b>', email: 'a@b.co', message: '<script>' }));

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

	rollbackTest('does not trim: a whitespace-only message is sent', async (db) => {
		const ctx = testCtx({ db });
		await sendContactMessage(ctx, null, submit({ ...valid, message: '   ' }));

		expect(ctx.mail.outbox).toHaveLength(1);
		expect(ctx.mail.outbox[0].html).toContain('>   </p>');
	});

	rollbackTest('refuses a filled honeypot with Invalid submission and sends nothing', async (db) => {
		const ctx = testCtx({ db });
		const refusal = await refusalOfSubmit(ctx, submit({ ...valid, website: 'http://spam.example' }));

		expect(refusal.code).toBe('invalid');
		expect(refusal.status).toBe(400);
		expect(refusal.message).toBe(CONTACT_HONEYPOT_MESSAGE);
		expect(ctx.mail.outbox).toEqual([]);
	});

	rollbackTest('refuses every missing required field, and refuses first', async (db) => {
		const ctx = testCtx({ db });
		const forms: ReadonlyArray<Record<string, string>> = [
			{ email: valid.email, message: valid.message },
			{ name: valid.name, message: valid.message },
			{ name: valid.name, email: valid.email },
			{}
		];
		// One client IP per row: four rows would otherwise spend this ctx's
		// three-submit budget and the last would be a 429, not the required copy.
		for (const [index, fields] of forms.entries()) {
			const refusal = await refusalOfSubmit(ctx, submit(fields, `203.0.113.${30 + index}`));
			expect(refusal.code).toBe('invalid');
			expect(refusal.status).toBe(400);
			expect(refusal.message).toBe(CONTACT_REQUIRED_MESSAGE);
		}
		expect(ctx.mail.outbox).toEqual([]);
	});

	rollbackTest('refuses a whitespace-padded address: the legacy regex, never trimmed', async (db) => {
		const ctx = testCtx({ db });
		const refusal = await refusalOfSubmit(ctx, submit({ ...valid, email: ' alex@example.com' }));

		expect(refusal.code).toBe('invalid');
		expect(refusal.status).toBe(400);
		expect(refusal.message).toBe(CONTACT_EMAIL_MESSAGE);
		expect(ctx.mail.outbox).toEqual([]);
	});

	rollbackTest('spends the budget before the form is checked: three refused submits then 429', async (db) => {
		const ctx = testCtx({ db });
		const honeypot = { ...valid, website: 'bot' };
		for (let attempt = 0; attempt < CONTACT_LIMIT; attempt += 1) {
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
	});

	rollbackTest('keeps a separate budget per client IP', async (db) => {
		const ctx = testCtx({ db });
		const honeypot = { ...valid, website: 'bot' };
		for (let attempt = 0; attempt < CONTACT_LIMIT; attempt += 1) {
			await refusalOfSubmit(ctx, submit(honeypot, '203.0.113.14'));
		}

		const otherClient = await refusalOfSubmit(ctx, submit(honeypot, '203.0.113.15'));
		expect(otherClient.message).toBe(CONTACT_HONEYPOT_MESSAGE);
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
