import { test, expect } from '@playwright/test';
import { db } from '../../src/lib/server/db';
import { calendars, events, familyMembers, families } from '../../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { setupTestUser, teardownTestUser, getSessionCookie } from '../testUtils';
import { createEvent, getEvent } from '../../src/lib/server/db/actions/events';

/**
 * Regression: editing a NON-recurring event and changing its calendar returned
 * 404 "Event not found". Display events (expandEventsForUser) carry a composite
 * VIRTUAL id (`${masterId}~${occurrenceISO}`) even for non-recurring events, and
 * the edit modal resolved the PUT target to that virtual id instead of the real
 * master id, so the server could never find the row. The PUT/DELETE routes now
 * resolve composite ids to the master before DB access.
 */
test.describe('Event calendar change on update', () => {
	async function makeUser(name: string) {
		return setupTestUser({ firstName: 'repro', lastName: name + Date.now() });
	}

	async function makeCalendar(ownerId: string, familyId?: string) {
		const [c] = await db
			.insert(calendars)
			.values(familyId ? { ownerId, familyId } : { ownerId })
			.returning();
		return c.id;
	}

	function uniqueId(prefix: string) {
		return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	}

	async function put(request: any, url: string, email: string, data: any) {
		const cookie = await getSessionCookie(email);
		const res = await request.put(url, {
			headers: { 'Content-Type': 'application/json', Cookie: `${cookie.name}=${cookie.value}` },
			data
		});
		return { status: res.status(), json: await res.json().catch(() => ({})) };
	}

	let userA: any;
	let userB: any;
	let familyId = '';
	const createdIds: string[] = [];

	test.afterEach(async () => {
		for (const id of createdIds) await db.delete(events).where(eq(events.id, id)).catch(() => {});
		if (familyId) {
			await db.delete(familyMembers).where(eq(familyMembers.familyId, familyId)).catch(() => {});
			await db.delete(families).where(eq(families.id, familyId)).catch(() => {});
		}
		if (userA) await teardownTestUser(userA);
		if (userB) await teardownTestUser(userB);
	});

	test('non-recurring event changed to family calendar via composite virtual id succeeds', async ({ request }) => {
		userA = await makeUser('one');
		const personal = await makeCalendar(userA.uid);
		familyId = uniqueId('fam');
		await db.insert(families).values({ id: familyId, name: uniqueId('Repro') });
		await db.insert(familyMembers).values({ familyId, userId: userA.uid, role: 'admin' });
		const family = await makeCalendar(userA.uid, familyId);

		const iso = new Date().toISOString();
		const [ev] = await db
			.insert(events)
			.values({ title: 'OneOff', start: iso, end: null, calendarId: personal, ownerId: userA.uid })
			.returning();
		createdIds.push(ev.id);

		// Client previously sent the composite display id `${id}~${iso}`.
		const r = await put(request, `/api/events/${ev.id}~${iso}`, userA.email, {
			title: 'OneOff', start: iso, end: null, calendarId: family
		});
		expect(r.status).toBe(200);
		expect(r.json.error).toBeUndefined();
		expect((await getEvent(ev.id))?.calendarId).toBe(family);
	});

	test('personal -> family, owner moves own event by real id', async ({ request }) => {
		userA = await makeUser('two');
		const personal = await makeCalendar(userA.uid);
		familyId = uniqueId('fam');
		await db.insert(families).values({ id: familyId, name: uniqueId('Repro') });
		await db.insert(familyMembers).values({ familyId, userId: userA.uid, role: 'admin' });
		const family = await makeCalendar(userA.uid, familyId);

		const now = new Date();
		const [ev] = await db
			.insert(events)
			.values({ title: 'E', start: now.toISOString(), end: null, calendarId: personal, ownerId: userA.uid })
			.returning();
		createdIds.push(ev.id);

		const r = await put(request, `/api/events/${ev.id}`, userA.email, {
			title: 'E', start: now.toISOString(), end: null, calendarId: family
		});
		expect(r.status).toBe(200);
		expect((await getEvent(ev.id))?.calendarId).toBe(family);
	});

	test('family event owned by another member moved family -> own personal', async ({ request }) => {
		userA = await makeUser('adminx');
		userB = await makeUser('memberx');
		familyId = uniqueId('fam');
		await db.insert(families).values({ id: familyId, name: uniqueId('Repro') });
		await db.insert(familyMembers).values({ familyId, userId: userA.uid, role: 'admin' });
		await db.insert(familyMembers).values({ familyId, userId: userB.uid, role: 'member' });
		const family = await makeCalendar(userA.uid, familyId);
		const bPersonal = await makeCalendar(userB.uid);

		const now = new Date();
		const created = await createEvent({
			title: 'FamEv', start: now.toISOString(), end: null, calendarId: family, ownerId: userB.uid
		});
		createdIds.push(created.id);

		const r = await put(request, `/api/events/${created.id}`, userB.email, {
			title: 'FamEv', start: now.toISOString(), end: null, calendarId: bPersonal
		});
		expect(r.status).toBe(200);
		expect((await getEvent(created.id))?.calendarId).toBe(bPersonal);
	});
});
