/**
 * `/report-bug` form state, in node: the recorded origin keeps the first
 * non-empty value (issue 257) and the pending flag brackets one submit
 * (issue 258). The component renders; the action owns the server side.
 *
 * Doc: ./README.md#invariants
 */
import { describe, expect, it } from 'vitest';
import { ReportBugState } from './feedback.report.state.svelte.js';

describe('ReportBugState', () => {
	it('starts from the origin the load resolved', () => {
		expect(new ReportBugState('/calendar/tasks').from).toBe('/calendar/tasks');
	});

	it('keeps the first origin when the post-submit reload reports none (issue 257)', () => {
		const state = new ReportBugState('/calendar/tasks');
		state.rememberFrom('');
		expect(state.from).toBe('/calendar/tasks');
	});

	it('takes a later origin only when it is not empty', () => {
		const state = new ReportBugState('');
		state.rememberFrom('/account');
		expect(state.from).toBe('/account');
	});

	it('brackets one submit with the pending flag (issue 258)', () => {
		const state = new ReportBugState('/calendar');
		expect(state.submitting).toBe(false);
		state.startSubmit();
		expect(state.submitting).toBe(true);
		state.finishSubmit();
		expect(state.submitting).toBe(false);
	});
});
