import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import ReportBugPage from './+page.svelte';
import type { ActionData } from './$types';
import type { BugArea } from '$lib/server/db/actions/bugReports';

// oxlint-disable-next-line anti-slop/no-module-mocking -- SvelteKit $app/forms is framework-injected; no DI seam exists.
const enhanceCalls = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock('$app/forms', () => ({
	enhance: vi.fn((_node: HTMLFormElement, submit: () => unknown) => {
		enhanceCalls.push(submit);
		return { destroy: () => {} };
	})
}));

afterEach(() => {
	cleanup();
	enhanceCalls.length = 0;
	vi.clearAllMocks();
});

const areas: BugArea[] = ['calendar', 'tasks', 'account', 'dashboard', 'other'];

function renderForm(form: ActionData | undefined) {
	return render(ReportBugPage, {
		props: { data: { areas, from: '/calendar/tasks' }, form: form ?? null }
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

	it('posts the originating page back as a hidden `from` field (issue 257)', () => {
		renderForm(undefined);
		const input = document.querySelector<HTMLInputElement>('input[type="hidden"][name="from"]');
		expect(input?.value).toBe('/calendar/tasks');
	});

	// Issue 258: /report-bug sits outside the app layouts, so an installed PWA
	// had no way back without submitting.
	it('offers a Back link to the originating page before submit', () => {
		renderForm(undefined);
		expect(screen.getByRole('link', { name: /back/i }).getAttribute('href')).toBe(
			'/calendar/tasks'
		);
	});

	it('Back falls back to /calendar when the origin is unknown', () => {
		render(ReportBugPage, { props: { data: { areas, from: '' }, form: null } });
		expect(screen.getByRole('link', { name: /back/i }).getAttribute('href')).toBe('/calendar');
	});

	it('disables the submit button while the report is sending', async () => {
		renderForm(undefined);
		const button = screen.getByRole('button', { name: /submit bug report/i });
		expect(button).not.toBeDisabled();
		expect(enhanceCalls.length).toBe(1);
		enhanceCalls[0]();
		await tick();
		expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
	});
});
