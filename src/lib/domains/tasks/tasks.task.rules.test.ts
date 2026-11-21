/**
 * The four task rules as tables: visibility, priority, tags and the two
 * permission predicates. Every expected value comes from the legacy code the
 * rule ports (`tasks/types.ts`, `taskPriority.ts`, `tags.ts`, `auth.ts`,
 * `assignment.ts`) — never from running the rule.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	canMutateTask,
	canReadTask,
	isTaskVisibility,
	nextAssignmentPatch,
	normalizeTags,
	normalizeTaskPriority,
	normalizeTaskVisibility,
	TASK_VISIBILITIES,
	type TaskAssignmentPatch
} from './tasks.task.rules';

describe('normalizeTaskVisibility', () => {
	const cases: [string, unknown, string][] = [
		['public stays public', 'public', 'public'],
		['private stays private', 'private', 'private'],
		['an absent value defaults to public', undefined, 'public'],
		['null defaults to public', null, 'public'],
		['an unknown value defaults to public', 'family', 'public'],
		['the case is significant', 'Private', 'public']
	];
	it.each(cases)('%s', (_label, input, expected) => {
		expect(normalizeTaskVisibility(input)).toBe(expected);
	});

	it('exposes the two visibilities in wire order', () => {
		expect(TASK_VISIBILITIES).toEqual(['public', 'private']);
	});

	it('narrows only the exact values', () => {
		expect(isTaskVisibility('private')).toBe(true);
		expect(isTaskVisibility('Public')).toBe(false);
		expect(isTaskVisibility(1)).toBe(false);
	});
});

describe('normalizeTaskPriority', () => {
	const cases: [string, unknown, string][] = [
		['high stays high', 'high', 'high'],
		['low stays low', 'low', 'low'],
		['normal stays normal', 'normal', 'normal'],
		['an unknown word is normal', 'urgent', 'normal'],
		['an absent value is normal', undefined, 'normal'],
		['null is normal', null, 'normal'],
		['the case is significant', 'HIGH', 'normal']
	];
	it.each(cases)('%s', (_label, input, expected) => {
		expect(normalizeTaskPriority(input)).toBe(expected);
	});
});

describe('normalizeTags', () => {
	const cases: [string, unknown, string[]][] = [
		['lowers, trims, drops empties and sorts', [' Shopping', 'milk', 'MILK', ' '], ['milk', 'shopping']],
		['keeps a duplicate once', ['a', 'a'], ['a']],
		['a non-array has no tags', 'milk', []],
		['null has no tags', null, []],
		['skips non-string elements', ['ok', 7, null], ['ok']],
		['sorts by code point after normalizing', ['Zed', 'alpha'], ['alpha', 'zed']]
	];
	it.each(cases)('%s', (_label, input, expected) => {
		expect(normalizeTags(input)).toEqual(expected);
	});
});

describe('canReadTask', () => {
	const row = {
		userId: 'owner',
		visibility: 'public',
		assignedTo: null as string | null
	};

	const cases: [string, typeof row, string, boolean][] = [
		['shows a public row to anyone', row, 'sam', true],
		['shows an unknown-visibility row as public', { ...row, visibility: 'family' }, 'sam', true],
		['shows a private row to its owner', { ...row, visibility: 'private' }, 'owner', true],
		['hides a private row from another member', { ...row, visibility: 'private' }, 'sam', false],
		[
			'shows a private row to its assignee while assigned',
			{ ...row, visibility: 'private', assignedTo: 'sam' },
			'sam',
			true
		],
		[
			'hides a private row from an onlooker while it is assigned',
			{ ...row, visibility: 'private', assignedTo: 'sam' },
			'ada',
			false
		]
	];
	it.each(cases)('%s', (_label, task, viewer, expected) => {
		expect(canReadTask(task, viewer)).toBe(expected);
	});
});

describe('canMutateTask', () => {
	const personal = {
		userId: 'owner',
		familyId: null,
		assignedTo: null as string | null,
		assignmentStatus: null as string | null
	};
	const familyTask = { ...personal, familyId: 'family-1' };

	const cases: [string, typeof personal, string, boolean, boolean][] = [
		['lets the owner mutate their personal task', personal, 'owner', false, true],
		[
			'lets a pending assignee mutate a personal task',
			{ ...personal, assignedTo: 'sam', assignmentStatus: 'pending' },
			'sam',
			false,
			true
		],
		[
			'lets an accepted assignee mutate a personal task',
			{ ...personal, assignedTo: 'sam', assignmentStatus: 'accepted' },
			'sam',
			false,
			true
		],
		[
			'denies a stale assignee (no pending/accepted status)',
			{ ...personal, assignedTo: 'sam', assignmentStatus: 'none' },
			'sam',
			true,
			false
		],
		[
			'denies another family member on a PUBLIC personal task',
			personal,
			'sam',
			true,
			false
		],
		['lets a family member mutate a family task', familyTask, 'sam', true, true],
		['denies a non-member on a family task', familyTask, 'sam', false, false],
		[
			'lets a family task assignee mutate without membership',
			{ ...familyTask, assignedTo: 'sam' },
			'sam',
			false,
			true
		],
		['lets the owner mutate a family task', familyTask, 'owner', false, true]
	];
	it.each(cases)('%s', (_label, task, viewer, member, expected) => {
		expect(canMutateTask(task, viewer, member)).toBe(expected);
	});
});

describe('nextAssignmentPatch', () => {
	const cases: [
		string,
		{ assignedTo: string | null },
		string,
		TaskAssignmentPatch,
		TaskAssignmentPatch | null
	][] = [
		['a tags-only edit passes through untouched', { assignedTo: 'sam' }, 'sam', {}, {}],
		[
			'a non-assignee cannot respond at all',
			{ assignedTo: 'sam' },
			'lee',
			{ assignmentStatus: 'accepted' },
			null
		],
		[
			'the current assignee may accept',
			{ assignedTo: 'sam' },
			'sam',
			{ assignmentStatus: 'accepted' },
			{ assignmentStatus: 'accepted' }
		],
		[
			'the current assignee may be released (how a decline is rewritten)',
			{ assignedTo: 'sam' },
			'sam',
			{ assignedTo: null, assignmentStatus: 'none' },
			{ assignedTo: null, assignmentStatus: 'none' }
		],
		[
			'an unreleased accepted row from a non-assignee is refused',
			{ assignedTo: 'lee' },
			'sam',
			{ assignmentStatus: 'accepted' },
			null
		],
		[
			'clearing someone else`s assignment is refused',
			{ assignedTo: 'lee' },
			'sam',
			{ assignedTo: null, assignmentStatus: 'none' },
			null
		]
	];
	it.each(cases)('%s', (_label, task, caller, patch, expected) => {
		expect(nextAssignmentPatch(task, caller, patch)).toEqual(expected);
	});
});
