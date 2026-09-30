import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * GET /api/notifications feeds the nav bell. It read a different number of
 * rows than the Alerts page did (20 vs 50), so the two surfaces could show
 * different feeds for the same user and disagree about the same types. The
 * page size is now one exported constant both readers pass through.
 */

// oxlint-disable-next-line anti-slop/no-module-mocking -- scripted DB seam; the shared page size and the guard stay real.
vi.mock('$lib/server/db/actions/notifications', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/db/actions/notifications')>()),
	getNotifications: vi.fn(async () => []),
	getUnreadCount: vi.fn(async () => 0),
	markNotificationRead: vi.fn(async () => {}),
	markAllNotificationsRead: vi.fn(async () => {})
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- auth seam; the load under test stays real.
vi.mock('$lib/server/utils/requireUser', () => ({
	requireUserJson: () => ({ user: { id: 'u1' }, response: null })
}));

import { GET } from './+server';
import { getNotifications, NOTIFICATION_PAGE_SIZE } from '$lib/server/db/actions/notifications';

const dbRow = (over: Record<string, unknown> = {}) => ({
	id: 'n1',
	userId: 'u1',
	type: 'task_completed',
	actorName: 'Sarah',
	message: 'completed "Weekly meal plan"',
	link: '/calendar/tasks',
	readAt: null,
	createdAt: '2026-09-30T09:00:00.000Z',
	...over
});

const event = () => ({ locals: {} }) as Parameters<typeof GET>[0];

beforeEach(() => {
	vi.clearAllMocks();
});

describe('GET /api/notifications', () => {
	it('reads the same page size the Alerts page reads', async () => {
		await GET(event());
		expect(vi.mocked(getNotifications).mock.calls[0][1]).toBe(NOTIFICATION_PAGE_SIZE);
	});

	it('guards the free-text type column before the payload leaves the server', async () => {
		vi.mocked(getNotifications).mockResolvedValue([dbRow({ type: 'mystery_type' })] as never);
		const res = await GET(event());
		const body = await res.json();
		expect(body.notifications[0]).toMatchObject({
			type: null,
			rawType: 'mystery_type',
			group: 'news'
		});
	});
});
