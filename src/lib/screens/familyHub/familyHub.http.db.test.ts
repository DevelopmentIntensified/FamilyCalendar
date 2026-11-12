/**
 * Golden wire contract for `GET /api/families/{id}/tasks` (G11) — the Family
 * Task Board as Android and the `/family/tasks` page read it. Written against
 * the route as it is today and kept unchanged by the port
 * (docs/rewrite/playbooks/characterize-endpoints.md).
 *
 * Runs in committed mode because the legacy handler writes through the `db`
 * singleton: `truncateAll` before every test.
 *
 * Doc: src/lib/screens/familyHub/README.md#how-to-test
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
	families,
	familyMembers,
	taskCategories,
	taskTags,
	tasks
} from '$lib/kernel/db/tables.server';
import { invoke } from '$lib/kernel/testing/invokeHandlers.server';
import { seedUser } from '$lib/kernel/testing/seedRows.server';
import { testCtx } from '$lib/kernel/testing/testCtx.server';
import { testDb, truncateAll } from '$lib/kernel/testing/testDb.server';
// Import the ROUTE module, not the legacy service: after the port the route
// re-exports the new handler, so this import never changes.
import { GET as getFamilyTasks } from '../../../routes/api/families/[id]/tasks/+server';

const ctx = () => testCtx({ db: testDb() });

/** Legacy timestamp columns serialize through `json()` as ISO strings. */
const isoDate = () => expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/);

function jsonObject(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error(`expected a JSON object, got ${JSON.stringify(value)}`);
	}
	return value as Record<string, unknown>;
}

/**
 * Two families, one roster and a board with one family Task, one public
 * personal Task and one private personal Task. The private personal row lives
 * here to prove the Public tab's own visibility filter (issue 019); a private
 * *Family* Task is deliberately not seeded because M-tasks changes that answer
 * under Q-005a.
 */
async function seedBoard() {
	const db = testDb();
	const ann = await seedUser(db, { firstName: 'Ann', lastName: 'Lee' });
	const bob = await seedUser(db, { firstName: 'Bob', lastName: 'Roy' });
	await db.insert(families).values([
		{
			id: 'fam-old',
			name: 'Old Home',
			color: '#c45e38',
			createdAt: new Date('2025-01-01T00:00:00Z')
		},
		{
			id: 'fam-new',
			name: 'New Home',
			color: null,
			createdAt: new Date('2026-01-01T00:00:00Z')
		}
	]);
	await db.insert(familyMembers).values([
		{ userId: ann.id, familyId: 'fam-old', role: 'creator', memberType: 'parent' },
		{ userId: bob.id, familyId: 'fam-old', role: 'member', memberType: 'child' }
	]);
	await db.insert(tasks).values([
		{
			id: 'task-family',
			title: 'Mow the lawn',
			userId: ann.id,
			familyId: 'fam-old',
			assignedTo: bob.id,
			assignmentStatus: 'accepted',
			category: 'Garden',
			createdAt: new Date('2026-01-02T00:00:00Z')
		},
		{
			id: 'task-public',
			title: 'Piano practice',
			userId: bob.id,
			familyId: null,
			visibility: 'public',
			createdAt: new Date('2026-01-03T00:00:00Z')
		},
		{
			id: 'task-private',
			title: 'Diary',
			userId: bob.id,
			familyId: null,
			visibility: 'private',
			createdAt: new Date('2026-01-04T00:00:00Z')
		}
	]);
	await db.insert(taskTags).values({ taskId: 'task-family', name: 'garden' });
	await db.insert(taskCategories).values([
		{ id: 'cat-errand', userId: ann.id, name: 'Errands' },
		{ id: 'cat-home', userId: ann.id, name: 'Home' },
		{ id: 'cat-bob', userId: bob.id, name: 'Music' }
	]);
	return { ann, bob };
}

describe('GET /api/families/{id}/tasks', () => {
	beforeEach(truncateAll);

	it('answers 401 {"error":"Unauthorized"} when signed out', async () => {
		const res = await invoke(getFamilyTasks, {
			ctx: ctx(),
			params: { id: 'fam-old' },
			path: '/api/families/fam-old/tasks'
		});
		expect(res.status).toBe(401);
		expect(res.body).toEqual({ error: 'Unauthorized' });
	});

	it('404 for a non-member — the same answer as a missing family', async () => {
		const { ann } = await seedBoard();
		const nonMember = await invoke(getFamilyTasks, {
			ctx: ctx(),
			user: ann,
			params: { id: 'fam-new' },
			path: '/api/families/fam-new/tasks'
		});
		const missing = await invoke(getFamilyTasks, {
			ctx: ctx(),
			user: ann,
			params: { id: 'fam-missing' },
			path: '/api/families/fam-missing/tasks'
		});
		expect(nonMember.status).toBe(404);
		expect(nonMember.body).toEqual({ error: 'Family not found' });
		expect(missing.status).toBe(404);
		expect(missing.body).toEqual({ error: 'Family not found' });
	});

	it("answers with that family's board and nothing else", async () => {
		const { ann, bob } = await seedBoard();
		const res = await invoke(getFamilyTasks, {
			ctx: ctx(),
			user: ann,
			params: { id: 'fam-old' },
			path: '/api/families/fam-old/tasks'
		});
		expect(res.status).toBe(200);
		const body = jsonObject(res.body);
		expect(Object.keys(body).sort()).toEqual([
			'familyRoster',
			'publicTasks',
			'taskCategories',
			'tasks'
		]);

		expect(body.tasks).toEqual([
			{
				id: 'task-family',
				title: 'Mow the lawn',
				notes: null,
				dueDate: null,
				completedAt: null,
				archivedAt: null,
				recurrenceFrequency: null,
				recurrenceInterval: null,
				completionCount: 0,
				assignedTo: bob.id,
				assignmentStatus: 'accepted',
				priority: 'normal',
				visibility: 'public',
				focusMinutes: null,
				focusStartedAt: null,
				category: 'Garden',
				assigneeFirstName: 'Bob',
				assigneeLastName: 'Roy',
				userId: ann.id,
				familyId: 'fam-old',
				eventId: null,
				createdAt: isoDate(),
				eventTitle: null,
				eventStart: null,
				creatorFirstName: 'Ann',
				tags: ['garden']
			}
		]);

		// The Public tab: another member's public personal Task; the private one
		// must not appear (issue 019 — the query owns that filter).
		expect(body.publicTasks).toEqual([
			{
				id: 'task-public',
				title: 'Piano practice',
				notes: null,
				dueDate: null,
				completedAt: null,
				archivedAt: null,
				recurrenceFrequency: null,
				recurrenceInterval: null,
				completionCount: 0,
				assignedTo: null,
				assignmentStatus: 'none',
				priority: 'normal',
				visibility: 'public',
				focusMinutes: null,
				focusStartedAt: null,
				category: null,
				assigneeFirstName: null,
				assigneeLastName: null,
				userId: bob.id,
				familyId: null,
				eventId: null,
				createdAt: isoDate(),
				eventTitle: null,
				eventStart: null,
				creatorFirstName: 'Bob',
				tags: []
			}
		]);

		expect(body.familyRoster).toHaveLength(2);
		expect(body.familyRoster).toEqual(
			expect.arrayContaining([
				{
					userId: ann.id,
					firstName: 'Ann',
					lastName: 'Lee',
					email: ann.email,
					role: 'creator',
					memberType: 'parent'
				},
				{
					userId: bob.id,
					firstName: 'Bob',
					lastName: 'Roy',
					email: bob.email,
					role: 'member',
					memberType: 'child'
				}
			])
		);

		// The viewer's own category options, name-sorted; another member's list
		// never leaks into the editor's suggestions (#280).
		expect(body.taskCategories).toEqual([
			{ id: 'cat-errand', name: 'Errands' },
			{ id: 'cat-home', name: 'Home' }
		]);
	});

	it('reads the family named by the id, never the oldest (#098)', async () => {
		const { ann } = await seedBoard();
		await testDb().insert(familyMembers).values({
			userId: ann.id,
			familyId: 'fam-new',
			role: 'member',
			memberType: 'parent'
		});
		await testDb().insert(tasks).values({
			id: 'task-new',
			title: 'Water plants',
			userId: ann.id,
			familyId: 'fam-new',
			createdAt: new Date('2026-01-05T00:00:00Z')
		});

		const newer = await invoke(getFamilyTasks, {
			ctx: ctx(),
			user: ann,
			params: { id: 'fam-new' },
			path: '/api/families/fam-new/tasks'
		});
		expect(newer.status).toBe(200);
		const newerBody = jsonObject(newer.body);
		expect((newerBody.tasks as { id: string }[]).map((task) => task.id)).toEqual(['task-new']);
		expect(newerBody.familyRoster).toEqual([
			{
				userId: ann.id,
				firstName: 'Ann',
				lastName: 'Lee',
				email: ann.email,
				role: 'member',
				memberType: 'parent'
			}
		]);

		const older = await invoke(getFamilyTasks, {
			ctx: ctx(),
			user: ann,
			params: { id: 'fam-old' },
			path: '/api/families/fam-old/tasks'
		});
		const olderBody = jsonObject(older.body);
		expect((olderBody.tasks as { id: string }[]).map((task) => task.id)).toEqual([
			'task-family'
		]);
	});

	it('is a read: the same GET twice answers the same body', async () => {
		const { ann } = await seedBoard();
		const path = '/api/families/fam-old/tasks';
		const first = await invoke(getFamilyTasks, {
			ctx: ctx(),
			user: ann,
			params: { id: 'fam-old' },
			path
		});
		const second = await invoke(getFamilyTasks, {
			ctx: ctx(),
			user: ann,
			params: { id: 'fam-old' },
			path
		});
		expect(second.status).toBe(first.status);
		expect(second.body).toEqual(first.body);
	});
});
