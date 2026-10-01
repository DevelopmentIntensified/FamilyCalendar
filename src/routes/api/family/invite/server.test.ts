import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Issue 124 — one default for how many people a join code admits.
 *
 * Minting used to answer this question twice with two numbers: the action
 * (`generateInviteCode`) defaulted to one use, and this route clamped a missing
 * `maxUses` to ten. The same link then meant two different things depending on
 * which door it came out of — the same bug class #098 was filed for, two places
 * deciding one thing.
 *
 * The agreement itself is a property of the source, not of a call: this route
 * can only pass the action's exported default if it imports it. So that is what
 * the first test reads off the file, and the behavioural tests pin what the
 * route does with a body that does and does not carry a count.
 */


/** What the stubbed action is handed, recorded per call. */
interface MintOptions {
	maxUses?: number;
	expiresInDays?: number;
}

const state = vi.hoisted(() => ({
	roles: new Map<string, string | null>(),
	// SAFETY: every recorded value is a MintOptions, which is what the action
	// receives.
	options: [] as MintOptions[]
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- the families module is only partially stubbed; the constant under test must stay real.
vi.mock('$lib/server/db/actions/families', async () => {
	// The real module, with only the two calls this handler makes replaced — so
	// `DEFAULT_INVITE_MAX_USES` is the real value, not a copy in the test.
	const actual =
		await vi.importActual<typeof import('$lib/server/db/actions/families')>(
			'$lib/server/db/actions/families'
		);
	return {
		...actual,
		getFamilyMemberRole: async (_userId: string, familyId: string) =>
			state.roles.get(familyId) ?? null,
		generateInviteCode: async (
			familyId: string,
			options: { maxUses?: number; expiresInDays?: number }
		) => {
			state.options.push(options);
			return { code: `code-${familyId}`, familyId };
		}
	};
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- the real families module is imported for its constant; no query is ever issued.
vi.mock('$lib/server/db', () => ({ db: {} }));

import { DEFAULT_INVITE_MAX_USES } from '$lib/server/db/actions/families';
import { POST } from './+server';

/** What the handler answers with: a status and a JSON body. */
interface HandlerAnswer {
	status?: number;
	body: { error?: string; code?: string; inviteUrl?: string };
}

/** SAFETY: the handler reads locals.user and the JSON body; both are built here. */
const post = POST as unknown as (event: {
	request: Request;
	locals: { user: { id: string } | null };
}) => Promise<HandlerAnswer>;

/** The body this route accepts, as the tests send it. */
interface InviteRequestBody {
	familyId?: string;
	maxUses?: number;
	expiresInDays?: number;
}

function json(body: InviteRequestBody): Request {
	return new Request('http://localhost/api/family/invite', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

beforeEach(() => {
	state.roles = new Map([['fam-1', 'creator']]);
	state.options = [];
});

describe('POST /api/family/invite — the code default is declared once (issue 124)', () => {
	it('takes its fallback from the action default, never from a second literal', () => {
		const src = readFileSync(join(process.cwd(), 'src/routes/api/family/invite/+server.ts'), 'utf8');

		expect(src).toContain('DEFAULT_INVITE_MAX_USES');
		// A bare number in the clamp is the whole bug: it is a second answer to
		// a question the action already answers.
		expect(src).not.toMatch(/clampCount\(\s*maxUses\s*,\s*1\s*,\s*50\s*,\s*\d/);
	});

	it('mints with the action default when the body says nothing about max uses', async () => {
		await post({ request: json({ familyId: 'fam-1' }), locals: { user: { id: 'u1' } } });

		expect(state.options).toHaveLength(1);
		expect(state.options.at(-1)?.maxUses).toBe(DEFAULT_INVITE_MAX_USES);
	});

	it('passes the requested count through instead of the default', async () => {
		await post({
			request: json({ familyId: 'fam-1', maxUses: 3 }),
			locals: { user: { id: 'u1' } }
		});

		expect(state.options.at(-1)?.maxUses).toBe(3);
	});

	it('refuses a plain member, so "who may mint" is one rule in two places', async () => {
		state.roles.set('fam-1', 'member');
		const res = await post({
			request: json({ familyId: 'fam-1' }),
			locals: { user: { id: 'u1' } }
		});

		expect(res.status).toBe(403);
		expect(state.options).toEqual([]);
	});
});