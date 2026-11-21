/**
 * The composed export document against real Postgres: the envelope and key
 * order, the credential refusal, names-only family members, and the missing-row
 * fault (never an empty document for a person who no longer exists).
 *
 * The `/api` golden already pins the full wire; this pins the composition's two
 * promises the route cannot show on its own.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { families, familyMembers } from '$lib/kernel/db/tables.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { ACCOUNT_EXPORT_KEYS } from './account.export.rules';
import { getAccountExport } from './account.export.service.server';

describe('getAccountExport', () => {
	rollbackTest('composes the legacy envelope and key order for an empty account', async (db) => {
		const user = await seedUser(db);
		const document = await getAccountExport(
			testCtx({ db, now: '2026-11-21T09:00:00.000Z' }),
			{ id: user.id, email: user.email, isAdmin: false, via: 'session' }
		);

		expect(Object.keys(document)).toEqual([...ACCOUNT_EXPORT_KEYS]);
		expect(document.version).toBe(1);
		expect(document.generatedAt).toBe('2026-11-21T09:00:00.000Z');
		expect(document.account).not.toHaveProperty('passwordHash');
		expect(document.settings).toEqual([]);
		expect(document.families).toEqual([]);
	});

	rollbackTest('carries other family members as names only, never richer rows', async (db) => {
		const user = await seedUser(db, { firstName: 'Ada' });
		const other = await seedUser(db, { firstName: 'Bob', lastName: 'Lovelace' });
		const [family] = await db.insert(families).values({ name: 'Lovelace' }).returning();
		await db.insert(familyMembers).values([
			{ userId: user.id, familyId: family.id, role: 'owner', memberType: 'parent' },
			{ userId: other.id, familyId: family.id, role: 'member', memberType: 'member' }
		]);

		const document = await getAccountExport(
			testCtx({ db, now: '2026-11-21T09:00:00.000Z' }),
			{ id: user.id, email: user.email, isAdmin: false, via: 'session' }
		);

		expect(document.families).toHaveLength(1);
		expect(document.families[0].otherMembers).toEqual([
			{ id: other.id, firstName: 'Bob', lastName: 'Lovelace' }
		]);
		expect(document.families[0].membership).toEqual({
			userId: user.id,
			familyId: family.id,
			role: 'owner',
			memberType: 'parent'
		});
	});

	rollbackTest('throws when the user row is missing rather than exporting emptiness', async (db) => {
		await expect(
			getAccountExport(testCtx({ db }), {
				id: 'missing-user',
				email: null,
				isAdmin: false,
				via: 'session'
			})
		).rejects.toThrow(/missing user/);
	});
});
