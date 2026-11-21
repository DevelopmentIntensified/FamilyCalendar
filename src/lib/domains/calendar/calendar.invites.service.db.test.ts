/**
 * The calendar invites service against real Postgres: the roster read the pure
 * `resolveInvites` rule cannot do itself. Each test runs in `rollbackTest`.
 *
 * Expected values come from the legacy `resolveEventInvites`
 * (`src/lib/server/utils/eventInvites.ts`) and its pure twin
 * `calendar.invites.rules.ts`: structured `attendees` win, a known member id
 * becomes a member invite, an unrecognized id is dropped (never a guest name,
 * #274), and guests are always optional.
 *
 * Doc: ./README.md#how-to-test
 */
import { describe, expect } from 'vitest';
import { actorFromUser } from '$lib/kernel/ctx/actor';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { rollbackTest } from '$lib/kernel/testing/testDb.server';
import { seedFamily, seedMembership } from '$lib/domains/family/family.fixtures.server';
import { resolveEventInvites } from './calendar.invites.service.server';

const NOW = '2026-03-01T09:00:00.000Z';
const FAMILY = 'fam-1';

describe('resolveEventInvites', () => {
	rollbackTest('turns a known member into a member invite and drops an unknown id', async (db) => {
		const viewer = await seedUser(db);
		const partner = await seedUser(db);
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, viewer.id, 'creator', 'parent', db);
		await seedMembership(FAMILY, partner.id, 'member', 'member', db);

		const invites = await resolveEventInvites(
			testCtx({ db, now: NOW }),
			actorFromUser(viewer, 'session'),
			[
				{ value: partner.id, isUser: true, inviteType: 'required' },
				{ value: 'nobody-known', isUser: true },
				{ value: 'Grandma', isUser: false }
			]
		);

		expect(invites).toEqual([
			{ userId: partner.id, inviteType: 'required' },
			{ name: 'Grandma', inviteType: 'optional' }
		]);
	});

	rollbackTest('promotes a member id sent as a guest name and keeps plain names as guests', async (db) => {
		const viewer = await seedUser(db);
		const partner = await seedUser(db);
		await seedFamily(FAMILY, { name: 'Riveras' }, db);
		await seedMembership(FAMILY, viewer.id, 'creator', 'parent', db);
		await seedMembership(FAMILY, partner.id, 'member', 'member', db);

		const invites = await resolveEventInvites(
			testCtx({ db, now: NOW }),
			actorFromUser(viewer, 'session'),
			['Grandma', partner.id]
		);

		expect(invites).toEqual([
			{ name: 'Grandma', inviteType: 'optional' },
			{ userId: partner.id, inviteType: 'optional' }
		]);
	});

	rollbackTest('without a family only the caller themself is a known member', async (db) => {
		const viewer = await seedUser(db);
		const stranger = await seedUser(db);

		const invites = await resolveEventInvites(
			testCtx({ db, now: NOW }),
			actorFromUser(viewer, 'session'),
			[
				viewer.id,
				stranger.id,
				'Grandma',
				{ value: viewer.id, isUser: true, inviteType: 'required' }
			]
		);

		expect(invites).toEqual([
			{ userId: viewer.id, inviteType: 'optional' },
			{ name: stranger.id, inviteType: 'optional' },
			{ name: 'Grandma', inviteType: 'optional' },
			{ userId: viewer.id, inviteType: 'required' }
		]);
	});

	rollbackTest('answers no invites for an absent, empty or blank payload', async (db) => {
		const viewer = await seedUser(db);
		const ctx = testCtx({ db, now: NOW });
		const actor = actorFromUser(viewer, 'session');

		expect(await resolveEventInvites(ctx, actor, undefined)).toEqual([]);
		expect(await resolveEventInvites(ctx, actor, [])).toEqual([]);
		expect(await resolveEventInvites(ctx, actor, ['   '])).toEqual([]);
	});
});
