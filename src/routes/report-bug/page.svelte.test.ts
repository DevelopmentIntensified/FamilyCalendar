import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import ReportBugPage from './+page.svelte';

vi.mock('$app/forms', () => ({
	enhance: vi.fn(() => vi.fn())
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const areas = ['calendar', 'tasks', 'account', 'dashboard', 'other'];

function renderForm(form: unknown) {
	return render(ReportBugPage, {
		props: { data: { areas }, form: form as never }
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