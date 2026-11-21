/**
 * `/report-bug` page body as the person sees it: the form, the inline error
 * with the typed inputs kept, the Back link to the recorded page, the pending
 * submit and the success panel. The legacy route test
 * `src/routes/report-bug/page.svelte.test.ts` asserted the same things; this
 * file replaces it (S8 deleted the old one).
 *
 * Doc: ../README.md#invariants
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import type { BugArea } from '../feedback.contract';
import type { FeedbackFormEnhancer } from '../feedback.report.state.svelte';
import ReportBugForm from './ReportBugForm.svelte';

const AREAS: BugArea[] = ['calendar', 'tasks', 'account', 'payments', 'dashboard', 'other'];

type FormEcho = {
	ok?: boolean;
	error?: string;
	area?: string;
	description?: string;
} | null;

afterEach(cleanup);

/** The `enhance` action as the route passes it; captures the submit function. */
function captureEnhance(): { enhance: FeedbackFormEnhancer; submits: SubmitFunction[] } {
	const submits: SubmitFunction[] = [];
	const enhance: FeedbackFormEnhancer = (_node, submit) => {
		submits.push(submit);
		return { destroy: () => {} };
	};
	return { enhance, submits };
}

function renderForm(form: FormEcho, from = '/calendar/tasks'): SubmitFunction[] {
	const { enhance, submits } = captureEnhance();
	render(ReportBugForm, { props: { areas: AREAS, from, form, enhance } });
	return submits;
}

describe('ReportBugForm', () => {
	it('shows the form before submit', () => {
		renderForm(null);
		expect(screen.getByRole('heading', { name: 'Report a Bug' })).toBeInTheDocument();
		expect(screen.queryByText('Thanks — report submitted')).not.toBeInTheDocument();
		expect(screen.getByLabelText("What's the bug about?")).toBeInTheDocument();
		expect(screen.getByLabelText('Describe the bug')).toBeInTheDocument();
	});

	it('shows the success confirmation after the action returns ok (bug: no feedback shown)', () => {
		renderForm({ ok: true });
		expect(screen.getByText('Thanks — report submitted')).toBeInTheDocument();
		expect(screen.queryByText('Report a Bug')).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Back to Calendar' })).toHaveAttribute(
			'href',
			'/calendar'
		);
	});

	it('surfaces the server error and keeps the echoed inputs', () => {
		renderForm({
			error: 'Please describe the bug.',
			area: 'account',
			description: '  it broke  '
		});

		expect(screen.getByRole('alert')).toHaveTextContent('Please describe the bug.');
		expect(document.querySelector<HTMLSelectElement>('#area')?.value).toBe('account');
		expect(document.querySelector<HTMLTextAreaElement>('#description')?.value).toBe(
			'  it broke  '
		);
	});

	it('posts the originating page back as a hidden `from` field (issue 257)', () => {
		renderForm(null);
		const input = document.querySelector<HTMLInputElement>('input[type="hidden"][name="from"]');
		expect(input?.value).toBe('/calendar/tasks');
	});

	// Issue 258: /report-bug sits outside the app layouts, so an installed PWA
	// had no way back without submitting.
	it('offers a Back link to the originating page before submit', () => {
		renderForm(null);
		expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute(
			'href',
			'/calendar/tasks'
		);
	});

	it('Back falls back to /calendar when the origin is unknown', () => {
		renderForm(null, '');
		expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/calendar');
	});

	it('disables the submit button and says "Submitting…" while the action runs', async () => {
		const submits = renderForm(null);
		const form = document.querySelector('form');
		if (!form) throw new Error('expected the report form');

		const pending = Promise.withResolvers<void>();
		const input = {
			action: new URL('http://localhost/report-bug?/submit'),
			formData: new FormData(form),
			formElement: form,
			controller: new AbortController(),
			submitter: null,
			cancel: () => {}
		};
		const submission = submits[0]!(input);
		if (typeof submission !== 'function') {
			throw new Error('expected the action to return an update callback');
		}

		const running = submission({
			formData: new FormData(form),
			formElement: form,
			action: input.action,
			result: { type: 'success', status: 200, data: {} },
			update: () => pending.promise,
			applyAction: async () => {}
		});

		await tick();
		expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();

		pending.resolve();
		await running;
		await tick();
		expect(screen.getByRole('button', { name: /submit bug report/i })).not.toBeDisabled();
	});
});
