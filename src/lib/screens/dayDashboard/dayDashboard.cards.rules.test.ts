/**
 * The dayDashboard card rules: glance ordering and Kids' Schedule grouping.
 * Expected values come from the legacy cards (`TodayGlanceCard.svelte:38-46`,
 * `KidsScheduleCard.svelte:51-89`) and their tests, never from running the
 * rules.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import {
	dashboardDueTone,
	familyBoardTaskBody,
	glanceRsvpVisual,
	groupKidsSchedule,
	initialsFromName,
	orderGlanceEvents,
	type KidsScheduleKid,
	type KidsScheduleRow
} from './dayDashboard.cards.rules';
import { parseTaskQuickAdd } from '$lib/domains/parsing';

type GlanceRow = { readonly id: string; readonly allDay: boolean; readonly start: string | Date };

const glanceRow = (id: string, allDay: boolean, start: string | Date): GlanceRow => ({
	id,
	allDay,
	start
});

const MIA: KidsScheduleKid = { id: 'kid-mia', name: 'Mia' };
const ELI: KidsScheduleKid = { id: 'kid-eli', name: 'Eli' };

type KidsRow = KidsScheduleRow & { readonly id: string };

const kidsRow = (
	id: string,
	start: string,
	kids: readonly KidsScheduleKid[],
	allDay = false
): KidsRow => ({ id, start, allDay, kids });

describe('orderGlanceEvents', () => {
	it.each<[string, GlanceRow[], string[]]>([
		[
			'an empty day',
			[],
			[]
		],
		[
			'one all-day row',
			[glanceRow('holiday', true, '2026-09-03')],
			['holiday']
		],
		[
			'all-day rows first, in the payload order the query did not sort',
			[
				glanceRow('standup', false, '2026-09-03T10:00:00'),
				glanceRow('holiday', true, '2026-09-03'),
				glanceRow('birthday', true, '2026-09-03'),
				glanceRow('school', false, '2026-09-03T09:00:00')
			],
			['holiday', 'birthday', 'school', 'standup']
		],
		[
			'timed rows by start, whatever order they arrive in',
			[
				glanceRow('soccer', false, '2026-09-03T15:00:00'),
				glanceRow('school', false, '2026-09-03T09:00:00'),
				glanceRow('lunch', false, '2026-09-03T12:00:00')
			],
			['school', 'lunch', 'soccer']
		],
		[
			'a Date start orders exactly like the ISO string',
			[
				glanceRow('late', false, new Date('2026-09-03T15:00:00')),
				glanceRow('early', false, '2026-09-03T09:00:00')
			],
			['early', 'late']
		],
		[
			'an unparseable start keeps its place (a NaN comparison sorts as equal)',
			[glanceRow('broken', false, 'not-a-date'), glanceRow('school', false, '2026-09-03T09:00:00')],
			['broken', 'school']
		]
	])('orders %s', (_label, events, expected) => {
		expect(orderGlanceEvents(events).map((event) => event.id)).toEqual(expected);
	});

	it('leaves the caller’s array untouched', () => {
		const events = [
			glanceRow('soccer', false, '2026-09-03T15:00:00'),
			glanceRow('school', false, '2026-09-03T09:00:00')
		];
		orderGlanceEvents(events);
		expect(events.map((event) => event.id)).toEqual(['soccer', 'school']);
	});
});

describe('groupKidsSchedule', () => {
	it('heads one band per child, in the order their first event starts', () => {
		const groups = groupKidsSchedule([
			kidsRow('soccer', '2026-09-28T16:30:00Z', [MIA]),
			kidsRow('tball', '2026-09-28T16:45:00Z', [ELI])
		]);
		expect(groups.map((group) => group.kid.name)).toEqual(['Mia', 'Eli']);
		expect(groups.map((group) => group.events.map((event) => event.id))).toEqual([
			['soccer'],
			['tball']
		]);
	});

	it('repeats a shared event under every child attending it', () => {
		const groups = groupKidsSchedule([kidsRow('swimming', '2026-09-28T16:30:00Z', [MIA, ELI])]);
		expect(groups.map((group) => group.kid.id)).toEqual(['kid-mia', 'kid-eli']);
		expect(groups.map((group) => group.events.map((event) => event.id))).toEqual([
			['swimming'],
			['swimming']
		]);
	});

	it('orders bands by the earliest event, not by the first row’s kid order', () => {
		const groups = groupKidsSchedule([
			kidsRow('assembly', '2026-09-28T10:00:00Z', [ELI, MIA]),
			kidsRow('dentist', '2026-09-28T09:00:00Z', [MIA])
		]);
		expect(groups.map((group) => group.kid.id)).toEqual(['kid-mia', 'kid-eli']);
		expect(groups.map((group) => group.events.map((event) => event.id))).toEqual([
			['dentist', 'assembly'],
			['assembly']
		]);
	});

	it('puts an all-day event before a timed one that starts earlier', () => {
		const groups = groupKidsSchedule([
			kidsRow('school', '2026-09-28T08:00:00Z', [MIA]),
			kidsRow('holiday', '2026-09-28T23:00:00Z', [MIA], true)
		]);
		expect(groups[0]?.events.map((event) => event.id)).toEqual(['holiday', 'school']);
	});

	it('keeps the first spelling of a child whose name changes between rows', () => {
		const groups = groupKidsSchedule([
			kidsRow('soccer', '2026-09-28T16:30:00Z', [{ id: 'kid-mia', name: 'Mia' }]),
			kidsRow('piano', '2026-09-28T17:30:00Z', [{ id: 'kid-mia', name: 'Mia R.' }])
		]);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.kid).toEqual({ id: 'kid-mia', name: 'Mia' });
		expect(groups[0]?.events.map((event) => event.id)).toEqual(['soccer', 'piano']);
	});

	it('ignores an event with no child attending it', () => {
		expect(groupKidsSchedule([kidsRow('dentist', '2026-09-28T09:00:00Z', [])])).toEqual([]);
	});

	it('answers no bands for an empty day', () => {
		expect(groupKidsSchedule([])).toEqual([]);
	});
});

describe('initialsFromName', () => {
	it.each<[string, string]>([
		['Mia', 'M'],
		['Mia Rivera', 'MR'],
		['  mia   rivera  ', 'MR'],
		['Mia Rose Chen', 'MR'],
		['', '?'],
		['   ', '?']
	])('draws %j as %j', (name, expected) => {
		expect(initialsFromName(name)).toBe(expected);
	});
});

describe('glanceRsvpVisual', () => {
	it.each<[string | undefined, string | null]>([
		['going', '✓ Going'],
		['maybe', '? Maybe'],
		['declined', "✕ Can't go"],
		[undefined, null],
		['undecided', null]
	])('draws %j as %j', (status, expected) => {
		const visual = glanceRsvpVisual(status);
		expect(visual ? `${visual.icon} ${visual.label}` : null).toBe(expected);
	});

	it('dims a declined row and rings a going one (the legacy container classes)', () => {
		expect(glanceRsvpVisual('declined')?.containerClass).toBe('opacity-60 saturate-50');
		expect(glanceRsvpVisual('going')?.containerClass).toContain('ring-emerald-400/60');
	});
});

describe('dashboardDueTone', () => {
	const NOW = new Date(2026, 10, 2, 12, 0, 0, 0);

	it.each<[string | null, string]>([
		['2026-11-01T09:00:00.000Z', 'bg-red-100 text-red-700'],
		['2026-11-02T18:00:00.000Z', 'bg-amber-100 text-amber-700'],
		['2026-11-05T09:00:00.000Z', 'bg-slate-100 text-slate-600'],
		[null, '']
	])('tones %j as %j', (due, expected) => {
		expect(dashboardDueTone(due, NOW)).toBe(expected);
	});
});

describe('familyBoardTaskBody', () => {
	const parsed = parseTaskQuickAdd('saturday for Dad #public', {
		now: new Date(2026, 10, 2, 12, 0, 0, 0),
		zone: 'UTC',
		members: [{ userId: 'user-dad', firstName: 'Dad', lastName: 'Chen' }]
	});

	it('files a family task, assigns the @member, and omits a blank category', () => {
		const body = familyBoardTaskBody(parsed, {
			familyId: 'family-chen',
			meId: 'user-me',
			category: '   '
		});
		expect(body.familyId).toBe('family-chen');
		expect(body.assignedTo).toBe('user-dad');
		expect(body.visibility).toBe('public');
		expect('category' in body).toBe(false);
	});

	it('assigns the creator when no member was named, and sends a typed category', () => {
		const plain = parseTaskQuickAdd('water the plants', {
			now: new Date(2026, 10, 2, 12, 0, 0, 0),
			zone: 'UTC',
			members: []
		});
		const body = familyBoardTaskBody(plain, {
			familyId: 'family-chen',
			meId: 'user-me',
			category: ' Errands '
		});
		expect(body.assignedTo).toBe('user-me');
		expect(body.category).toBe('Errands');
	});
});
