/**
 * The tasks contract as tables: what each body parses to, the legacy copy a
 * bad body gets, and that a golden-shaped wire row parses. Expected values
 * come from the legacy route logic the schemas reproduce
 * (`src/routes/api/tasks/+server.ts`, `[id]/+server.ts`, `task-categories`,
 * `taskfocus/*`) and from the golden bodies — never from running the service.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { firstIssueMessage, z } from '$lib/kernel/validation/validators';
import {
	FOCUS_COMMAND_INVALID,
	FOCUS_INVALID_JSON,
	FOCUS_TASK_ID_INVALID,
	FOCUS_TASK_ID_REQUIRED,
	FocusCommandBody,
	FocusSessionEndBody,
	FocusSessionStartBody,
	TASK_CATEGORY_NAME_REQUIRED,
	TASK_CATEGORY_NAME_TOO_LONG,
	TASK_CATEGORY_NOT_STRING,
	TASK_CATEGORY_TOO_LONG,
	TASK_COMPLETED_AT_DIRECT,
	TASK_INVALID_DUEDATE,
	TASK_INVALID_EVENT_ID,
	TASK_INVALID_FOCUS_MINUTES,
	TASK_INVALID_FOCUS_STARTED_AT,
	TASK_INVALID_RECURRENCE_FREQUENCY,
	TASK_INVALID_RECURRENCE_INTERVAL,
	TASK_INVALID_VISIBILITY,
	TASK_NOTES_NOT_STRING,
	TASK_TITLE_REQUIRED,
	TaskCategoryNameBody,
	TaskCreateBody,
	TaskListRowWire,
	TaskUpdateBody
} from './tasks.contract';

function firstMessage(schema: z.ZodType, input: unknown): string | undefined {
	const result = schema.safeParse(input);
	return result.success ? undefined : firstIssueMessage(result.error);
}

describe('TaskCreateBody', () => {
	it('fills the defaults a bare title needs', () => {
		expect(TaskCreateBody.parse({ title: '  Buy milk  ' })).toEqual({
			title: 'Buy milk',
			notes: null,
			dueDate: null,
			eventId: null,
			familyId: undefined,
			assignedTo: undefined,
			visibility: 'public',
			priority: 'normal',
			recurrenceFrequency: null,
			recurrenceInterval: undefined,
			tags: undefined,
			focusMinutes: null,
			focusStartedAt: null,
			category: null
		});
	});

	it('parses the golden create body without changing what the route stored', () => {
		const parsed = TaskCreateBody.parse({
			title: 'Buy milk',
			notes: ' 2 litres ',
			dueDate: '2026-02-01T10:00:00.000Z',
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 2.7,
			tags: [' Shopping', 'milk', 'MILK', ' '],
			category: 'Errands',
			focusMinutes: 30,
			focusStartedAt: null
		});
		expect(parsed.recurrenceInterval).toBe(2);
		expect(parsed.category).toBe('Errands');
		expect(parsed.focusMinutes).toBe(30);
		expect(parsed.focusStartedAt).toBeNull();
		// Tags are normalized at the boundary: lowercased, trimmed, deduped, sorted.
		expect(parsed.tags).toEqual(['milk', 'shopping']);
		// Notes are stored verbatim — the wire does not trim them.
		expect(parsed.notes).toBe(' 2 litres ');
	});

	it('silently nulls an unknown frequency instead of refusing it', () => {
		expect(TaskCreateBody.parse({ title: 'Hourly', recurrenceFrequency: 'hourly' }).recurrenceFrequency).toBeNull();
	});

	it('reads absent/null/empty dueDate and eventId as none, whitespace ids too', () => {
		const parsed = TaskCreateBody.parse({ title: 'X', dueDate: '', eventId: '   ' });
		expect(parsed.dueDate).toBeNull();
		expect(parsed.eventId).toBeNull();
	});

	it('keeps an explicit null familyId personal and an absent one undefined', () => {
		expect(TaskCreateBody.parse({ title: 'X' }).familyId).toBeUndefined();
		expect(TaskCreateBody.parse({ title: 'X', familyId: null }).familyId).toBeNull();
	});

	const bad: [string, unknown, string][] = [
		['a missing title', {}, TASK_TITLE_REQUIRED],
		['a blank title', { title: '   ' }, TASK_TITLE_REQUIRED],
		['a non-object body', [], TASK_TITLE_REQUIRED],
		['an unparseable dueDate', { title: 'X', dueDate: 'not-a-date' }, TASK_INVALID_DUEDATE],
		['a numeric dueDate', { title: 'X', dueDate: 7 }, TASK_INVALID_DUEDATE],
		['a numeric eventId', { title: 'X', eventId: 7 }, TASK_INVALID_EVENT_ID],
		['an explicit null visibility', { title: 'X', visibility: null }, TASK_INVALID_VISIBILITY],
		['an unknown visibility', { title: 'X', visibility: 'family' }, TASK_INVALID_VISIBILITY],
		['a negative focusMinutes', { title: 'X', focusMinutes: -1 }, TASK_INVALID_FOCUS_MINUTES],
		['a fractional focusMinutes', { title: 'X', focusMinutes: 1.5 }, TASK_INVALID_FOCUS_MINUTES],
		['a string focusMinutes', { title: 'X', focusMinutes: '30' }, TASK_INVALID_FOCUS_MINUTES],
		['an unparseable focusStartedAt', { title: 'X', focusStartedAt: 'not-a-date' }, TASK_INVALID_FOCUS_STARTED_AT],
		['a numeric focusStartedAt', { title: 'X', focusStartedAt: 42 }, TASK_INVALID_FOCUS_STARTED_AT],
		['a numeric category', { title: 'X', category: 7 }, TASK_CATEGORY_NOT_STRING],
		['an over-long category', { title: 'X', category: 'x'.repeat(81) }, TASK_CATEGORY_TOO_LONG],
		['a truthy non-string notes (Q-061)', { title: 'X', notes: 42 }, TASK_NOTES_NOT_STRING]
	];
	it.each(bad)('answers %s with its legacy copy', (_label, body, message) => {
		expect(firstMessage(TaskCreateBody, body)).toBe(message);
	});

	it('still reads a FALSY non-string notes as none (legacy `|| null`)', () => {
		expect(TaskCreateBody.parse({ title: 'X', notes: 0 }).notes).toBeNull();
		expect(TaskCreateBody.parse({ title: 'X', notes: false }).notes).toBeNull();
	});
});

describe('TaskUpdateBody', () => {
	it('parses an empty patch with no dispatch flag set', () => {
		const parsed = TaskUpdateBody.parse({});
		expect(parsed.undoComplete).toBe(false);
		expect(parsed.advanceToNext).toBe(false);
		expect(parsed.toggleComplete).toBe(false);
		expect(parsed.previousDueDate).toBeNull();
		expect(parsed.title).toBeUndefined();
		expect(parsed.dueDate).toBeUndefined();
		expect(parsed.focusMinutes).toBeUndefined();
		expect(parsed.focusStartedAt).toBeUndefined();
		expect(parsed.category).toBeUndefined();
		expect(parsed.assignedTo).toBeUndefined();
	});

	it('treats focusMinutes null as unchanged and a number as an overwrite', () => {
		expect(TaskUpdateBody.parse({ focusMinutes: null }).focusMinutes).toBeUndefined();
		expect(TaskUpdateBody.parse({ focusMinutes: 0 }).focusMinutes).toBe(0);
	});

	it('clears focusStartedAt only on an explicit null', () => {
		expect(TaskUpdateBody.parse({ focusStartedAt: null }).focusStartedAt).toBeNull();
		expect(TaskUpdateBody.parse({}).focusStartedAt).toBeUndefined();
		expect(TaskUpdateBody.parse({ focusStartedAt: '2026-03-01T10:00:00Z' }).focusStartedAt).toEqual(
			new Date('2026-03-01T10:00:00Z')
		);
	});

	it('treats category as unchanged when absent and blank as cleared', () => {
		expect(TaskUpdateBody.parse({}).category).toBeUndefined();
		expect(TaskUpdateBody.parse({ category: null }).category).toBeNull();
		expect(TaskUpdateBody.parse({ category: '   ' }).category).toBeNull();
		expect(TaskUpdateBody.parse({ category: '  Errands ' }).category).toBe('Errands');
	});

	it('refuses a whitespace-only title with POST`s copy (Q-054)', () => {
		expect(firstMessage(TaskUpdateBody, { title: '   ' })).toBe(TASK_TITLE_REQUIRED);
		expect(TaskUpdateBody.parse({ title: '  Renamed  ' }).title).toBe('Renamed');
		expect(TaskUpdateBody.parse({ title: 7 }).title).toBeUndefined();
	});

	it('validates dueDate exactly like POST (Q-052)', () => {
		expect(firstMessage(TaskUpdateBody, { dueDate: 'not-a-date' })).toBe(TASK_INVALID_DUEDATE);
		expect(TaskUpdateBody.parse({ dueDate: '2026-01-01T00:00:00Z' }).dueDate).toBe(
			'2026-01-01T00:00:00Z'
		);
		expect(TaskUpdateBody.parse({ dueDate: null }).dueDate).toBeNull();
		expect(TaskUpdateBody.parse({ dueDate: '' }).dueDate).toBeNull();
		expect(TaskUpdateBody.parse({}).dueDate).toBeUndefined();
	});

	it('refuses a raw completedAt whatever its value (Q-051)', () => {
		expect(firstMessage(TaskUpdateBody, { completedAt: '2026-01-01T00:00:00Z' })).toBe(
			TASK_COMPLETED_AT_DIRECT
		);
		expect(firstMessage(TaskUpdateBody, { completedAt: null })).toBe(TASK_COMPLETED_AT_DIRECT);
		expect(TaskUpdateBody.parse({}).completedAt).toBeUndefined();
	});

	it('carries the assignment patch values the route branches on', () => {
		expect(TaskUpdateBody.parse({ assignedTo: null }).assignedTo).toBeNull();
		expect(TaskUpdateBody.parse({}).assignedTo).toBeUndefined();
		expect(TaskUpdateBody.parse({ assignmentStatus: 'declined' }).assignmentStatus).toBe('declined');
		expect(TaskUpdateBody.parse({ assignmentStatus: 'other' }).assignmentStatus).toBeUndefined();
	});

	it('treats a truthy dispatch flag as set (legacy truthiness)', () => {
		expect(TaskUpdateBody.parse({ toggleComplete: 'yes' }).toggleComplete).toBe(true);
		expect(TaskUpdateBody.parse({ undoComplete: 0 }).undoComplete).toBe(false);
	});

	const bad: [string, unknown, string][] = [
		['an unknown frequency', { recurrenceFrequency: 'hourly' }, TASK_INVALID_RECURRENCE_FREQUENCY],
		['a string interval', { recurrenceInterval: '3' }, TASK_INVALID_RECURRENCE_INTERVAL],
		['a null visibility', { visibility: null }, TASK_INVALID_VISIBILITY],
		['a negative focusMinutes', { focusMinutes: -1 }, TASK_INVALID_FOCUS_MINUTES],
		['an unparseable focusStartedAt', { focusStartedAt: 'nope' }, TASK_INVALID_FOCUS_STARTED_AT],
		['a numeric category', { category: 7 }, TASK_CATEGORY_NOT_STRING]
	];
	it.each(bad)('answers %s with its legacy copy', (_label, body, message) => {
		expect(firstMessage(TaskUpdateBody, body)).toBe(message);
	});

	it('nulls a recurrence frequency and its interval', () => {
		const parsed = TaskUpdateBody.parse({ recurrenceFrequency: null });
		expect(parsed.recurrenceFrequency).toBeNull();
		expect(TaskUpdateBody.parse({ recurrenceInterval: null }).recurrenceInterval).toBeUndefined();
	});
});

describe('TaskCategoryNameBody', () => {
	it('trims a valid name', () => {
		expect(TaskCategoryNameBody.parse({ name: '  Deep Work  ' })).toEqual({ name: 'Deep Work' });
	});

	const bad: [string, unknown, string][] = [
		['a missing name', {}, TASK_CATEGORY_NAME_REQUIRED],
		['a blank name', { name: '   ' }, TASK_CATEGORY_NAME_REQUIRED],
		['a numeric name', { name: 7 }, TASK_CATEGORY_NAME_REQUIRED],
		['a non-object body', null, TASK_CATEGORY_NAME_REQUIRED],
		['an over-long name', { name: 'x'.repeat(81) }, TASK_CATEGORY_NAME_TOO_LONG]
	];
	it.each(bad)('answers %s with its legacy copy', (_label, body, message) => {
		expect(firstMessage(TaskCategoryNameBody, body)).toBe(message);
	});
});

describe('FocusCommandBody', () => {
	it('accepts start with the caller`s own task and stop without one', () => {
		expect(FocusCommandBody.parse({ command: 'start', taskId: 'task-1' })).toEqual({
			command: 'start',
			taskId: 'task-1'
		});
		expect(FocusCommandBody.parse({ command: 'stop' })).toEqual({ command: 'stop', taskId: null });
	});

	const bad: [string, unknown, string][] = [
		['an unknown command', { command: 'pause' }, FOCUS_COMMAND_INVALID],
		['an empty taskId', { command: 'stop', taskId: '' }, FOCUS_TASK_ID_INVALID],
		['a numeric taskId', { command: 'stop', taskId: 7 }, FOCUS_TASK_ID_INVALID],
		['start without a task', { command: 'start' }, FOCUS_TASK_ID_REQUIRED]
	];
	it.each(bad)('answers %s with its legacy copy', (_label, body, message) => {
		expect(firstMessage(FocusCommandBody, body)).toBe(message);
	});
});

describe('focus session bodies', () => {
	it('parses a start with no end as an open session', () => {
		expect(
			FocusSessionStartBody.parse({ taskId: 'task-1', startedAt: '2026-03-01T10:00:00Z' })
		).toEqual({ taskId: 'task-1', startedAt: new Date('2026-03-01T10:00:00Z'), endedAt: null });
	});

	const badStarts: [string, unknown, string][] = [
		['a non-object body', [], FOCUS_INVALID_JSON],
		['a missing taskId', { startedAt: '2026-03-01T10:00:00Z' }, 'taskId is required'],
		['a blank taskId', { taskId: '  ', startedAt: '2026-03-01T10:00:00Z' }, 'taskId is required'],
		['a missing startedAt', { taskId: 't' }, 'startedAt is required'],
		['an unparseable startedAt', { taskId: 't', startedAt: 'nope' }, 'Invalid startedAt'],
		['an unparseable endedAt', { taskId: 't', startedAt: '2026-03-01T10:00:00Z', endedAt: 'nope' }, 'Invalid endedAt']
	];
	it.each(badStarts)('answers %s with its legacy copy', (_label, body, message) => {
		expect(firstMessage(FocusSessionStartBody, body)).toBe(message);
	});

	it('parses an end body and refuses a missing or unparseable one', () => {
		expect(FocusSessionEndBody.parse({ endedAt: '2026-03-01T11:00:00Z' }).endedAt).toEqual(
			new Date('2026-03-01T11:00:00Z')
		);
		expect(firstMessage(FocusSessionEndBody, {})).toBe('endedAt is required');
		expect(firstMessage(FocusSessionEndBody, { endedAt: 'nope' })).toBe('Invalid endedAt');
		expect(firstMessage(FocusSessionEndBody, [])).toBe(FOCUS_INVALID_JSON);
	});
});

describe('TaskListRowWire', () => {
	it('accepts a golden-shaped main-list row (Postgres renders for mode:string columns)', () => {
		expect(() =>
			TaskListRowWire.parse({
				id: 't1',
				title: 'Buy milk',
				notes: '2 litres',
				dueDate: '2026-02-01 10:00:00+00',
				completedAt: null,
				archivedAt: null,
				recurrenceFrequency: null,
				recurrenceInterval: null,
				completionCount: 0,
				assignedTo: null,
				assignmentStatus: 'none',
				priority: 'high',
				visibility: 'private',
				userId: 'u1',
				familyId: null,
				eventId: null,
				focusMinutes: 12,
				focusStartedAt: null,
				category: 'Errands',
				createdAt: '2026-01-02T00:00:00.000Z',
				tags: ['milk', 'shopping'],
				assigneeFirstName: null,
				assigneeLastName: null,
				eventTitle: null,
				eventStart: null,
				eventCalendarId: null,
				phoneFocusMinutes: 3,
				phoneFocusStartedAt: null
			})
		).not.toThrow();
	});
});
