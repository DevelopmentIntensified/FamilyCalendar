<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	const areaLabels: Record<string, string> = {
		calendar: 'Calendar / events',
		tasks: 'Tasks',
		account: 'Account / settings',
		payments: 'Payments / subscription',
		dashboard: 'Dashboard',
		other: 'Something else'
	};

	let submitted = false;
	if (form?.ok) submitted = true;

	// `form` is a union across action branches; only failure branches carry the
	// echoed inputs, so guard before reading them.
	$: echoedArea = form && 'area' in form && typeof form.area === 'string' ? form.area : 'calendar';
	$: echoedDescription =
		form && 'description' in form && typeof form.description === 'string' ? form.description : '';
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
				<h1 class="mb-1 text-xl font-bold text-slate-900">Report a Bug</h1>
				<p class="mb-5 text-sm text-slate-500">
					Something not working? Tell us what happened and we'll look into it.
				</p>

				{#if form && !form.ok && form.error}
					<div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{form.error}</div>
				{/if}

				<form
					method="POST"
					action="?/submit"
					use:enhance={() => {
						return async ({ update }) => {
							await update({ reset: false });
						};
					}}
					class="space-y-4"
				>
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
							{#each data.areas as area}
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
						class="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
					>
						Submit Bug Report
					</button>
				</form>
			{/if}
		</div>
	</div>
</div>
