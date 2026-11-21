/**
 * The Alerts page body as the reader sees it: the two sections and their
 * counts, the three chips counted over the whole feed, the unread wash, the
 * real anchors with the plain-click rule, the delete-read confirmation, and
 * both empty states.
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { memoryToasts } from '$lib/kernel/client/toasts.svelte.js';
import type { AlertRow } from '../alerts.contract';
import type { AlertsApi } from '../alerts.api';
import AlertsFeed from './AlertsFeed.svelte';

const NOW = new Date('2026-11-21T12:00:00.000Z');
const ZONE = 'UTC';
const UNKNOWN = 'task_completed_v2';

type FeedApi = Pick<AlertsApi, 'mark' | 'markAll' | 'prune'>;

afterEach(cleanup);

function row(over: Partial<AlertRow> = {}): AlertRow {
	return {
		id: 'n1',
		type: 'task_completed',
		rawType: 'task_completed',
		group: 'news',
		actorName: 'Sarah',
		message: 'completed "Weekly meal plan"',
		link: '/calendar/tasks',
		readAt: null,
		createdAt: '2026-11-19 09:00:00+00',
		...over
	};
}

const FEED: AlertRow[] = [
	row({ id: 'n1' }),
	row({
		id: 'n2',
		type: 'assignment_pending',
		rawType: 'assignment_pending',
		group: 'needs_you',
		message: 'asked you to book the wall'
	}),
	row({
		id: 'n3',
		type: 'added_to_family',
		rawType: 'added_to_family',
		message: 'added Eli to the Hopper family',
		link: '/family'
	}),
	row({
		id: 'n4',
		type: 'assignment_declined',
		rawType: 'assignment_declined',
		group: 'needs_you',
		message: 'declined the school forms'
	}),
	row({
		id: 'n5',
		type: 'assignment_accepted',
		rawType: 'assignment_accepted',
		message: 'accepted "Take the bins out"',
		readAt: '2026-11-20 10:00:00+00'
	})
];

function fakeApi(over: Partial<FeedApi> = {}): FeedApi {
	return {
		mark: vi.fn(async () => ({ ok: true as const, data: { success: true as const } })),
		markAll: vi.fn(async () => ({ ok: true as const, data: { success: true as const } })),
		prune: vi.fn(async () => ({
			ok: true as const,
			data: { success: true as const, removed: 1 }
		})),
		...over
	};
}

function renderFeed(options: {
	rows?: AlertRow[];
	unreadCount?: number;
	api?: FeedApi;
} = {}) {
	const rows = options.rows ?? FEED;
	const api = options.api ?? fakeApi();
	const refresh = vi.fn();
	const navigate = vi.fn();
	const toasts = memoryToasts();
	render(AlertsFeed, {
		props: {
			notifications: rows,
			unreadCount: options.unreadCount ?? rows.filter((r) => !r.readAt).length,
			refresh,
			navigate,
			api,
			toasts,
			now: NOW,
			zone: ZONE
		}
	});
	return { api, refresh, navigate, toasts };
}

describe('alerts feed — needs you vs just news', () => {
	it('splits the feed into the two sections, each with its count', () => {
		renderFeed();
		expect(screen.getByRole('heading', { name: /Needs you/ })).toHaveTextContent('2');
		expect(screen.getByRole('heading', { name: /Just news/ })).toHaveTextContent('3');
	});

	it('puts the two asking types in needs-you and the rest in news', () => {
		renderFeed();
		const needsYou = screen.getByRole('region', { name: /Needs you/ });
		expect(within(needsYou).getByText('Asked you')).toBeInTheDocument();
		expect(within(needsYou).getByText('Declined')).toBeInTheDocument();
		expect(within(needsYou).queryByText('Completed')).not.toBeInTheDocument();

		const news = screen.getByRole('region', { name: /Just news/ });
		expect(within(news).getByText('Completed')).toBeInTheDocument();
		expect(within(news).getByText('Added to family')).toBeInTheDocument();
		expect(within(news).getByText('Accepted')).toBeInTheDocument();
	});

	it('omits a section with nothing in it', () => {
		renderFeed({ rows: [row({ id: 'n1' })] });
		expect(screen.queryByRole('region', { name: /Needs you/ })).not.toBeInTheDocument();
		expect(screen.getByRole('region', { name: /Just news/ })).toBeInTheDocument();
	});

	it('keeps a row it cannot name in the news section under Update', () => {
		renderFeed({ rows: [row({ id: 'nX', type: null, rawType: UNKNOWN, message: 'did something new' })] });
		const news = screen.getByRole('region', { name: /Just news/ });
		expect(within(news).getByText('Update')).toBeInTheDocument();
		expect(within(news).getByText(/did something new/)).toBeInTheDocument();
		expect(within(news).queryByText(UNKNOWN)).not.toBeInTheDocument();
	});
});

describe('alerts feed — chips and header', () => {
	it('offers all / needs you / unread with counts over the whole feed', () => {
		renderFeed();
		expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('5');
		expect(screen.getByRole('button', { name: /^Needs you/ })).toHaveTextContent('2');
		expect(screen.getByRole('button', { name: /^Unread/ })).toHaveTextContent('4');
	});

	it('narrows the feed to the needs-you rows when that chip is tapped', async () => {
		renderFeed();
		await fireEvent.click(screen.getByRole('button', { name: /^Needs you/ }));
		expect(screen.getByRole('region', { name: /Needs you/ })).toBeInTheDocument();
		expect(screen.queryByRole('region', { name: /Just news/ })).not.toBeInTheDocument();
	});

	it('keeps its counts while a filter is active', async () => {
		renderFeed();
		await fireEvent.click(screen.getByRole('button', { name: /^Unread/ }));
		expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('5');
		expect(screen.getByRole('button', { name: /^Needs you/ })).toHaveTextContent('2');
	});

	it('names the unread total, or all caught up', () => {
		renderFeed({ unreadCount: 4 });
		expect(screen.getByTestId('unread-count')).toHaveTextContent('4 unread');
	});

	it('says all caught up with no unread rows', () => {
		renderFeed({ rows: [row({ id: 'a', readAt: '2026-11-20 10:00:00+00' })], unreadCount: 0 });
		expect(screen.getByTestId('unread-count')).toHaveTextContent("You're all caught up");
	});
});

describe('alerts feed — rows', () => {
	it('washes an unread row and leaves a read row plain', () => {
		renderFeed({
			rows: [
				row({ id: 'unread-1' }),
				row({ id: 'read-1', readAt: '2026-11-20 10:00:00+00' })
			]
		});
		const list = screen.getByRole('list', { name: 'Just news' });
		const [unread, read] = within(list).getAllByRole('listitem');
		expect(unread.getAttribute('data-unread')).toBe('true');
		expect(unread.className).toContain('from-primary-50');
		expect(read.getAttribute('data-unread')).toBe('false');
		expect(read.className).not.toContain('from-primary-50');
	});

	it('marks the row read and navigates on a plain click', async () => {
		const { api, refresh, navigate } = renderFeed();
		await fireEvent.click(screen.getByRole('link', { name: /asked you to book the wall/ }));
		await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/calendar/tasks'));
		expect(api.mark).toHaveBeenCalledWith('n2');
		expect(refresh).toHaveBeenCalled();
	});

	it('leaves a modified click to the browser', async () => {
		const { api, navigate } = renderFeed();
		await fireEvent.click(screen.getByRole('link', { name: /asked you to book the wall/ }), {
			metaKey: true
		});
		expect(api.mark).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it('does not re-POST a row that is already read', async () => {
		const { api, navigate } = renderFeed();
		await fireEvent.click(screen.getByRole('link', { name: /accepted "Take the bins out"/ }));
		expect(api.mark).not.toHaveBeenCalled();
		expect(navigate).toHaveBeenCalledWith('/calendar/tasks');
	});
});

describe('alerts feed — empty states', () => {
	it('explains an empty feed', () => {
		renderFeed({ rows: [], unreadCount: 0 });
		expect(screen.getByText('No alerts yet')).toBeInTheDocument();
		expect(screen.getByText(/assign you tasks, accept, decline, or complete them/)).toBeInTheDocument();
	});

	it('says nothing matches when the filter empties the feed', async () => {
		renderFeed({ rows: [row({ id: 'a', readAt: '2026-11-20 10:00:00+00' })], unreadCount: 0 });
		await fireEvent.click(screen.getByRole('button', { name: /^Unread/ }));
		expect(screen.getByText('Nothing matches this filter.')).toBeInTheDocument();
	});
});

describe('alerts feed — the write actions', () => {
	it('marks everything read optimistically and confirms it', async () => {
		const { api, toasts } = renderFeed();
		await fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
		await vi.waitFor(() => expect(api.markAll).toHaveBeenCalledOnce());
		expect(toasts.items).toEqual([{ kind: 'success', text: 'Everything marked as read.' }]);
		expect(screen.getByTestId('unread-count')).toHaveTextContent("You're all caught up");
	});

	it('asks before deleting the read rows, then names the count', async () => {
		const { api, toasts } = renderFeed();
		await fireEvent.click(screen.getByRole('button', { name: 'Delete read alerts' }));
		expect(screen.getByText('Delete 1 read alert?')).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Delete them' }));
		await vi.waitFor(() => expect(api.prune).toHaveBeenCalledOnce());
		expect(toasts.items).toEqual([{ kind: 'success', text: 'Deleted 1 read alert.' }]);
	});

	it('keeps the rows when the answer is keep them', async () => {
		const { api } = renderFeed();
		await fireEvent.click(screen.getByRole('button', { name: 'Delete read alerts' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Keep them' }));
		expect(api.prune).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: 'Delete read alerts' })).toBeInTheDocument();
	});
});
