import { describe, expect, it } from 'vitest';
import { createMemoryMailer } from './mailer';

describe('createMemoryMailer', () => {
	it('records every message in send order and resolves to void', async () => {
		const mailer = createMemoryMailer();
		const invite = { to: 'member@example.test', subject: 'Invite', html: '<p>Join</p>' };
		const code = {
			to: 'owner@example.test',
			subject: 'Your code',
			html: '<p>123456</p>',
			text: '123456'
		};

		expect(mailer.outbox).toEqual([]);
		await expect(mailer.send(invite)).resolves.toBeUndefined();
		await mailer.send(code);

		expect(mailer.outbox).toEqual([invite, code]);
	});

	it('keeps the optional text, from and replyTo exactly as the caller sent them', async () => {
		const mailer = createMemoryMailer();
		const message = {
			to: 'hello@familyplanz.com',
			subject: 'New Contact Form Submission from Ada',
			html: '<p>Hi</p>',
			text: 'Hi',
			from: 'noReply@familyplanz.com',
			replyTo: 'ada@example.test'
		};

		await mailer.send(message);

		expect(mailer.outbox).toEqual([message]);
	});
});
