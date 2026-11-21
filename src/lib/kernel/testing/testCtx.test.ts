import { describe, expect, it } from 'vitest';
import { testCtx } from './testCtx.server';

describe('testCtx', () => {
	it('gives every test a memory mailer whose outbox is the sent mail', async () => {
		const ctx = testCtx();
		expect(ctx.mail.outbox).toEqual([]);

		await ctx.mail.send({ to: 'hello@familyplanz.com', subject: 'Contact', html: '<p>Hi</p>' });

		expect(ctx.mail.outbox).toEqual([
			{ to: 'hello@familyplanz.com', subject: 'Contact', html: '<p>Hi</p>' }
		]);
	});

	it('carries the legacy default sender as config.mailFrom', () => {
		expect(testCtx().config.mailFrom).toBe('noReply@familyplanz.com');
	});
});
