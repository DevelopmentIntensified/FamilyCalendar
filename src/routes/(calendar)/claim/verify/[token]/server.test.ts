import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/services/claimService', () => ({
	peekClaimToken: vi.fn(),
	consumeClaimToken: vi.fn()
}));

vi.mock('$lib/server/db/actions/users', () => ({
	claimEmailForUser: vi.fn(),
	getUserByEmail: vi.fn()
}));

vi.mock('$lib/server/db/actions/userSettings', () => ({
	getUserSettings: vi.fn(),
	createUserSettings: vi.fn()
}));

vi.mock('$lib/server/auth', () => ({
	lucia: {
		createSession: vi.fn(),
		createSessionCookie: vi.fn()
	},
	setSessionCookie: vi.fn()
}));

vi.mock('$lib/server/services/guestMergeService', () => ({
	mergeGuestIntoUser: vi.fn()
}));

import { GET } from './+server';

function mockEvent(userId: string) {
	return {
		locals: { user: { id: userId } },
		params: { token: 'tok-1' },
		cookies: { set: vi.fn() }
	} as any;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('GET /claim/verify/[token]', () => {
	it('auto-merges the guest into an already-registered account and signs in as it', async () => {
		const { peekClaimToken, consumeClaimToken } = await import('$lib/server/services/claimService');
		const { getUserByEmail, claimEmailForUser } = await import('$lib/server/db/actions/users');
		const { mergeGuestIntoUser } = await import('$lib/server/services/guestMergeService');
		const { lucia, setSessionCookie } = await import('$lib/server/auth');

		vi.mocked(peekClaimToken).mockResolvedValue({ userId: 'guest-1', email: 'taken@example.com' } as any);
		vi.mocked(consumeClaimToken).mockResolvedValue(true);
		vi.mocked(getUserByEmail).mockResolvedValue({ id: 'existing-9' } as any);
		vi.mocked(mergeGuestIntoUser).mockResolvedValue({ events: 3, tasks: 2 } as any);
		vi.mocked(lucia.createSession).mockResolvedValue({ id: 'session-9' } as any);
		vi.mocked(lucia.createSessionCookie).mockReturnValue({ value: 'auth_session=s9; Path=/' } as any);

		const event = mockEvent('guest-1');
		const redirect = (await GET(event).catch((e) => e));

		// Ownership proven → guest data merged into the existing account.
		expect(mergeGuestIntoUser).toHaveBeenCalledWith('guest-1', 'existing-9');
		// Not claimed for the guest itself.
		expect(claimEmailForUser).not.toHaveBeenCalled();
		// Signed into the existing account.
		expect(lucia.createSession).toHaveBeenCalledWith('existing-9', {});
		expect(setSessionCookie).toHaveBeenCalled();
		// Redirects to the calendar with success flag.
		expect(redirect.status).toBe(302);
		expect(redirect.location).toContain('/calendar');
	});

	it('still claims the email for the guest when it is not already registered', async () => {
		const { peekClaimToken, consumeClaimToken } = await import('$lib/server/services/claimService');
		const { getUserByEmail, claimEmailForUser } = await import('$lib/server/db/actions/users');
		const { mergeGuestIntoUser } = await import('$lib/server/services/guestMergeService');
		const { getUserSettings, createUserSettings } = await import('$lib/server/db/actions/userSettings');

		vi.mocked(peekClaimToken).mockResolvedValue({ userId: 'guest-1', email: 'new@example.com' } as any);
		vi.mocked(consumeClaimToken).mockResolvedValue(true);
		vi.mocked(getUserByEmail).mockResolvedValue(undefined as any);
		vi.mocked(getUserSettings).mockResolvedValue(undefined as any);

		const redirect = await GET(mockEvent('guest-1')).catch((e) => e);

		expect(mergeGuestIntoUser).not.toHaveBeenCalled();
		expect(claimEmailForUser).toHaveBeenCalledWith('guest-1', 'new@example.com');
		expect(createUserSettings).toHaveBeenCalled();
		expect(redirect.status).toBe(302);
		expect(redirect.location).toContain('/calendar');
	});
});
