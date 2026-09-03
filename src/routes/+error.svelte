<script lang="ts">
	import { page } from '$app/stores';

	$: status = $page.status ?? 500;
	$: isNotFound = status === 404;
	$: title = isNotFound ? "We can't find that page" : 'Something went wrong';
	$: body = isNotFound
		? 'The link may be mistyped, or the page moved. Your calendar and tasks are safe.'
		: "We've been notified automatically and will look into it. Your data is safe — try going back to your calendar.";
</script>

<svelte:head>
	<title>{status} · Family Planz</title>
</svelte:head>

<div class="flex min-h-[70vh] items-center justify-center px-4 py-16">
	<div class="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
		<div
			class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full {isNotFound
				? 'bg-slate-100 text-slate-500'
				: 'bg-amber-100 text-amber-600'}"
			aria-hidden="true"
		>
			{#if isNotFound}
				<svg class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9.5 9.5a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 3.5M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
			{:else}
				<svg class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
				</svg>
			{/if}
		</div>
		<p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Error {status}</p>
		<h1 class="mt-1 text-2xl font-bold text-slate-900">{title}</h1>
		<p class="mt-2 text-sm text-slate-600">{body}</p>
		<div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
			<a
				href="/calendar"
				class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
			>
				Back to calendar
			</a>
			{#if !isNotFound}
				<a
					href="/report-bug"
					class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
				>
					Add details to the report
				</a>
			{/if}
		</div>
	</div>
</div>
