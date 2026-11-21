<!--
	What was checked off THIS session: each entry struck through, carrying the
	Mine / Family badge of the list it came from, and unchecking on that scope
	(never on the filter). The section only exists after something is checked —
	the only place uncheck has a UI.

	Legacy `groceries/+page.svelte` is the reference for the copy and classes.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import type { GroceriesListState } from '../groceries.list.state.svelte';

	interface Props {
		state: GroceriesListState;
	}

	let { state }: Props = $props();
</script>

{#if state.checked.length}
	<section aria-label="Checked off" class="rounded-xl border border-slate-200 p-3">
		<h2 class="text-xs font-bold uppercase tracking-wide text-slate-500">
			Checked off ({state.checked.length})
		</h2>
		<ul class="mt-1 space-y-1">
			{#each state.checked as record (record.item.id)}
				<li class="flex items-center gap-2">
					<button
						role="checkbox"
						aria-checked="true"
						aria-label="Uncheck {record.item.name}"
						disabled={state.busyId === record.item.id}
						class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-slate-400 text-xs leading-none text-slate-500 hover:border-primary-500"
						onclick={() => state.uncheck(record.item, record.scope)}>✓</button
					>
					<span class="min-w-0 truncate text-sm text-slate-400 line-through"
						>{record.item.name}</span
					>
					<!-- Which list it went back to, in words. -->
					<span
						class="ml-auto shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-slate-500"
						>{record.scope === 'mine' ? 'Mine' : 'Family'}</span
					>
				</li>
			{/each}
		</ul>
	</section>
{/if}
