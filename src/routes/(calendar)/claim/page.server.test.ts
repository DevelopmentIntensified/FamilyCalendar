import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { actions, type ClaimRequestDeps } from './+page.server';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the action's return is SvelteKit's bag (Record<string, any>); tests narrow it via successOf/failureOf.
type RequestResult = Record<string, unknown> | void;

// SAFETY: SvelteKit's Actions type erases the handler's optional deps
// parameter; the real handler accepts it (tests call it through this cast).
const callRequest = actions.request as (
	event: RequestEvent,
	deps: ClaimRequestDeps
) => Promise<RequestResult>;

function makeDeps() {
	const sendClaimLinkEmail = vi.fn().mockResolvedValue({ ok: true });
	const getUserByEmail = vi.fn().mockResolvedValue(undefined);
	const deps: ClaimRequestDeps = {
		issueClaimToken: vi.fn().mockResolvedValue('tok-1'),
		getUserByEmail,
		sendClaimLinkEmail,
		sendEmail: vi.fn(),
		fromEmail: 'noreply@test.com',
		baseSiteUrl: 'http://test.com'
	};
	return { deps, sendClaimLinkEmail, getUserByEmail };
}

function mockEvent(email: string | null, user: { id: string; email?: string } | null = null) {
	const formData = new FormData();
	if (email) formData.set('email', email);
	// SAFETY: test double — the action only reads request.formData() and locals.user.
	return { request: { formData: () => Promise.resolve(formData) }, locals: { user } } as never;
}

function successOf(result: RequestResult): {
	success: true;
	email: string;
	alreadyRegistered: boolean;
} {
	// SAFETY: happy-path branches return the plain object; fail() branches are
	// asserted separately via failureOf.
	return result as { success: true; email: string; alreadyRegistered: boolean };
}

function failureOf(result: RequestResult): { status: number; data: { error: string } } {
	// SAFETY: failing branches return fail(...), which structurally carries
	// status/data; success branches are asserted via successOf.
	return result as { status: number; data: { error: string } };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('POST /claim ?/request', () => {
	it('issues a claim token and emails the verify link for a new email', async () => {
		const { deps, sendClaimLinkEmail } = makeDeps();

		const result = successOf(
			await callRequest(mockEvent('claim@user.com', { id: 'guest-1' }), deps)
		);

		expect(deps.issueClaimToken).toHaveBeenCalledWith('guest-1', 'claim@user.com');
		expect(deps.sendClaimLinkEmail).toHaveBeenCalledTimes(1);
		const emailInput = sendClaimLinkEmail.mock.calls[0][1];
		expect(emailInput.email).toBe('claim@user.com');
		expect(emailInput.verifyUrl).toBe('http://test.com/claim/verify/tok-1');
		expect(emailInput.alreadyRegistered).toBe(false);
		expect(result).toEqual({ success: true, email: 'claim@user.com', alreadyRegistered: false });
	});

	it('flags the email as alreadyRegistered when a user already exists', async () => {
		const { deps, sendClaimLinkEmail, getUserByEmail } = makeDeps();
		getUserByEmail.mockResolvedValue({ id: 'existing-1' });

		const result = successOf(
			await callRequest(mockEvent('taken@user.com', { id: 'guest-1' }), deps)
		);

		const emailInput = sendClaimLinkEmail.mock.calls[0][1];
		expect(emailInput.alreadyRegistered).toBe(true);
		expect(result.alreadyRegistered).toBe(true);
	});

	it('fails with 401 when not signed in', async () => {
		const { deps } = makeDeps();

		const failure = failureOf(await callRequest(mockEvent('claim@user.com', null), deps));

		expect(failure.status).toBe(401);
		expect(deps.issueClaimToken).not.toHaveBeenCalled();
	});

	it('fails with 400 when the account already has an email', async () => {
		const { deps } = makeDeps();

		const failure = failureOf(
			await callRequest(mockEvent('claim@user.com', { id: 'guest-1', email: 'x@y.com' }), deps)
		);

		expect(failure.status).toBe(400);
		expect(deps.issueClaimToken).not.toHaveBeenCalled();
	});

	it.each(['', 'not-an-email'])('fails with 400 for invalid email %s', async (badEmail) => {
		const { deps } = makeDeps();

		const failure = failureOf(await callRequest(mockEvent(badEmail, { id: 'guest-1' }), deps));

		expect(failure.status).toBe(400);
		expect(deps.issueClaimToken).not.toHaveBeenCalled();
	});

	it('fails with 500 when the email cannot be sent', async () => {
		const { deps, sendClaimLinkEmail } = makeDeps();
		sendClaimLinkEmail.mockResolvedValue({ ok: false, reason: 'send-failed' });

		const failure = failureOf(
			await callRequest(mockEvent('claim@user.com', { id: 'guest-1' }), deps)
		);

		expect(failure.status).toBe(500);
	});
});
