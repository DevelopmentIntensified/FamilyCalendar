<!--
	`/report-bug` page body. Legacy `src/routes/report-bug/+page.svelte` is the
	reference for the markup: the same card, copy, Back link, error banner,
	"Submitting…" button and success panel. Ported to Svelte 5 runes with the
	state in `../feedback.report.state.svelte.ts`.

	Data and the framework's `enhance` come in as props (the route is wiring);
	the form posts `?/submit` as legacy did. `form` is the action's echoed
	failure (`error`, `area`, `description`) or `{ ok: true }`; the typed
	inputs are restored from it so a failed submit never clears the report.

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { BugArea } from '../feedback.contract';
	import {
		ReportBugState,
		type FeedbackFormEnhancer
	} from '../feedback.report.state.svelte.js';

	interface Props {
		areas: BugArea[];
		from: string;
		form: {
			readonly ok?: boolean;
			readonly error?: string;
			readonly area?: string;
			readonly description?: string;
		} | null;
		enhance: FeedbackFormEnhancer;
	}

	let { areas, from, form, enhance }: Props = $props();

	/** The select's friendlier labels: only a person reads them, so they live here. */
	const areaLabels: Record<BugArea, string> = {
		calendar: 'Calendar / events',
		tasks: 'Tasks',
		account: 'Account / settings',
		payments: 'Payments / subscription',
		dashboard: 'Dashboard',
		other: 'Something else'
	};

	const state = new ReportBugState(from);

	const submitted = $derived(form?.ok === true);
	const errorText = $derived(submitted ? undefined : form?.error);
	const echoedArea = $derived(isString(form?.area) ? form.area : 'calendar');
	const echoedDescription = $derived(isString(form?.description) ? form.description : '');
	const backHref = $derived(state.from || '/calendar');

	/** True for string values (echoed action inputs that must be text). */
	function isString(value: unknown): value is string {
		return typeof value === 'string';
	}

	/** Issue 258: show the pending state while the action runs. */
	const onSubmit: SubmitFunction = () => {
		state.startSubmit();
		return async ({ update }) => {
			try {
				await update({ reset: false });
				// Issue 257: the enhanced reload loses the origin; keep the first one.
				state.rememberFrom(from);
			} finally {
				state.finishSubmit();
			}
		};
	};
</script>

<svelte:head>
	<title>Report a Bug - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8 pt-20">
	<div class="mx-auto max-w-xl">
		<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			{#if submitted}
				<div class="py-6 text-center">
					<div
						class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
					>
						<svg
							class="h-6 w-6 text-green-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					</div>
					<h1 class="mb-1 text-lg font-bold text-slate-900">Thanks — report submitted</h1>
					<p class="text-sm text-slate-500">
						We've logged your bug report. We'll use it to make the app better.
					</p>
					<a
						href="/calendar"
						class="mt-5 inline-block rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
					>
						Back to Calendar
					</a>
				</div>
			{:else}
				<a
					href={backHref}
					data-testid="report-bug-back"
					class="-ml-2 mb-3 inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
				>
					<span aria-hidden="true">←</span> Back
				</a>
				<h1 class="mb-1 text-xl font-bold text-slate-900">Report a Bug</h1>
				<p class="mb-5 text-sm text-slate-500">
					Something not working? Tell us what happened and we'll look into it.
				</p>

				{#if errorText}
					<div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
						{errorText}
					</div>
				{/if}

				<form method="POST" action="?/submit" use:enhance={onSubmit} class="space-y-4">
					<input type="hidden" name="from" value={state.from} />
					<div class="space-y-2">
						<label for="area" class="block text-sm font-medium text-slate-700"
							>What's the bug about?</label
						>
						<select
							id="area"
							name="area"
							value={echoedArea}
							class="w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
						>
							{#each areas as area (area)}
								<option value={area}>{areaLabels[area] ?? area}</option>
							{/each}
						</select>
					</div>

					<div class="space-y-2">
						<label for="description" class="block text-sm font-medium text-slate-700">
							Describe the bug
						</label>
						<textarea
							id="description"
							name="description"
							rows="6"
							placeholder="What were you doing, what happened, and what did you expect to happen?"
							value={echoedDescription}
							maxlength="5000"
							class="w-full resize-y rounded-lg border border-slate-300 px-4 py-2.5 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
						></textarea>
					</div>

					<button
						type="submit"
						disabled={state.submitting}
						data-testid="submit-bug-report"
						class="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
					>
						{state.submitting ? 'Submitting…' : 'Submit Bug Report'}
					</button>
				</form>
			{/if}
		</div>
	</div>
</div>
