import { describe, it, expect, vi } from 'vitest';
import { render } from 'svelte/server';
import TasksPage from './+page.svelte';
import TasksMainList from '$lib/components/tasks/TasksMainList.svelte';
import type { TaskRowTask } from '$lib/components/tasks/TaskRow.svelte';
import type { PageData } from './$types';

/**
 * #277: prod auto-filed a 500 "confirmClear is not defined" on
 * /calendar/tasks. 03df161 dropped `confirmClear` from TasksMainList's
 * $props() destructure (it stayed in the Props type, so svelte-check was
 * quiet) and `{#if confirmClear}` threw a ReferenceError during SSR as soon
 * as one completed task was on the list; 825c095 restored four sibling
 * callbacks but not this one (645722a did). The client tests render in
 * jsdom, so nothing exercised the SERVER build — these do.
 */

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/* is framework-injected; no DI seam exists.
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(() => Promise.resolve()) }));

const noTags: string[] = [];

const base = {
	notes: null,
	recurrenceFrequency: null,
	recurrenceInterval: null,
	completionCount: 0,
	assignedTo: null,
	assignmentStatus: 'none',
	priority: 'normal',
	familyId: null,
	visibility: 'private',
	eventId: null,
	eventTitle: null,
	createdAt: '2026-10-01T10:00:00.000Z',
	tags: noTags
};

const open = {
	...base,
	id: 'o1',
	title: 'Pack lunches',
	dueDate: '2026-11-02T04:59:00.000Z',
	completedAt: null,
	userId: 'u1',
	tags: ['school']
};
const recurring = {
	...base,
	id: 'r1',
	title: 'Feed the dog',
	dueDate: '2026-11-02T04:59:00.000Z',
	completedAt: null,
	userId: 'u1',
	recurrenceFrequency: 'daily',
	recurrenceInterval: 1,
	completionCount: 4
};
const assigned = {
	...base,
	id: 'a1',
	title: 'Mow the lawn',
	dueDate: '2026-11-03T04:59:00.000Z',
	completedAt: null,
	userId: 'u2',
	familyId: 'f1',
	visibility: 'public',
	assignedTo: 'u1',
	assignmentStatus: 'accepted',
	priority: 'high',
	creatorFirstName: 'Dad'
};
const done = {
	...base,
	id: 'd1',
	title: 'Wash the car',
	dueDate: null,
	completedAt: '2026-10-31T10:00:00.000Z',
	userId: 'u1'
};
const pending = { ...assigned, id: 'p1', title: 'Take out trash', assignmentStatus: 'pending' };
const requested = {
	...base,
	id: 'q1',
	title: 'Clean room',
	dueDate: '2026-11-04T04:59:00.000Z',
	completedAt: null,
	userId: 'u1',
	familyId: 'f1',
	assignedTo: 'u3',
	assignmentStatus: 'pending',
	assigneeFirstName: 'Sam'
};

/** The loader's `taskLists` shape, as fixtures. */
interface TaskListsFixture {
	tasks: TaskRowTask[];
	myTasks: TaskRowTask[];
	pendingAssignments: TaskRowTask[];
	requestedByMe: TaskRowTask[];
	warnings: string[];
}

interface PageOverrides {
	loadWarnings?: string[];
	taskLists?: TaskListsFixture;
	taskCategories?: { id: string; name: string }[];
}

function pageData(overrides: PageOverrides = {}): PageData {
	const data = {
		user: { id: 'u1', email: 'mom@example.com' },
		userSettings: { timeZone: 'America/Chicago' },
		familyId: 'f1',
		loadWarnings: [],
		familyMembers: [
			{ userId: 'u1', firstName: 'Mom', lastName: 'Smith', email: 'mom@example.com' },
			{ userId: 'u2', firstName: 'Dad', lastName: 'Smith', email: 'dad@example.com' },
			{ userId: 'u3', firstName: 'Sam', lastName: 'Smith', email: 'sam@example.com' }
		],
		taskLists: {
			tasks: [open, recurring, assigned, done, requested],
			myTasks: [open, recurring, assigned, done],
			pendingAssignments: [pending],
			requestedByMe: [requested],
			warnings: []
		},
		...overrides
	};
	// SAFETY: test double — the layout + loader fields the page reads, in the loader's shape.
	return data as never;
}

function mainListProps(confirmClear: boolean, clearBusy: boolean) {
	const noop = () => {};
	return {
		chip: 'all' as const,
		searchQuery: '',
		sortBy: 'urgency' as const,
		tagFilter: '',
		openCount: 3,
		completedCount: 1,
		completedThisWeek: 1,
		filteredOpen: [open, recurring, assigned] satisfies TaskRowTask[],
		filteredCompleted: [done] satisfies TaskRowTask[],
		currentUserId: 'u1',
		busyId: null,
		celebratingId: null,
		confirmDeleteId: null,
		confirmClear,
		clearBusy,
		assigneeName: () => 'Mom Smith',
		onToggle: noop,
		onEdit: noop,
		onRespond: noop,
		onAdvance: noop,
		onDelete: noop,
		onAskDelete: noop,
		onCancelDelete: noop,
		onBeginClear: noop,
		onCancelClear: noop,
		onClearCompleted: noop
	};
}

describe('/calendar/tasks SSR render (#277)', () => {
	it('renders the full page with open, recurring, assigned and completed tasks', () => {
		const { body } = render(TasksPage, { props: { data: pageData() } });

		expect(body).toContain('Pack lunches');
		expect(body).toContain('Feed the dog');
		expect(body).toContain('Wash the car');
		// The completed task brings up the clear action (the #277 path).
		expect(body).toContain('Clear completed');
	});

	it('renders with an empty / degraded load (no lists, warnings)', () => {
		const data = pageData({
			loadWarnings: ['myTasks'],
			taskLists: {
				tasks: [],
				myTasks: [],
				pendingAssignments: [],
				requestedByMe: [],
				warnings: ['tasks+cursor']
			}
		});
		expect(() => render(TasksPage, { props: { data } })).not.toThrow();
	});

	it('TasksMainList SSR: clear-completed idle state', () => {
		const { body } = render(TasksMainList, { props: mainListProps(false, false) });
		expect(body).toContain('Clear completed');
		expect(body).not.toContain('Delete all completed?');
	});

	it('TasksMainList SSR: clear-completed confirm state', () => {
		const { body } = render(TasksMainList, { props: mainListProps(true, false) });
		expect(body).toContain('Delete all completed?');
		expect(body).toContain('Yes, delete');
	});

	it('TasksMainList SSR: clear-completed in flight', () => {
		const { body } = render(TasksMainList, { props: mainListProps(true, true) });
		expect(body).toContain('Deleting…');
	});

	// #280: category chips + the Categories manager render on the server, with
	// and without the loader's list (an older cached payload has none).
	it('renders category chips and the Categories section', () => {
		const lunch = { ...open, category: 'School' };
		const data = pageData({
			taskCategories: [
				{ id: 'c1', name: 'School' },
				{ id: 'c2', name: 'Home' }
			],
			taskLists: {
				tasks: [lunch, done],
				myTasks: [lunch, { ...done, category: 'Home' }],
				pendingAssignments: [],
				requestedByMe: [],
				warnings: []
			}
		});
		const { body } = render(TasksPage, { props: { data } });
		expect(body).toContain('data-slot="category"');
		expect(body).toContain('School');
		expect(body).toContain('Categories · 2');
	});

	it('renders without a taskCategories field', () => {
		const data = pageData();
		// SAFETY: test double — drop the field to mimic a payload from before #280.
		delete (data as { taskCategories?: unknown }).taskCategories;
		const { body } = render(TasksPage, { props: { data } });
		expect(body).toContain('Categories · 0');
	});
});
