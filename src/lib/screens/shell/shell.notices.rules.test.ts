/**
 * Pure notice rules, carried from the legacy layout
 * (`(calendar)/calendar/+layout.svelte:51-80,149-264`) and its Inactivity
 * Window copy. Expected values are the legacy 90/14-day constants, the legacy
 * `else-if` order and the legacy sentence, never this code's output.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import type { ShellNoticeModel } from './shell.contract';
import {
	shellDaysLeft,
	shellMergeSummary,
	shellNoticeFor
} from './shell.notices.rules';

const NOW = new Date('2026-11-19T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** An instant `ms` before NOW (negative = in the future). */
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const GUEST = { isAnonymous: true, emailVerified: false } as const;
const MEMBER = { isAnonymous: false, emailVerified: true } as const;
const UNVERIFIED = { isAnonymous: false, emailVerified: false } as const;
const UNKNOWN_VERIFICATION = { isAnonymous: false, emailVerified: null } as const;

function noticeFor(
	query: string,
	viewer: { readonly isAnonymous: boolean; readonly emailVerified: boolean | null },
	daysLeft = 90,
	dismissed: Partial<Record<ShellNoticeModel['kind'], boolean>> = {}
): ShellNoticeModel | null {
	return shellNoticeFor({
		searchParams: new URLSearchParams(query),
		viewer,
		daysLeft,
		dismissed
	});
}

describe('counts the Inactivity Window down and turns urgent at 14 days', () => {
	it.each<{ what: string; lastActiveAt: Date | null | undefined; expected: number }>([
		{ what: 'no timestamp on the row', lastActiveAt: null, expected: 90 },
		{ what: 'no row at all', lastActiveAt: undefined, expected: 90 },
		{ what: 'active right now', lastActiveAt: NOW, expected: 90 },
		{ what: 'one day idle', lastActiveAt: ago(DAY_MS), expected: 89 },
		{ what: '89 days 23 hours idle', lastActiveAt: ago(89 * DAY_MS + 23 * HOUR_MS), expected: 1 },
		{ what: 'one millisecond short of 90 days', lastActiveAt: ago(90 * DAY_MS - 1), expected: 1 },
		{ what: '90 days idle', lastActiveAt: ago(90 * DAY_MS), expected: 0 },
		{ what: '91 days idle (floored at 0)', lastActiveAt: ago(91 * DAY_MS), expected: 0 },
		{ what: 'a timestamp in the future', lastActiveAt: ago(-DAY_MS), expected: 91 }
	])('$what', ({ lastActiveAt, expected }) => {
		expect(shellDaysLeft(lastActiveAt, NOW)).toBe(expected);
	});

	it.each<{ daysLeft: number; urgent: boolean }>([
		{ daysLeft: 15, urgent: false },
		{ daysLeft: 14, urgent: true },
		{ daysLeft: 13, urgent: true },
		{ daysLeft: 0, urgent: true }
	])('is urgent=$urgent with daysLeft=$daysLeft', ({ daysLeft, urgent }) => {
		expect(noticeFor('', GUEST, daysLeft)).toMatchObject({ kind: 'anonymous', urgent });
	});
});

describe('first matching notice wins and only the countdown cannot be dismissed', () => {
	it.each<
		{
			what: string;
			query: string;
			viewer: { readonly isAnonymous: boolean; readonly emailVerified: boolean | null };
			daysLeft?: number;
			dismissed?: Partial<Record<ShellNoticeModel['kind'], boolean>>;
			expected: ShellNoticeModel | null;
		}
	>([
		{
			what: 'claimed wins for a registered account',
			query: 'claimed=1',
			viewer: MEMBER,
			expected: { kind: 'claimed', dismissible: true }
		},
		{
			what: 'a dismissed claim falls through',
			query: 'claimed=1',
			viewer: MEMBER,
			dismissed: { claimed: true },
			expected: null
		},
		{
			what: 'claimed outranks the unverified notice',
			query: 'claimed=1',
			viewer: UNVERIFIED,
			expected: { kind: 'claimed', dismissible: true }
		},
		{
			what: 'claimed=true is not the claimed flag',
			query: 'claimed=true',
			viewer: MEMBER,
			expected: null
		},
		{
			what: 'an unverified email wins over a merge',
			query: 'merged=2&tasks=1',
			viewer: UNVERIFIED,
			expected: { kind: 'verify', dismissible: true }
		},
		{
			what: 'a dismissed verify notice reveals the merge',
			query: 'merged=2&tasks=1',
			viewer: UNVERIFIED,
			dismissed: { verify: true },
			expected: { kind: 'merged', dismissible: true, events: 2, tasks: 1 }
		},
		{
			what: 'a known verification (null) never asks for a code',
			query: '',
			viewer: UNKNOWN_VERIFICATION,
			expected: null
		},
		{
			what: 'a merge carries its event and task counts',
			query: 'merged=3&tasks=2',
			viewer: MEMBER,
			expected: { kind: 'merged', dismissible: true, events: 3, tasks: 2 }
		},
		{
			what: 'zero merged events still show the merge',
			query: 'merged=0',
			viewer: MEMBER,
			expected: { kind: 'merged', dismissible: true, events: 0, tasks: 0 }
		},
		{
			what: 'an absent merged count is not a merge',
			query: '',
			viewer: MEMBER,
			expected: null
		},
		{
			what: 'a junk merged count is not a merge',
			query: 'merged=abc',
			viewer: MEMBER,
			expected: null
		},
		{
			what: 'a negative merged count is not a merge',
			query: 'merged=-1',
			viewer: MEMBER,
			expected: null
		},
		{
			what: 'merged and task counts truncate like parseInt',
			query: 'merged=3.7&tasks=2.9',
			viewer: MEMBER,
			expected: { kind: 'merged', dismissible: true, events: 3, tasks: 2 }
		},
		{
			what: 'a junk task count reads as zero',
			query: 'merged=2&tasks=abc',
			viewer: MEMBER,
			expected: { kind: 'merged', dismissible: true, events: 2, tasks: 0 }
		},
		{
			what: 'a negative task count reads as zero',
			query: 'merged=2&tasks=-4',
			viewer: MEMBER,
			expected: { kind: 'merged', dismissible: true, events: 2, tasks: 0 }
		},
		{
			what: 'a dismissed merge leaves no notice',
			query: 'merged=2&tasks=1',
			viewer: MEMBER,
			dismissed: { merged: true },
			expected: null
		},
		{
			what: 'a guest sees the countdown instead of a claim',
			query: 'claimed=1',
			viewer: GUEST,
			expected: { kind: 'anonymous', dismissible: false, urgent: false, daysLeft: 90 }
		},
		{
			what: 'a guest sees the countdown instead of a merge',
			query: 'claimed=1&merged=2&tasks=1',
			viewer: GUEST,
			expected: { kind: 'anonymous', dismissible: false, urgent: false, daysLeft: 90 }
		},
		{
			what: 'the countdown is urgent at 14 days left',
			query: '',
			viewer: GUEST,
			daysLeft: 14,
			expected: { kind: 'anonymous', dismissible: false, urgent: true, daysLeft: 14 }
		},
		{
			what: 'the countdown is not urgent at 15 days left',
			query: '',
			viewer: GUEST,
			daysLeft: 15,
			expected: { kind: 'anonymous', dismissible: false, urgent: false, daysLeft: 15 }
		},
		{
			what: 'a registered verified account has no notice',
			query: '',
			viewer: MEMBER,
			expected: null
		}
	])('$what', ({ query, viewer, daysLeft, dismissed, expected }) => {
		expect(noticeFor(query, viewer, daysLeft, dismissed)).toEqual(expected);
	});
});

describe('pluralises the merge summary and omits tasks when zero', () => {
	it.each<{ events: number; tasks: number; expected: string }>([
		{ events: 1, tasks: 0, expected: 'Brought over 1 event from your guest calendar.' },
		{ events: 2, tasks: 0, expected: 'Brought over 2 events from your guest calendar.' },
		{ events: 0, tasks: 0, expected: 'Brought over 0 events from your guest calendar.' },
		{
			events: 1,
			tasks: 1,
			expected: 'Brought over 1 event and 1 task from your guest calendar.'
		},
		{
			events: 3,
			tasks: 2,
			expected: 'Brought over 3 events and 2 tasks from your guest calendar.'
		}
	])('$events events and $tasks tasks', ({ events, tasks, expected }) => {
		expect(shellMergeSummary(events, tasks)).toBe(expected);
	});
});
