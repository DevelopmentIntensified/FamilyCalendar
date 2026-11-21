<!--
	"Find someone": a debounced exact-match search in this family, one chosen
	person confirmed before the direct add. Search problems are reported above
	the pane, never shown as "no match".

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import type { FamilyMemberSearchState } from '../family.addMember.state.svelte';

	interface Props {
		state: FamilyMemberSearchState;
		onfail: (message: string) => void;
		onadded: () => void;
	}

	let { state, onfail, onadded }: Props = $props();

	async function add(): Promise<void> {
		const outcome = await state.add();
		if (!outcome.ok) {
			if (outcome.error) onfail(outcome.error);
			return;
		}
		onadded();
	}
</script>

{#if state.selected}
	<div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
		<div class="mb-3 flex items-center justify-between">
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-700"
				>
					{state.selected.firstName?.[0] || '?'}
				</div>
				<div>
					<p class="font-medium text-slate-900">
						{state.selected.firstName}
						{state.selected.lastName}
					</p>
					<p class="text-sm text-slate-500">{state.selected.email}</p>
				</div>
			</div>
			<button onclick={() => state.clear()} class="text-sm text-slate-500 hover:text-slate-700">
				Change
			</button>
		</div>
		<button
			onclick={add}
			disabled={state.inviting}
			class="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
		>
			{state.inviting ? 'Adding...' : 'Add to Family'}
		</button>
	</div>
{:else}
	<div class="mb-4">
		<label for="search" class="mb-2 block text-sm font-medium text-slate-700"
			>Search by name or email</label
		>
		<input
			type="text"
			id="search"
			placeholder="Type to search..."
			value={state.query}
			oninput={(event) => state.setQuery(event.currentTarget.value)}
			class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
		/>
	</div>

	{#if state.searching}
		<div class="py-4 text-center text-sm text-slate-500">Searching...</div>
	{:else if state.results.length > 0}
		<ul class="max-h-60 overflow-y-auto rounded-lg border border-slate-200">
			{#each state.results as user (user.id)}
				<li>
					<button
						onclick={() => state.select(user)}
						class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
					>
						<div
							class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-sm font-medium text-slate-600"
						>
							{user.firstName?.[0] || '?'}
						</div>
						<div>
							<p class="font-medium text-slate-900">{user.firstName} {user.lastName}</p>
							<p class="text-sm text-slate-500">{user.email}</p>
						</div>
					</button>
				</li>
			{/each}
		</ul>
	{:else if state.searchedFor && state.query === state.searchedFor}
		<div class="py-4 text-center text-sm text-slate-400">
			No users found for '{state.searchedFor}'
		</div>
	{/if}
{/if}
