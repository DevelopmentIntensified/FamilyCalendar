import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/svelte';
import { goto, invalidateAll } from '$app/navigation';
import { pushToast } from '$lib/client/toasts';
import NotificationsPage from './+page.svelte';
import type { PageData } from './$types';
import { toNotificationRow } from '$lib/utils/notificationTypes';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/* is framework-injected; no DI seam exists.
vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve()),
	invalidateAll: vi.fn(() => Promise.resolve())
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- toasts are a global store; the real one is fine to watch.
vi.mock('$lib/client/toasts', () => ({ pushToast: vi.fn() }));

const UNKNOWN = 'task_completed_v2';

function dbRow(over: Partial<Parameters<typeof toNotificationRow>[0]> = {}) {
	return {
		id: 'n1',
		type: 'task_completed',
		actorName: 'Sarah',
		message: 'completed "Weekly meal plan"',
		link: '/calendar/tasks',
		readAt: null,
		createdAt: '2026-09-30T09:00:00.000Z',
		...over
	};
}

function renderPage(rows: Parameters<typeof toNotificationRow>[0][], unreadCount?: number) {
	return render(NotificationsPage, {
		// SAFETY: the page reads exactly `notifications` and `unreadCount`.
		data: {
			notifications: rows.map(toNotificationRow),
			unreadCount: unreadCount ?? rows.filter((r) => !r.readAt).length
		} as unknown as PageData
	});
}

const FEED = [
	dbRow({ id: 'n1', type: 'task_completed', message: 'completed "Weekly meal plan"' }),
	dbRow({
		id: 'n2',
		type: 'assignment_pending',
		actorName: 'Sarah',
		message: 'asked you to book the wall'
	}),
	dbRow({
		id: 'n3',
		type: 'added_to_family',
		actorName: 'Jon',
		message: 'added Eli to the Hopper family'
	}),
	dbRow({
		id: 'n4',
		type: 'assignment_declined',
		actorName: 'Jon',
		message: 'declined the school forms'
	}),
	dbRow({
		id: 'n5',
		type: 'assignment_accepted',
		actorName: 'Mia',
		message: 'accepted "Take the bins out"',
		readAt: '2026-09-30T10:00:00.000Z'
	})
];

const postCalls = () =>
	vi
		.mocked(fetch)
		// SAFETY: every fetch this page makes carries a RequestInit-shaped init.
		.mock.calls.filter(([, i]) => (i as RequestInit)?.method === 'POST');

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }))
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	cleanup();
});

// Issue 073: group by what needs a decision, not by when it arrived.
describe('alerts page — needs you vs just news', () => {
	it('splits the feed into the two sections, each with its count', () => {
		renderPage(FEED);
		expect(screen.getByRole('heading', { name: /Needs you/ })).toHaveTextContent('2');
		expect(screen.getByRole('heading', { name: /Just news/ })).toHaveTextContent('3');
	});

	it('puts the two asking types in needs-you and the rest in news', () => {
		renderPage(FEED);
		const needsYou = screen.getByRole('region', { name: /Needs you/ });
		expect(within(needsYou).getByText('Asked you')).toBeInTheDocument();
		expect(within(needsYou).getByText('Declined')).toBeInTheDocument();
		expect(within(needsYou).queryByText('Completed')).not.toBeInTheDocument();

		const news = screen.getByRole('region', { name: /Just news/ });
		expect(within(news).getByText('Completed')).toBeInTheDocument();
		expect(within(news).getByText('Added to family')).toBeInTheDocument();
		expect(within(news).getByText('Accepted')).toBeInTheDocument();
	});

	it('omits a section with nothing in it instead of showing an empty card', () => {
		renderPage([dbRow({ id: 'n1', type: 'task_completed' })]);
		expect(screen.queryByRole('region', { name: /Needs you/ })).not.toBeInTheDocument();
		expect(screen.getByRole('region', { name: /Just news/ })).toBeInTheDocument();
	});

	// The column is free text, so an unrecognised value is a live possibility.
	it('keeps a row it cannot name in the news section under an explicit label', () => {
		renderPage([dbRow({ id: 'nX', type: UNKNOWN, message: 'did something new' })]);
		expect(screen.queryByRole('region', { name: /Needs you/ })).not.toBeInTheDocument();
		const news = screen.getByRole('region', { name: /Just news/ });
		expect(within(news).getByText('Update')).toBeInTheDocument();
		expect(within(news).getByText(/did something new/)).toBeInTheDocument();
		// Never echoes the raw column value back at the reader.
		expect(within(news).queryByText(UNKNOWN)).not.toBeInTheDocument();
	});
});

describe('alerts page — filter chips', () => {
	it('offers all / needs you / unread with counts over the whole feed', () => {
		renderPage(FEED);
		expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('5');
		expect(screen.getByRole('button', { name: /^Needs you/ })).toHaveTextContent('2');
		expect(screen.getByRole('button', { name: /^Unread/ })).toHaveTextContent('4');
	});

	it('narrows the feed to the needs-you rows when that chip is tapped', async () => {
		renderPage(FEED);
		await fireEvent.click(screen.getByRole('button', { name: /^Needs you/ }));
		expect(screen.getByRole('region', { name: /Needs you/ })).toBeInTheDocument();
		expect(screen.queryByRole('region', { name: /Just news/ })).not.toBeInTheDocument();
		expect(screen.queryByText(/accepted "Take the bins out"/)).not.toBeInTheDocument();
	});

	it('drops already-read rows when the unread chip is tapped', async () => {
		renderPage(FEED);
		await fireEvent.click(screen.getByRole('button', { name: /^Unread/ }));
		expect(screen.queryByText(/accepted "Take the bins out"/)).not.toBeInTheDocument();
		expect(screen.getByText(/completed "Weekly meal plan"/)).toBeInTheDocument();
	});

	it('keeps its counts while a filter is active, so a chip number never moves', async () => {
		renderPage(FEED);
		await fireEvent.click(screen.getByRole('button', { name: /^Unread/ }));
		expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('5');
		expect(screen.getByRole('button', { name: /^Needs you/ })).toHaveTextContent('2');
	});
});

describe('alerts page — unread treatment', () => {
	it('names the unread total in the header', () => {
		renderPage(FEED, 4);
		expect(screen.getByText('4 unread')).toBeInTheDocument();
	});

	it('marks unread rows and leaves read rows aligned', () => {
		renderPage([
			dbRow({ id: 'unread-1', type: 'task_completed' }),
			dbRow({ id: 'read-1', type: 'added_to_family', readAt: '2026-09-30T10:00:00.000Z' })
		]);
		const list = screen.getByRole('list', { name: 'Just news' });
		const rows = within(list).getAllByRole('listitem');
		expect(rows[0].getAttribute('data-unread')).toBe('true');
		expect(rows[1].getAttribute('data-unread')).toBe('false');
	});
});

describe('alerts page — rows are real links', () => {
	it('renders each row as an anchor pointing at the deep link', () => {
		renderPage(FEED);
		const anchor = screen.getByRole('link', { name: /asked you to book the wall/ });
		expect(anchor).toHaveAttribute('href', '/calendar/tasks');
	});

	it('marks the row read and navigates on a plain click', async () => {
		renderPage(FEED);
		await fireEvent.click(screen.getByRole('link', { name: /asked you to book the wall/ }));
		expect(postCalls()).toHaveLength(1);
		expect(JSON.parse(String(postCalls()[0][1]?.body))).toEqual({ id: 'n2' });
		// Server rows stay the source of truth: a taken read-mark is reconciled.
		expect(invalidateAll).toHaveBeenCalled();
		expect(goto).toHaveBeenCalledWith('/calendar/tasks');
	});

	it('leaves a modified click to the browser so open-in-new-tab still opens', async () => {
		renderPage(FEED);
		const anchor = screen.getByRole('link', { name: /asked you to book the wall/ });
		const notCancelled = fireEvent.click(anchor, { metaKey: true });
		expect(postCalls()).toHaveLength(0);
		expect(goto).not.toHaveBeenCalled();
		await notCancelled;
	});

	it('does not re-POST a row that is already read', async () => {
		renderPage(FEED);
		await fireEvent.click(screen.getByRole('link', { name: /accepted "Take the bins out"/ }));
		expect(postCalls()).toHaveLength(0);
		expect(goto).toHaveBeenCalledWith('/calendar/tasks');
	});
});

// Issue 126: the prototype's "never pruned" card is the one thing notifications.html
// shows that #073 did not do, and #073 named it as deliberately left unbuilt.
describe('alerts page — pruning read alerts', () => {
	const READ_TEXT = 'completed "Weekly meal plan"';
	const withRead = () =>
		renderPage([
			dbRow({
				id: 'unread-1',
				type: 'assignment_pending',
				message: 'asked you to book the wall'
			}),
			dbRow({
				id: 'read-1',
				type: 'task_completed',
				message: READ_TEXT,
				readAt: '2026-09-30T10:00:00.000Z'
			})
		]);

	it('offers the prune only when there is something read to prune', () => {
		withRead();
		expect(screen.getByRole('button', { name: /Delete read alerts/ })).toBeInTheDocument();

		cleanup();
		renderPage([dbRow({ id: 'unread-1', type: 'task_completed' })]);
		expect(screen.queryByRole('button', { name: /Delete read alerts/ })).not.toBeInTheDocument();
	});

	it('asks in the page before deleting, naming how many', async () => {
		withRead();
		await fireEvent.click(screen.getByRole('button', { name: /Delete read alerts/ }));

		expect(screen.getByText(/Delete 1 read alert/)).toBeInTheDocument();
		// Nothing is sent until the second, deliberate press.
		expect(postCalls()).toHaveLength(0);
	});

	it('lets the ask be called off without deleting anything', async () => {
		withRead();
		await fireEvent.click(screen.getByRole('button', { name: /Delete read alerts/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Keep them' }));

		expect(postCalls()).toHaveLength(0);
		expect(screen.getByText(READ_TEXT)).toBeInTheDocument();
	});

	it('removes the read rows optimistically and says what happened', async () => {
		withRead();
		await fireEvent.click(screen.getByRole('button', { name: /Delete read alerts/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete them' }));

		expect(screen.queryByText(READ_TEXT)).not.toBeInTheDocument();
		expect(screen.getByText(/asked you to book the wall/)).toBeInTheDocument();
		await vi.waitFor(() =>
			expect(pushToast).toHaveBeenCalledWith({ message: expect.stringMatching(/deleted/i) })
		);
	});

	it('puts the rows back and says so when the prune fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('nope', { status: 500 }))
		);
		withRead();
		await fireEvent.click(screen.getByRole('button', { name: /Delete read alerts/ }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete them' }));

		await vi.waitFor(() =>
			expect(vi.mocked(pushToast).mock.calls[0][0].message).toMatch(/couldn/i)
		);
		expect(screen.getByText(READ_TEXT)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Delete read alerts/ })).toBeInTheDocument();
	});
});

describe('alerts page — feedback', () => {
	it('acknowledges mark-all-read immediately and names the outcome', async () => {
		renderPage(FEED);
		await fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
		await vi.waitFor(() =>
			expect(pushToast).toHaveBeenCalledWith({ message: expect.stringMatching(/read/i) })
		);
		expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument();
	});

	it('says so when mark-all-read fails instead of swallowing it', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('nope', { status: 500 }))
		);
		renderPage(FEED);
		await fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
		await vi.waitFor(() => expect(pushToast).toHaveBeenCalled());
		expect(vi.mocked(pushToast).mock.calls[0][0].message).toMatch(/couldn/i);
		expect(screen.getByRole('button', { name: 'Mark all read' })).toBeInTheDocument();
	});

	it('clears the row dot optimistically, before the POST settles', async () => {
		// The fetch never resolves: the point is what the user sees meanwhile.
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise(() => {}))
		);
		renderPage([dbRow({ id: 'n1', type: 'task_completed' })]);
		const row = screen.getByRole('list', { name: 'Just news' }).querySelector('li')!;
		expect(row.getAttribute('data-unread')).toBe('true');
		await fireEvent.click(screen.getByRole('link', { name: /completed "Weekly meal plan"/ }));
		expect(row.getAttribute('data-unread')).toBe('false');
	});

	it('still navigates when the read-mark fails, and says so', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('nope', { status: 500 }))
		);
		renderPage(FEED);
		await fireEvent.click(screen.getByRole('link', { name: /asked you to book the wall/ }));
		await vi.waitFor(() => expect(pushToast).toHaveBeenCalled());
		expect(goto).toHaveBeenCalledWith('/calendar/tasks');
	});
});
