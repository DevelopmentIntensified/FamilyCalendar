import { describe, it, expect } from 'vitest';
import {
	DECISION_TYPES,
	NOTIFICATION_TYPES,
	UNKNOWN_TYPE_LABEL,
	isNotificationType,
	toNotificationRow,
	notificationGroup,
	notificationLabel,
	notificationTone,
	notificationGlyph,
	filterNotifications,
	groupNotifications,
	notificationCounts,
	type NotificationRow
} from './notificationTypes';

// `notifications.type` is free text in the DB, so every function here takes a
// plain `string` and must cope with a value nobody wrote.
const UNKNOWN = 'task_completed_v2';

function row(over: Partial<NotificationRow> = {}): NotificationRow {
	return {
		id: 'n1',
		type: 'task_completed',
		rawType: 'task_completed',
		group: 'news',
		actorName: 'Sarah',
		message: 'completed "Weekly meal plan"',
		link: '/calendar/tasks',
		readAt: null,
		createdAt: '2026-09-30T09:00:00.000Z',
		...over
	};
}

describe('isNotificationType', () => {
	it('accepts every type the app writes', () => {
		for (const t of NOTIFICATION_TYPES) expect(isNotificationType(t)).toBe(true);
	});

	it('is exactly the five-member union', () => {
		expect([...NOTIFICATION_TYPES]).toEqual([
			'assignment_pending',
			'assignment_accepted',
			'assignment_declined',
			'task_completed',
			'added_to_family'
		]);
	});

	it('rejects an unrecognised type string', () => {
		expect(isNotificationType(UNKNOWN)).toBe(false);
		expect(isNotificationType('')).toBe(false);
		expect(isNotificationType('Task_Completed')).toBe(false);
	});

	it('rejects non-strings at the boundary', () => {
		expect(isNotificationType(null)).toBe(false);
		expect(isNotificationType(undefined)).toBe(false);
		expect(isNotificationType(3)).toBe(false);
	});
});

describe('notificationGroup — needs you vs just news', () => {
	it('puts only the two asking types in needs-you', () => {
		expect([...DECISION_TYPES]).toEqual(['assignment_pending', 'assignment_declined']);
		expect(notificationGroup('assignment_pending')).toBe('needs_you');
		expect(notificationGroup('assignment_declined')).toBe('needs_you');
	});

	it('puts the other three in news', () => {
		expect(notificationGroup('assignment_accepted')).toBe('news');
		expect(notificationGroup('task_completed')).toBe('news');
		expect(notificationGroup('added_to_family')).toBe('news');
	});

	it('never lets an unrecognised type claim to need a decision', () => {
		expect(notificationGroup(UNKNOWN)).toBe('news');
		expect(notificationGroup('')).toBe('news');
	});
});

describe('notificationLabel', () => {
	it('gives all five a human label', () => {
		expect(notificationLabel('assignment_pending')).toBe('Asked you');
		expect(notificationLabel('assignment_accepted')).toBe('Accepted');
		expect(notificationLabel('assignment_declined')).toBe('Declined');
		expect(notificationLabel('task_completed')).toBe('Completed');
		expect(notificationLabel('added_to_family')).toBe('Added to family');
	});

	it('labels an unrecognised type explicitly rather than echoing the raw string', () => {
		expect(notificationLabel(UNKNOWN)).toBe(UNKNOWN_TYPE_LABEL);
		expect(notificationLabel(UNKNOWN)).not.toBe(UNKNOWN);
	});
});

describe('tone and glyph per type', () => {
	it('gives every known type a non-empty tone and glyph', () => {
		for (const t of NOTIFICATION_TYPES) {
			expect(notificationTone(t)).toMatch(/^bg-/);
			expect(notificationGlyph(t)).not.toBe('');
		}
	});

	it('falls back to a neutral tone and glyph for an unknown type', () => {
		expect(notificationTone(UNKNOWN)).toMatch(/^bg-slate-/);
		expect(notificationGlyph(UNKNOWN)).not.toBe('');
	});
});

describe('toNotificationRow — the server-side type guard', () => {
	const dbRow = {
		id: 'n1',
		type: 'assignment_pending',
		actorName: 'Sarah',
		message: 'asked you to book the climbing wall',
		link: '/calendar/tasks',
		readAt: null,
		createdAt: '2026-09-30T09:00:00.000Z'
	};

	it('narrows a known type and carries the group with it', () => {
		const r = toNotificationRow(dbRow);
		expect(r.type).toBe('assignment_pending');
		expect(r.rawType).toBe('assignment_pending');
		expect(r.group).toBe('needs_you');
		expect(r.link).toBe('/calendar/tasks');
	});

	it('keeps an unrecognised row rather than dropping or crashing on it', () => {
		const r = toNotificationRow({ ...dbRow, type: UNKNOWN });
		expect(r.id).toBe('n1');
		expect(r.type).toBeNull();
		expect(r.rawType).toBe(UNKNOWN);
		expect(r.group).toBe('news');
	});

	it('normalises a null link and readAt instead of leaking nulls into href', () => {
		const r = toNotificationRow({ ...dbRow, link: null, readAt: null });
		expect(r.link).toBeNull();
		expect(r.readAt).toBeNull();
	});
});

describe('filterNotifications', () => {
	const rows = [
		row({ id: 'a', type: 'assignment_pending', rawType: 'assignment_pending', group: 'needs_you' }),
		row({ id: 'b', type: 'task_completed' }),
		row({
			id: 'c',
			type: 'assignment_declined',
			rawType: 'assignment_declined',
			group: 'needs_you',
			readAt: '2026-09-30T10:00:00.000Z'
		})
	];

	it('all keeps every row in source order', () => {
		expect(filterNotifications(rows, 'all').map((r) => r.id)).toEqual(['a', 'b', 'c']);
	});

	it('needs_you keeps only the two decision types', () => {
		expect(filterNotifications(rows, 'needs_you').map((r) => r.id)).toEqual(['a', 'c']);
	});

	it('unread drops anything already read', () => {
		expect(filterNotifications(rows, 'unread').map((r) => r.id)).toEqual(['a', 'b']);
	});
});

describe('groupNotifications', () => {
	it('splits the feed into needs-you and just news', () => {
		const { needsYou, news } = groupNotifications([
			row({ id: 'n1', type: 'task_completed' }),
			row({
				id: 'n2',
				type: 'assignment_pending',
				rawType: 'assignment_pending',
				group: 'needs_you'
			}),
			row({ id: 'n3', type: 'added_to_family' }),
			row({
				id: 'n4',
				type: 'assignment_declined',
				rawType: 'assignment_declined',
				group: 'needs_you'
			})
		]);
		expect(needsYou.map((r) => r.id)).toEqual(['n2', 'n4']);
		expect(news.map((r) => r.id)).toEqual(['n1', 'n3']);
	});

	it('leaves a group empty rather than inventing rows', () => {
		const { needsYou, news } = groupNotifications([row({ id: 'n1', type: 'task_completed' })]);
		expect(needsYou).toEqual([]);
		expect(news).toHaveLength(1);
	});
});

describe('notificationCounts — the filter chips', () => {
	it('counts all / needs you / unread across the loaded feed', () => {
		expect(
			notificationCounts([
				row({ id: 'a', group: 'needs_you' }),
				row({ id: 'b' }),
				row({ id: 'c' }),
				row({ id: 'd', readAt: '2026-09-30T10:00:00.000Z' })
			])
		).toEqual({ all: 4, needsYou: 1, unread: 3 });
	});

	it('counts an unknown-type row as news, not as something needing you', () => {
		expect(notificationCounts([row({ type: null, rawType: UNKNOWN, group: 'news' })])).toEqual({
			all: 1,
			needsYou: 0,
			unread: 1
		});
	});
});
