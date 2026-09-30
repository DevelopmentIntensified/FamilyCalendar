import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The Alerts feed loader (issue 073). Two things are pinned here:
 *   1. the type guard runs at the boundary — `notifications.type` is free
 *      text, so a value nobody wrote must be narrowed server-side, kept, and
 *      logged rather than reaching the browser as if it were known;
 *   2. the page reads the SAME page size the notifications API reads. The two
 *      disagreed (50 vs 20) and the bell and the page showed different feeds
 *      for the same user.
 */

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted DB seam; the guard and the page size stay real.
vi.mock('$lib/server/db/actions/notifications', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/db/actions/notifications')>()),
	getNotifications: vi.fn(async () => []),
	getUnreadCount: vi.fn(async () => 0)
}));

import { load } from './+page.server';
import {
	getNotifications,
	getUnreadCount,
	NOTIFICATION_PAGE_SIZE
} from '$lib/server/db/actions/notifications';

const UNKNOWN = 'task_completed_v2';

/** A `notifications` row as drizzle hands it back: text columns stay text. */
type DbRow = {
	id: string;
	userId: string;
	type: string;
	actorName: string;
	message: string;
	link: string | null;
	readAt: string | null;
	createdAt: string;
};

const dbRow = (over: Partial<DbRow> = {}): DbRow => ({
	id: 'n1',
	userId: 'u1',
	type: 'assignment_pending',
	actorName: 'Sarah',
	message: 'asked you to book the wall',
	link: '/calendar/tasks',
	readAt: null,
	createdAt: '2026-09-30T09:00:00.000Z',
	...over
});

function event(user: { id: string } | null = { id: 'u1' }) {
	// SAFETY: the loader reads exactly `locals.user.id` off the load event.
	return { locals: { user } } as Parameters<typeof load>[0];
}

/** `load` also returns a redirect (never), which widens its type to void. */
async function loadFeed() {
	// SAFETY: `event()` carries a user, so the redirect arm cannot be reached.
	return (await load(event())) as Exclude<Awaited<ReturnType<typeof load>>, void>;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('alerts loader — the type guard', () => {
	it('narrows a known type and carries its group', async () => {
		// SAFETY: the fake DB hands back plain rows; drizzle's row type carries no methods to preserve.
		vi.mocked(getNotifications).mockResolvedValue([dbRow()] as never);
		const result = await loadFeed();
		expect(result.notifications[0].type).toBe('assignment_pending');
		expect(result.notifications[0].group).toBe('needs_you');
	});

	it('keeps a row whose type is unrecognised and lands it in news', async () => {
		// SAFETY: the fake DB hands back plain rows; drizzle's row type carries no methods to preserve.
		vi.mocked(getNotifications).mockResolvedValue([dbRow({ type: UNKNOWN })] as never);
		const result = await loadFeed();
		expect(result.notifications).toHaveLength(1);
		expect(result.notifications[0].type).toBeNull();
		expect(result.notifications[0].rawType).toBe(UNKNOWN);
		expect(result.notifications[0].group).toBe('news');
	});

	it('logs an unrecognised type server-side so a bad write is visible', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		// SAFETY: the fake DB hands back plain rows; drizzle's row type carries no methods to preserve.
		vi.mocked(getNotifications).mockResolvedValue([dbRow({ type: UNKNOWN })] as never);
		await load(event());
		expect(warn).toHaveBeenCalledWith(expect.stringContaining(UNKNOWN));
		warn.mockRestore();
	});

	it('says nothing when every type is one the app writes', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		// SAFETY: the fake DB hands back plain rows; drizzle's row type carries no methods to preserve.
		vi.mocked(getNotifications).mockResolvedValue([dbRow()] as never);
		await load(event());
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});

describe('alerts loader — one feed, one page size', () => {
	it('reads the same page size the notifications API reads', async () => {
		await load(event());
		expect(vi.mocked(getNotifications).mock.calls[0][1]).toBe(NOTIFICATION_PAGE_SIZE);
	});

	it('publishes that page size as a single named constant', () => {
		expect(NOTIFICATION_PAGE_SIZE).toBe(50);
	});

	it('carries the server unread count through untouched', async () => {
		// SAFETY: getUnreadCount returns a count, not a row.
		vi.mocked(getUnreadCount).mockResolvedValue(7);
		const result = await loadFeed();
		expect(result.unreadCount).toBe(7);
	});

	it('sends an anonymous visitor to the login page', async () => {
		await expect(load(event(null))).rejects.toMatchObject({ status: 302 });
	});
});
