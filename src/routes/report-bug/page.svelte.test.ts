import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import ReportBugPage from './+page.svelte';
import type { ActionData } from './$types';
import type { BugArea } from '$lib/server/db/actions/bugReports';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/forms is framework-injected; no DI seam exists.
vi.mock('$app/forms', () => ({
	enhance: vi.fn(() => vi.fn())
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const areas: BugArea[] = ['calendar', 'tasks', 'account', 'dashboard', 'other'];

function renderForm(form: ActionData | undefined) {
	return render(ReportBugPage, {
		props: { data: { areas }, form: form ?? null }
	});
}

describe('/report-bug page', () => {
	it('shows the form before submit', () => {
		renderForm(undefined);
		expect(screen.getByText('Report a Bug')).toBeInTheDocument();
		expect(screen.queryByText('Thanks — report submitted')).not.toBeInTheDocument();
	});

	it('shows the success confirmation after the action returns ok (bug: no feedback shown)', async () => {
		renderForm({ ok: true });
		expect(await screen.findByText('Thanks — report submitted')).toBeInTheDocument();
		expect(screen.queryByText('Report a Bug')).not.toBeInTheDocument();
	});

	it('surfaces the server error when the action fails', () => {
		renderForm({ error: 'Please describe the bug.', area: 'calendar', description: '' });
		expect(screen.getByText('Please describe the bug.')).toBeInTheDocument();
		expect(screen.queryByText('Thanks — report submitted')).not.toBeInTheDocument();
	});
});
