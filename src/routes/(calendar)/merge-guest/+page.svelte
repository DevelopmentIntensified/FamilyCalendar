<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let busy = false;
</script>

<div class="flex min-h-[70vh] items-center justify-center px-4">
	<div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
		<div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary-100">
			<svg class="h-7 w-7 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
			</svg>
		</div>

		<h1 class="text-2xl font-bold text-slate-900">Welcome back, {data.accountFirstName}</h1>
		<p class="mt-2 text-slate-600">
			You created
			<strong>{data.guestEvents} event{data.guestEvents === 1 ? '' : 's'}</strong>
			{#if data.guestTasks > 0}
				and <strong>{data.guestTasks} task{data.guestTasks === 1 ? '' : 's'}</strong>
			{/if}
			as a guest. Bring them into this account?
		</p>

		<ul class="mx-auto mt-5 max-w-xs space-y-1.5 text-left">
			<li class="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
				<svg class="h-4 w-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
				Events move onto your personal calendar
			</li>
			<li class="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
				<svg class="h-4 w-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
				Event checklists come along too
			</li>
			<li class="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
				<svg class="h-4 w-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
				The guest profile is cleaned up
			</li>
		</ul>

		<div class="mt-7 flex flex-col gap-2">
			<form method="POST" action="?/merge" use:enhance={() => { busy = true; }}>
				<button
					type="submit"
					disabled={busy}
					class="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
				>
					{busy ? 'Bringing them over...' : `Bring my ${data.guestEvents + data.guestTasks} items over`}
				</button>
			</form>
			<form method="POST" action="?/skip" use:enhance={() => { busy = true; }}>
				<button type="submit" disabled={busy} class="text-sm font-medium text-slate-400 hover:text-slate-600">
					Start fresh without them
				</button>
			</form>
		</div>
	</div>
</div>
