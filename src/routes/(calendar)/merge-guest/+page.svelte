<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	export let data: PageData;

	let busyMerge = false;
	let busySkip = false;
	/** Two-tap inline confirm for the destructive "start fresh" path. */
	let confirmSkip = false;

	$: totalItems = data.guestEvents + data.guestTasks;
</script>

<div class="flex min-h-[70vh] items-center justify-center px-4">
	<div
		class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"
	>
		<div
			class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary-100"
		>
			<svg
				class="h-7 w-7 text-primary-600"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
				/>
			</svg>
		</div>

		<h1 class="text-2xl font-bold text-slate-900">Welcome back, {data.accountFirstName}</h1>
		<p class="mt-2 text-slate-600">
			{#if data.guestEvents > 0 && data.guestTasks > 0}
				You created
				<strong>{data.guestEvents} event{data.guestEvents === 1 ? '' : 's'}</strong>
				and <strong>{data.guestTasks} task{data.guestTasks === 1 ? '' : 's'}</strong>
				as a guest. Bring them into this account?
			{:else if data.guestEvents > 0}
				You created
				<strong>{data.guestEvents} event{data.guestEvents === 1 ? '' : 's'}</strong>
				as a guest. Bring {data.guestEvents === 1 ? 'it' : 'them'} into this account?
			{:else}
				You created
				<strong>{data.guestTasks} task{data.guestTasks === 1 ? '' : 's'}</strong>
				as a guest. Bring {data.guestTasks === 1 ? 'it' : 'them'} into this account?
			{/if}
		</p>

		<ul class="mx-auto mt-5 max-w-xs space-y-1.5 text-left">
			<li class="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
				<svg
					class="h-4 w-4 shrink-0 text-emerald-500"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
				Events move onto your personal calendar
			</li>
			<li class="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
				<svg
					class="h-4 w-4 shrink-0 text-emerald-500"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
				Event checklists come along too
			</li>
			<li class="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
				<svg
					class="h-4 w-4 shrink-0 text-emerald-500"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
				The guest profile is cleaned up
			</li>
		</ul>

		<div class="mt-7 flex flex-col gap-2">
			<form
				method="POST"
				action="?/merge"
				use:enhance={() => {
					busyMerge = true;
					return async ({ update }) => {
						await update();
						busyMerge = false;
						busySkip = false;
					};
				}}
			>
				<button
					type="submit"
					disabled={busyMerge || busySkip}
					class="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
				>
					{busyMerge ? 'Bringing them over...' : `Bring my ${totalItems} items over`}
				</button>
			</form>
			<form
				method="POST"
				action="?/skip"
				use:enhance={() => {
					busySkip = true;
					return async ({ update }) => {
						await update();
						busyMerge = false;
						busySkip = false;
					};
				}}
			>
				{#if confirmSkip}
					<div class="flex items-center justify-center gap-1.5">
						<span class="text-xs font-medium text-red-600">Leave them behind?</span>
						<button
							type="submit"
							disabled={busyMerge || busySkip}
							class="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
						>
							{busySkip ? 'Starting fresh…' : 'Yes'}
						</button>
						<button
							type="button"
							onclick={() => (confirmSkip = false)}
							disabled={busyMerge || busySkip}
							class="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
						>
							No
						</button>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => (confirmSkip = true)}
						disabled={busyMerge || busySkip}
						class="text-sm font-medium text-slate-400 hover:text-slate-600"
					>
						Start fresh without them
					</button>
				{/if}
			</form>
		</div>
	</div>
</div>
