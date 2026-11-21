/**
 * The contract: the board's wire body and the five detail form schemas.
 * The task row below is the golden's own shape
 * (`familyHub.http.db.test.ts › answers with that family's board and nothing else`),
 * so a key that drifts from the pinned wire fails here too.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	BoardTaskResponse,
	FamilyBoardParams,
	FamilyBoardResponse,
	RemoveMemberForm,
	SetMemberTypeForm,
	ToggleModuleForm,
	UpdateFamilyForm,
	UpdateRoleForm
} from './familyHub.contract';

const familyTaskWire = {
	id: 'task-family',
	title: 'Mow the lawn',
	notes: null,
	dueDate: null,
	completedAt: null,
	archivedAt: null,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	completionCount: 0,
	assignedTo: 'u_bob',
	assignmentStatus: 'accepted',
	priority: 'normal',
	visibility: 'public',
	focusMinutes: null,
	focusStartedAt: null,
	category: 'Garden',
	assigneeFirstName: 'Bob',
	assigneeLastName: 'Roy',
	userId: 'u_ann',
	familyId: 'fam-old',
	eventId: null,
	createdAt: '2026-01-02T00:00:00.000Z',
	eventTitle: null,
	eventStart: null,
	creatorFirstName: 'Ann',
	tags: ['garden']
};

const personalTaskWire = {
	id: 'task-public',
	title: 'Piano practice',
	notes: null,
	dueDate: '2026-02-01 10:00:00+00',
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
	userId: 'u_bob',
	familyId: null,
	eventId: null,
	createdAt: '2026-01-03T00:00:00.000Z',
	eventTitle: null,
	eventStart: null,
	creatorFirstName: 'Bob',
	tags: []
};

const boardWire = {
	tasks: [familyTaskWire],
	publicTasks: [personalTaskWire],
	familyRoster: [
		{
			userId: 'u_ann',
			firstName: 'Ann',
			lastName: 'Lee',
			email: 'ann@example.com',
			role: 'creator',
			memberType: 'parent'
		}
	],
	taskCategories: [{ id: 'cat-errand', name: 'Errands' }]
};

describe('FamilyBoardResponse', () => {
	it('parses the pinned four-key body unchanged', () => {
		expect(FamilyBoardResponse.parse(boardWire)).toEqual(boardWire);
	});

	it('reads a task row as the queries shape it, nulls and tags included', () => {
		expect(BoardTaskResponse.parse(familyTaskWire)).toEqual(familyTaskWire);
	});

	it('carries timestamps as strings in either serialisation', () => {
		// `dueDate` is a `mode: 'string'` column (Postgres text, space separator)
		// while `createdAt` is a Date `json()` serialises; both are strings.
		expect(BoardTaskResponse.parse(personalTaskWire).dueDate).toBe('2026-02-01 10:00:00+00');
		expect(BoardTaskResponse.parse(familyTaskWire).createdAt).toBe('2026-01-02T00:00:00.000Z');
	});

	it.each<[string, 'task' | 'roster', Record<string, unknown>]>([
		['a tag list that is not a list', 'task', { tags: 'garden' }],
		['notes sent as a number', 'task', { notes: 4 }],
		['a completion count sent as text', 'task', { completionCount: '0' }],
		['a roster role sent as a number', 'roster', { role: 1 }],
		['a roster email sent as a number', 'roster', { email: 7 }]
	])('refuses %s', (_title, target, change) => {
		const wire =
			target === 'task'
				? { ...boardWire, tasks: [{ ...familyTaskWire, ...change }] }
				: { ...boardWire, familyRoster: [{ ...boardWire.familyRoster[0], ...change }] };
		expect(FamilyBoardResponse.safeParse(wire).success).toBe(false);
	});

	it('describes the `{id}` parameter', () => {
		expect(FamilyBoardParams.parse({ id: 'fam-old' })).toEqual({ id: 'fam-old' });
		expect(FamilyBoardParams.safeParse({}).success).toBe(false);
	});
});

describe('the detail form schemas', () => {
	// Legacy `+page.server.ts:47-50` read every field with `formData.get`, so an
	// absent or non-string part became '' (the service's own copy decided the
	// 400) and a repeated key kept its first value.
	it('reads an absent or non-string field as an empty string, and a repeated one as its first value', () => {
		expect(RemoveMemberForm.parse({ userId: 'u_bob' })).toEqual({ userId: 'u_bob' });
		expect(RemoveMemberForm.parse({})).toEqual({ userId: '' });
		expect(RemoveMemberForm.parse({ userId: ['u_a', 'u_b'] })).toEqual({ userId: 'u_a' });
		expect(RemoveMemberForm.parse({ userId: 42 })).toEqual({ userId: '' });
	});

	it("reads the role action's two fields the same way", () => {
		expect(UpdateRoleForm.parse({ userId: 'u_bob', role: 'admin' })).toEqual({
			userId: 'u_bob',
			role: 'admin'
		});
		expect(UpdateRoleForm.parse({})).toEqual({ userId: '', role: '' });
		expect(UpdateRoleForm.parse({ role: 'creator' })).toEqual({ userId: '', role: 'creator' });
	});

	it("reads the Member Type action's two fields the same way", () => {
		expect(SetMemberTypeForm.parse({ userId: 'u_bob', memberType: 'child' })).toEqual({
			userId: 'u_bob',
			memberType: 'child'
		});
		expect(SetMemberTypeForm.parse({})).toEqual({ userId: '', memberType: '' });
	});

	it('treats an empty family name or colour as "unchanged", not as a refusal', () => {
		expect(UpdateFamilyForm.parse({})).toEqual({ name: '', color: '' });
		expect(UpdateFamilyForm.parse({ name: 'New Home' })).toEqual({ name: 'New Home', color: '' });
		expect(UpdateFamilyForm.parse({ color: '#c45e38' })).toEqual({ name: '', color: '#c45e38' });
		expect(UpdateFamilyForm.parse({ name: 'New Home', color: '#c45e38', id: 'x' })).toEqual({
			name: 'New Home',
			color: '#c45e38'
		});
	});

	it.each<[string, unknown, string, boolean]>([
		["only the literal 'true' enables the switch", 'true', 'groceries', true],
		["'false' means off", 'false', 'groceries', false],
		['an absent checkbox means off', undefined, 'groceries', false],
		["a browser's 'on' is not the legacy literal, so it means off", 'on', 'groceries', false],
		['a repeated checkbox reads its first value, as formData.get did', ['true', 'false'], 'groceries', true],
		["a missing module reaches the service's 400", 'true', undefined, true]
	])('reads the module switch: %s', (_title, enabled, module, expectedEnabled) => {
		const form = ToggleModuleForm.parse(module === undefined ? { enabled } : { module, enabled });
		expect(form.enabled).toBe(expectedEnabled);
		if (module === undefined) expect(form.module).toBe('');
	});
});
