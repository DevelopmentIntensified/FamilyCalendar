/**
 * feedback report state: the `/report-bug` form's client state.
 *
 * Two things live here instead of in the component:
 *
 * - **The recorded page.** Issue 257: the form carries the page the bug was
 *   on as `?from=`. After a submit the enhanced reload runs with the form's
 *   own path as the referer, which `safeReportedPath` refuses, so the load's
 *   `from` comes back empty — the first non-empty value must survive or the
 *   Back link and the next hidden `from` lose the origin.
 * - **The pending flag.** Issue 258: the page sits outside the app layouts and
 *   a slow submit must say so ("Submitting…", disabled) rather than look dead.
 *
 * `FeedbackFormEnhancer` is the `enhance` action's shape, declared here so a
 * UI component can take the function as a prop without importing `$app/*`.
 *
 * Doc: ./README.md#public-interface
 */
import type { SubmitFunction } from '@sveltejs/kit';

/** The `$app/forms` `enhance` action, structurally: node in, action out. */
export type FeedbackFormEnhancer = (
	node: HTMLFormElement,
	submit: SubmitFunction
) => { destroy(): void };

export class ReportBugState {
	/** The recorded page, kept across the post-submit reload (issue 257). */
	from = $state('');
	/** The submit is in flight: the button reads "Submitting…" and is disabled. */
	submitting = $state(false);

	constructor(from: string) {
		this.from = from;
	}

	/** Keep the first non-empty origin: the post-submit reload reports none. */
	rememberFrom(from: string): void {
		if (from) this.from = from;
	}

	startSubmit(): void {
		this.submitting = true;
	}

	finishSubmit(): void {
		this.submitting = false;
	}
}
