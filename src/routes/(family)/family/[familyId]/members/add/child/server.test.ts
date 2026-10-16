import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTableName } from 'drizzle-orm';

/**
 * Issue 190 — children data consent. Creating a child member is a real user
 * row, so the parent must explicitly acknowledge parental consent at creation
 * time, and a record of that consent is appended (the #088b pattern: evidence,
 * not a setting — append-only, timestamped, with who and for whom).
 */

interface StubState {
	/** Every insert, as { table, row }, in call order. */
	inserts: { table: string; row: Record<string, unknown> }[];
	/** How many transactions were opened. */
	transactions: number;
	/** Set when a transaction rolled back. */
	rolledBack: boolean;
	/** The existing familyMembers rows the select sees. */
	existingMembers: Record<string, unknown>[];
}

const state = vi.hoisted(
	(): StubState => ({ inserts: [], transactions: 0, rolledBack: false, existingMembers: [] })
);

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted insert/select stub records what the handler would write; the real-Postgres harness is tracked in docs/issues/002.
vi.mock('$lib/server/db', () => {
	const db = {
		insert: (table: unknown) => ({
			values: (row: Record<string, unknown>) => {
				state.inserts.push({ table: getTableName(table as never), row });
				return Promise.resolve([row]);
			}
		}),
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(state.existingMembers)
			})
		}),
		transaction: async (run: (tx: unknown) => Promise<unknown>) => {
			state.transactions += 1;
			try {
				return await run(db);
			} catch (error) {
				state.rolledBack = true;
				throw error;
			}
		}
	};
	return { db };
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- membership/role checks are covered by their own suites.
vi.mock('$lib/server/db/actions/families', () => ({
	getFamilyMemberRole: async () => 'creator'
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- plan limits are a separate service with their own tests.
vi.mock('$lib/server/services/subscriptionService', () => ({
	canAddFamilyMember: async () => ({ allowed: true })
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- email uniqueness has its own suite.
vi.mock('$lib/server/db/actions/users', () => ({
	emailExists: async () => false
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- account creation is exercised end to end elsewhere; here it is scripted.
vi.mock('$lib/server/utils/createNewUser', () => ({
	createNewUser: async (firstName: string, lastName: string, email: string) => ({
		id: 'child-1',
		firstName,
		lastName,
		email
	})
}));

import { POST } from './+server';

type Locals = { user: { id: string } | null };

function post(
	body: Record<string, unknown>,
	locals: Locals = { user: { id: 'parent-1' } }
): Request {
	return new Request('http://localhost/family/f1/members/add/child', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
}

async function run(body: Record<string, unknown>, locals?: Locals) {
	const res = await POST({
		request: post(body, locals),
		locals: locals ?? { user: { id: 'parent-1' } },
		params: { familyId: 'f1' }
	} as never);
	const json = await res.json();
	return { status: res.status, json };
}

const validBody = {
	firstName: 'Mia',
	lastName: 'Nakamura',
	email: 'mia@kids.example.com',
	consentAcknowledged: true
};

function rowsFor(table: string) {
	return state.inserts.filter((one) => one.table === table).map((one) => one.row);
}

beforeEach(() => {
	state.inserts = [];
	state.transactions = 0;
	state.rolledBack = false;
	state.existingMembers = [];
});

describe('child create — parental consent attestation (issue 190)', () => {
	it('refuses without an explicit consent acknowledgment and creates nothing', async () => {
		const { status, json } = await run({ ...validBody, consentAcknowledged: undefined });

		expect(status).toBe(400);
		expect(json.error).toBeTruthy();
		expect(state.inserts).toEqual([]);
	});

	it('refuses a falsy consent acknowledgment (not just a missing field)', async () => {
		const { status } = await run({ ...validBody, consentAcknowledged: false });

		expect(status).toBe(400);
		expect(state.inserts).toEqual([]);
	});

	it('creates the child member and appends a consent record when consent is given', async () => {
		const { status, json } = await run(validBody);

		expect(status).toBe(200);
		expect(json.success).toBe(true);

		const members = rowsFor('familyMembers');
		expect(members).toEqual([
			expect.objectContaining({ userId: 'child-1', familyId: 'f1', memberType: 'child' })
		]);

		const consents = rowsFor('childConsentRecords');
		expect(consents).toHaveLength(1);
		expect(consents[0]).toEqual(
			expect.objectContaining({
				childUserId: 'child-1',
				parentUserId: 'parent-1',
				familyId: 'f1',
				source: 'child-create'
			})
		);
	});

	it('writes the consent record inside the same transaction as the membership row', async () => {
		await run(validBody);

		expect(state.transactions).toBe(1);
		expect(rowsFor('familyMembers')).toHaveLength(1);
		expect(rowsFor('childConsentRecords')).toHaveLength(1);
	});

	it('does not attribute consent to a missing actor', async () => {
		const { status } = await run(validBody, { user: null });

		expect(status).toBe(401);
		expect(state.inserts).toEqual([]);
	});
});
