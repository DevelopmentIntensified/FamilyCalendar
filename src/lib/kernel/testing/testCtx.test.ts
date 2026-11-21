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

	it('gives every test memory push, ai and http ports', async () => {
		const ctx = testCtx();
		ctx.ai.script({ ok: true });
		ctx.http.reply('https://example.test/a', { body: '[]' });

		await ctx.push.send({ channel: 'device', token: 't', body: {} });
		expect(ctx.push.sent).toHaveLength(1);
		await expect(ctx.ai.chatJson('s', 'u')).resolves.toEqual({ ok: true });
		await expect(ctx.http.request({ url: 'https://example.test/a' })).resolves.toEqual({
			status: 200,
			ok: true,
			body: '[]'
		});
	});

	it('carries the legacy VAPID, model and user-agent defaults', () => {
		const config = testCtx().config;
		expect(config.vapidSubject).toBe('mailto:admin@familyplanz.com');
		expect(config.cerebrasModel).toBe('gpt-oss-120b');
		expect(config.userAgent).toBe('FamilyPlanz/1.0 (test@familyplanz.com)');
	});

	it('starts unconfigured like a zero-env legacy process, so a golden sees the fallback path', () => {
		const ctx = testCtx();

		expect(ctx.push.webPublicKey()).toBeNull();
		expect(ctx.push.devicesConfigured()).toBe(false);
		expect(ctx.ai.configured()).toBe(false);
		expect(ctx.config.vapidPublicKey).toBeNull();
		expect(ctx.config.cerebrasApiKey).toBeNull();
	});
});
