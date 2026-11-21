<!--
	"Who is in it" — the create page's member picker (issue 076). The search is
	the create page's own door (`/api/family/member-search`, issue 100); picks
	ride along with the create form as one hidden `memberIds` field each, and
	the action re-checks every id against a real verified account and the plan's
	member limit.

	The picker owns the choice through the page's state (so the preview above it
	can draw the same people); this component only renders and forwards.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import type { FamilyCreateState } from '../family.create.state.svelte';
	import { familyPickRoomLeft } from '../family.create.rules';

	interface Props {
		state: FamilyCreateState;
		/** How many people the plan allows in one family, creator included. */
		limit: number;
	}

	let { state, limit }: Props = $props();

	const roomLeft = $derived(familyPickRoomLeft(limit, state.picked.length));

	function fullName(person: { firstName: string; lastName: string; email: string | null }): string {
		return `${person.firstName} ${person.lastName}`.trim() || person.email || 'Family member';
	}
</script>

<div>
	<div class="flex items-baseline justify-between gap-2">
		<span class="text-sm font-medium text-slate-500">Who is in it</span>
		<span class="text-xs text-slate-400">{`${state.picked.length + 1} of ${limit} members`}</span>
	</div>
	<p class="mt-1 text-xs leading-relaxed text-slate-500">
		Pick the people who already have an account. Anyone new — a second parent, a grandparent, a
		child — you add from the family page once it exists.
	</p>

	{#if state.picked.length > 0}
		<ul class="mt-3 space-y-2">
			{#each state.picked as person (person.id)}
				<li
					data-testid="picked-row"
					data-picked="true"
					class="flex min-h-11 items-center gap-3 rounded-[0.875rem] border border-primary-600 bg-orange-50/60 px-3 py-2.5"
				>
					<div
						class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-200 text-sm font-medium text-slate-600"
						aria-hidden="true"
					>
						{person.firstName?.[0] || '?'}
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-semibold text-slate-800">{fullName(person)}</p>
						<p class="truncate text-xs text-slate-500">{person.email}</p>
					</div>
					<span
						class="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary-600 text-xs text-white"
						aria-hidden="true"
					>
						✓
					</span>
					<button
						type="button"
						onclick={() => state.remove(person.id)}
						aria-label="Remove {fullName(person)}"
						class="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
					>
						Remove
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if roomLeft <= 0}
		<p class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
			That is the member limit on your plan. Add anyone else from the family page once it exists.
		</p>
	{:else}
		<label for="member-search" class="mt-3 block text-sm font-medium text-slate-500">
			Search by name or email
		</label>
		<input
			type="text"
			id="member-search"
			placeholder="Search by name or email"
			value={state.query}
			oninput={(event) => state.setQuery(event.currentTarget.value)}
			aria-busy={state.searching}
			class="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
		/>

		{#if state.searching}
			<div class="py-3 text-sm text-slate-500">Searching…</div>
		{:else if state.searchFailed}
			<p class="py-3 text-sm text-slate-500">
				Couldn't search just now. Try again, or invite them by email from the family page.
			</p>
		{:else if state.results.length > 0}
			<ul class="mt-2 max-h-60 overflow-y-auto rounded-lg border border-slate-200">
				{#each state.results as person (person.id)}
					<li>
						<button
							type="button"
							onclick={() => state.add(person)}
							aria-label="Add {fullName(person)}"
							class="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
						>
							<div
								class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-medium text-slate-600"
								aria-hidden="true"
							>
								{person.firstName?.[0] || '?'}
							</div>
							<div class="min-w-0">
								<p class="truncate text-sm font-medium text-slate-900">{fullName(person)}</p>
								<p class="truncate text-xs text-slate-400">{person.email}</p>
							</div>
						</button>
					</li>
				{/each}
			</ul>
		{:else if state.searchedFor}
			<p class="py-3 text-sm text-slate-500">
				No account by that name. Send them an email invite from the family page instead.
			</p>
		{/if}
	{/if}

	{#each state.picked as person (person.id)}
		<input type="hidden" name="memberIds" value={person.id} />
	{/each}
</div>
