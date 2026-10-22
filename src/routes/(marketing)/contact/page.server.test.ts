import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { actions, type ContactDeps } from './+page.server';
import { clearRateLimitState } from '$lib/server/utils/rateLimit';

const TO = 'hello@familyplanz.com';

type RequestResult = Record<string, unknown>;

// SAFETY: SvelteKit's Actions type erases the handler's optional deps
// parameter; the real handler accepts it (tests call it through this cast).
const callRequest = actions.default as (
	event: RequestEvent,
	deps?: ContactDeps
) => Promise<RequestResult>;

// SAFETY: test double — the action only reads request.formData() and
// request.headers (for rate limiting).
function mockEvent(fields: Record<string, string>, ip = '1.2.3.4') {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) formData.set(key, value);
	const headers = {
		get: (name: string) => (name === 'x-real-ip' ? ip : null)
	};
	return { request: { formData: () => Promise.resolve(formData), headers } } as never;
}

function makeDeps() {
	const gate = vi.fn(() => true);
	const sendEmail = vi
		.fn()
		.mockResolvedValue({ success: true, error: undefined, data: { id: 'email-1' } });
	return { deps: { sendEmail, gate } as ContactDeps, sendEmail, gate };
}

type Success = { success: true };
type Failure = { status: number; data: { failure: true; error: string } };

function successOf(result: RequestResult): Success {
	// SAFETY: happy-path branches return the plain object; fail() branches are
	// asserted separately via failureOf.
	return result as Success;
}

function failureOf(result: RequestResult): Failure {
	// SAFETY: failing branches return fail(...), which structurally carries
	// status/data; success branches are asserted via successOf.
	return result as Failure;
}

beforeEach(() => {
	vi.clearAllMocks();
	clearRateLimitState();
});

describe('POST /contact', () => {
	it.each([
		{
			name: 'full valid form',
			fields: { name: 'Alex', email: 'alex@example.com', message: 'Hi there' },
			expectedSubject: 'New Contact Form Submission from Alex'
		},
		{
			name: 'single-character name and message',
			fields: { name: 'A', email: 'b@c.de', message: '?', website: '' },
			expectedSubject: 'New Contact Form Submission from A'
		}
	])('sends the contact email for $name', async ({ fields, expectedSubject }) => {
		const { deps, sendEmail } = makeDeps();

		const result = successOf(await callRequest(mockEvent(fields), deps));

		expect(result).toEqual({ success: true });
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: TO,
				subject: expectedSubject,
				html: expect.stringContaining(fields.message)
			})
		);
	});

	it('does not count rate-limit budget on validation failures', async () => {
		const { deps, gate, sendEmail } = makeDeps();

		failureOf(await callRequest(mockEvent({ name: 'A', email: 'nope', message: 'Hi' }), deps));

		expect(gate).toHaveBeenCalledTimes(1);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it.each([
		{
			name: 'invalid email',
			fields: { name: 'Alex', email: 'not-an-email', message: 'Hi there' },
			status: 400,
			error: 'Please enter a valid email address'
		},
		{
			name: 'empty message',
			fields: { name: 'Alex', email: 'alex@example.com', message: '   ' },
			status: 400,
			error: 'All fields are required'
		},
		{
			name: 'missing all required fields',
			fields: { website: '' },
			status: 400,
			error: 'All fields are required'
		},
		{
			name: 'honeypot filled',
			fields: { name: 'Alex', email: 'alex@example.com', message: 'Hi there', website: 'spam' },
			status: 400,
			error: 'Invalid submission'
		},
		{
			name: 'rate limited gate returns failure',
			fields: { name: 'Alex', email: 'alex@example.com', message: 'Hi there' },
			status: 429,
			error: 'Too many attempts. Try again shortly.'
		}
	])('rejects $name with $status', async ({ fields, status, error }) => {
		const { deps, sendEmail, gate } = makeDeps();
		const rateLimited = status === 429;
		gate.mockReturnValue(rateLimited ? false : true);

		const result = failureOf(await callRequest(mockEvent(fields), deps));

		expect(result.status).toBe(status);
		expect(result.data).toEqual({ failure: true, error });
		expect(sendEmail).not.toHaveBeenCalled();
		// The client enhance handler reads result.data.error; failure payloads
		// must carry it for the on-page error box.
		expect(result.data.error.length).toBeGreaterThan(0);
	});

	it('returns failure when the email provider rejects the send', async () => {
		const { deps, sendEmail } = makeDeps();
		sendEmail.mockResolvedValue({ success: false, error: 'provider down' });

		const result = failureOf(await callRequest(mockEvent(fields()), deps));

		expect(result.status).toBe(500);
		expect(result.data).toEqual({
			failure: true,
			error: 'Something went wrong. Please try again.'
		});
	});

	it('escapes user-supplied HTML in the email body', async () => {
		const { deps, sendEmail } = makeDeps();

		await callRequest(mockEvent({ name: 'A<b>', email: 'a@b.co', message: '<script>' }), deps);

		const html = sendEmail.mock.calls[0][0].html as string;
		expect(html).toContain('&lt;script&gt;');
		expect(html).not.toContain('<script>');
	});
});

function fields(): Record<string, string> {
	return { name: 'Alex', email: 'alex@example.com', message: 'Hi there' };
}
