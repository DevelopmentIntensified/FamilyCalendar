<!--
	The error card: three branches, from `shellErrorView` (`../shell.error.rules`)
	— a 404 miss, any other 4xx (the server's own reason, never claiming a
	notification) and a 5xx (the only branch that promises one and links the bug
	form). Issue 261: `handleError` never runs for a 4xx, so the legacy copy's
	"we've been notified" was false there.

	The status line and the document title stay here because the card is their
	only consumer. `pathname`/`search` are strings, not a URL, so the component
	survives prerendering and never touches `$app/*`.

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import { reportBugHref } from '$lib/domains/feedback';
	import { shellErrorView } from '../shell.error.rules';

	interface Props {
		status: number;
		/** `$page.error?.message` — the 4xx reason, used only on that branch. */
		message?: string | null;
		pathname: string;
		search?: string;
	}

	let { status, message = null, pathname, search = '' }: Props = $props();

	const view = $derived(shellErrorView(status, message));
	const bugHref = $derived(reportBugHref(`${pathname}${search}`));
	const isNotFound = $derived(status === 404);
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
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M9.5 9.5a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 3.5M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			{:else}
				<svg class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
					/>
				</svg>
			{/if}
		</div>
		<p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Error {status}</p>
		<h1 class="mt-1 text-2xl font-bold text-slate-900">{view.title}</h1>
		<p class="mt-2 text-sm text-slate-600">{view.body}</p>
		<div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
			<a
				href="/calendar"
				class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
			>
				Back to calendar
			</a>
			{#if view.showReport}
				<a
					href={bugHref}
					class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
				>
					Add details to the report
				</a>
			{/if}
		</div>
	</div>
</div>
