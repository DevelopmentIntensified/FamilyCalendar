import { describe, expect, it } from 'vitest';
import { createResendMailer } from './resendMailer.server';

type Call = { readonly url: string; readonly init: RequestInit };

function recordingFetcher(status = 200, payload: object = { id: 'em_1' }) {
	const calls: Call[] = [];
	const fetcher: typeof fetch = async (input, init) => {
		calls.push({ url: String(input), init: init ?? {} });
		return new Response(JSON.stringify(payload), {
			status,
			headers: { 'content-type': 'application/json' }
		});
	};
	return { calls, fetcher };
}

const config = { apiKey: 're_test_key', from: 'noReply@familyplanz.com' };

describe('createResendMailer', () => {
	it('posts the legacy resend.emails.send body to the Resend endpoint', async () => {
		const { calls, fetcher } = recordingFetcher();
		const mailer = createResendMailer(config, fetcher);

		await mailer.send({
			to: 'member@example.test',
			subject: 'You have been invited to join a family',
			html: '<p>Join</p>'
		});

		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('https://api.resend.com/emails');
		expect(calls[0].init.method).toBe('POST');
		expect(calls[0].init.headers).toEqual({
			authorization: 'Bearer re_test_key',
			'content-type': 'application/json'
		});
		expect(JSON.parse(String(calls[0].init.body))).toEqual({
			from: 'noReply@familyplanz.com',
			to: 'member@example.test',
			subject: 'You have been invited to join a family',
			html: '<p>Join</p>'
		});
	});

	it('carries text, reply_to and a per-message from only when given', async () => {
		const { calls, fetcher } = recordingFetcher();
		const mailer = createResendMailer(config, fetcher);

		await mailer.send({
			to: 'owner@example.test',
			subject: 'Your code',
			html: '<p>123456</p>',
			text: '123456',
			from: 'billing@familyplanz.com',
			replyTo: 'support@familyplanz.com'
		});

		expect(JSON.parse(String(calls[0].init.body))).toEqual({
			from: 'billing@familyplanz.com',
			to: 'owner@example.test',
			subject: 'Your code',
			html: '<p>123456</p>',
			text: '123456',
			reply_to: 'support@familyplanz.com'
		});
	});

	it('rejects with the provider message and status when Resend refuses', async () => {
		const { fetcher } = recordingFetcher(422, {
			statusCode: 422,
			name: 'validation_error',
			message: 'Invalid `from` address'
		});
		const mailer = createResendMailer(config, fetcher);

		await expect(
			mailer.send({ to: 'member@example.test', subject: 'Invite', html: '<p>Join</p>' })
		).rejects.toThrow('Resend rejected the email (HTTP 422): Invalid `from` address');
	});

	it('rejects with the status alone when the refusal body is not JSON', async () => {
		const fetcher: typeof fetch = async () =>
			new Response('upstream exploded', { status: 502 });
		const mailer = createResendMailer(config, fetcher);

		await expect(
			mailer.send({ to: 'member@example.test', subject: 'Invite', html: '<p>Join</p>' })
		).rejects.toThrow('Resend rejected the email (HTTP 502)');
	});
});
