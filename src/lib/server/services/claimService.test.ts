import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Anonymous Account Claiming flow at the service seam: the route
 * `claim/verify/[token]/+server.ts` delegates to `verifyClaimToken`.
 * Collaborators are injected as stub deps so the full pipeline
 * (phrase → parsed intent → outcome) is verified without a live DB.
 */
import { verifyClaimToken, type ClaimVerifyDeps } from './claimService';

function makeDeps(overrides: Partial<ClaimVerifyDeps> = {}): ClaimVerifyDeps & {
	calls: { merged: unknown[]; claimed: unknown[]; settingsCreated: unknown[] };
} {
	const calls = { merged: [] as unknown[], claimed: [] as unknown[], settingsCreated: [] as unknown[] };
	return {
		peekClaimToken: vi.fn(async () => ({ userId: 'guest-1', email: 'guest@example.com' })),
		consumeClaimToken: vi.fn(async () => true),
		getUserByEmail: vi.fn(async () => undefined),
		mergeGuestIntoUser: vi.fn(async (...args: unknown[]) => {
			calls.merged.push(args);
			return { events: 1, tasks: 0 };
		}),
		claimEmailForUser: vi.fn(async (...args: unknown[]) => {
			calls.claimed.push(args);
		}),
		getUserSettings: vi.fn(async () => ({ userId: 'guest-1' })),
		createUserSettings: vi.fn(async (...args: unknown[]) => {
			calls.settingsCreated.push(args);
		}),
		...overrides,
		calls
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('verifyClaimToken', () => {
	it('returns invalid when the token does not exist', async () => {
		const deps = makeDeps({ peekClaimToken: async () => null });

		const result = await verifyClaimToken('bad-token', 'guest-1', deps);

		expect(result).toEqual({ outcome: 'invalid' });
		expect(deps.consumeClaimToken).not.toHaveBeenCalled();
	});

	it('returns invalid without burning the token when owned by a different user', async () => {
		const deps = makeDeps({ peekClaimToken: async () => ({ userId: 'other-guest', email: 'guest@example.com' }) });

		const result = await verifyClaimToken('token', 'guest-1', deps);

		expect(result).toEqual({ outcome: 'invalid' });
		expect(deps.consumeClaimToken).not.toHaveBeenCalled();
	});

	it('returns invalid when the atomic consume loses the race', async () => {
		const deps = makeDeps({ consumeClaimToken: async () => false });

		const result = await verifyClaimToken('token', 'guest-1', deps);

		expect(result).toEqual({ outcome: 'invalid' });
		expect(deps.claimEmailForUser).not.toHaveBeenCalled();
		expect(deps.mergeGuestIntoUser).not.toHaveBeenCalled();
	});

	it('claims the email and backfills settings for a fresh Anonymous Account', async () => {
		const deps = makeDeps({ getUserSettings: async () => undefined });

		const result = await verifyClaimToken('token', 'guest-1', deps);

		expect(result).toEqual({ outcome: 'claimed', userId: 'guest-1' });
		expect(deps.calls.claimed).toEqual([['guest-1', 'guest@example.com']]);
		expect(deps.mergeGuestIntoUser).not.toHaveBeenCalled();
		expect(deps.calls.settingsCreated).toEqual([
			[{ userId: 'guest-1', timeZone: 'UTC' }]
		]);
	});

	it('skips the settings backfill when settings already exist', async () => {
		const deps = makeDeps();

		const result = await verifyClaimToken('token', 'guest-1', deps);

		expect(result).toEqual({ outcome: 'claimed', userId: 'guest-1' });
		expect(deps.calls.settingsCreated).toEqual([]);
	});

	it('merges into the existing account on Claim Conflict without claiming the email', async () => {
		const deps = makeDeps({
			getUserByEmail: async () => ({ id: 'user-2' })
		});

		const result = await verifyClaimToken('token', 'guest-1', deps);

		expect(result).toEqual({ outcome: 'merged', targetUserId: 'user-2' });
		expect(deps.calls.merged).toEqual([['guest-1', 'user-2']]);
		expect(deps.claimEmailForUser).not.toHaveBeenCalled();
		expect(deps.createUserSettings).not.toHaveBeenCalled();
	});

	it('claims normally when the email already belongs to the same user', async () => {
		const deps = makeDeps({
			getUserByEmail: async () => ({ id: 'guest-1' })
		});

		const result = await verifyClaimToken('token', 'guest-1', deps);

		expect(result).toEqual({ outcome: 'claimed', userId: 'guest-1' });
		expect(deps.mergeGuestIntoUser).not.toHaveBeenCalled();
		expect(deps.claimEmailForUser).toHaveBeenCalledWith('guest-1', 'guest@example.com');
	});
});
