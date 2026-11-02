import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import ErrorPage from './+error.svelte';

const pageStore = vi.hoisted(() => ({ value: null as unknown }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/stores is a framework virtual module; no DI seam exists.
vi.mock('$app/stores', async () => {
	const { writable: w } = await import('svelte/store');
	const store = w({});
	pageStore.value = store;
	return { page: store };
});

function setPage(status: number, message: string) {
	(pageStore.value as ReturnType<typeof writable>).set({
		status,
		error: { message },
		url: new URL('http://localhost/calendar/event/1')
	});
}

afterEach(cleanup);

// Issue 261: expected errors (4xx) were shown as "we've been notified" with a
// report CTA, and the actual reason (e.g. "No access to this event") hidden.
describe('+error page', () => {
	it('shows the reason for a 4xx and does not claim we were notified', () => {
		setPage(403, 'No access to this event');
		render(ErrorPage);
		expect(screen.getByText('No access to this event')).toBeInTheDocument();
		expect(screen.queryByText(/notified/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/Add details to the report/)).not.toBeInTheDocument();
	});

	it('keeps the not-found copy for 404', () => {
		setPage(404, 'Not Found');
		render(ErrorPage);
		expect(screen.getByText("We can't find that page")).toBeInTheDocument();
		expect(screen.queryByText(/notified/i)).not.toBeInTheDocument();
	});

	it('keeps the notified copy and report CTA for 5xx', () => {
		setPage(500, 'Internal Error');
		render(ErrorPage);
		expect(screen.getByText(/notified automatically/)).toBeInTheDocument();
		expect(screen.getByText('Add details to the report')).toBeInTheDocument();
	});
});
