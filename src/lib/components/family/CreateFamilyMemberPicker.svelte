<script lang="ts">
	/**
	 * "Who is in it" — the member picker on the create page (issue 076).
	 *
	 * A family created with nobody in it is a shell: the calendar belongs to the
	 * family, and with no members there is nobody to see it. So members come
	 * before the finish line.
	 *
	 * The search is `/api/family/member-search`, its own door rather than the
	 * invite-flow one: that one refuses any caller who is not already a member of
	 * the family in the query string, and here there is no family yet (issue
	 * 100). It carries its own bounds — a two-character floor, ten rows, no
	 * ordering — and the picker shows the names and addresses it returns.
	 *
	 * The picker only chooses. Whether a pick can be added is the create
	 * action's answer: it re-checks every id against a real verified account and
	 * against the plan's member limit, and this component cannot add anybody by
	 * itself.
	 */
	interface FoundUser {
		id: string;
		firstName: string;
		lastName: string;
		email: string;
	}

	interface Props {
		/** How many people the plan allows in one family, creator included. */
		limit: number;
		/**
		 * Called with the current picks whenever they change. The create page uses
		 * it to draw the approved preview's avatar strip (`family-create.html:63-66`),
		 * which sits above this component and so cannot read `picked` itself.
		 */
		onPicked?: (people: FoundUser[]) => void;
	}

	let { limit, onPicked }: Props = $props();

	let query = $state('');
	let results = $state<FoundUser[]>([]);
	let picked = $state<FoundUser[]>([]);
	let searching = $state(false);
	let searchedFor = $state('');
	let searchFailed = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let searchRequestId = 0;

	$effect(() => {
		onPicked?.(picked);
	});

	// The search refuses anything shorter, so the picker does not spend a
	// request on a letter the answer would be empty for.
	const MIN_QUERY = 2;
	/** The creator is already in the family, so the room left is one short. */
	const roomLeft = $derived(limit - 1 - picked.length);

	async function search() {
		const term = query.trim();
		if (term.length < MIN_QUERY) {
			results = [];
			searchedFor = '';
			return;
		}
		const requestId = ++searchRequestId;
		searching = true;
		searchFailed = false;
		try {
			// Anyone already on the list is excluded server-side, so a second
			// look cannot offer them again.
			const exclude = picked.map((p) => `exclude=${encodeURIComponent(p.id)}`).join('&');
			const res = await fetch(
				`/api/family/member-search?q=${encodeURIComponent(term)}${exclude ? `&${exclude}` : ''}`
			);
			const json = await res.json().catch(() => ({}));
			if (requestId !== searchRequestId) return;
			results = json.users ?? [];
			searchedFor = term;
		} catch {
			if (requestId !== searchRequestId) return;
			results = [];
			searchedFor = term;
			searchFailed = true;
		} finally {
			if (requestId === searchRequestId) searching = false;
		}
	}

	function handleInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(search, 300);
	}

	function add(user: FoundUser) {
		clearTimeout(searchTimer);
		if (picked.some((p) => p.id === user.id)) return;
		picked = [...picked, user];
		query = '';
		results = [];
		searchedFor = '';
	}

	function remove(id: string) {
		picked = picked.filter((p) => p.id !== id);
	}

	function fullName(user: FoundUser): string {
		return `${user.firstName} ${user.lastName}`.trim() || user.email;
	}
</script>

<div>
	<div class="flex items-baseline justify-between gap-2">
		<span class="text-sm font-medium text-slate-500">Who is in it</span>
		<span class="text-xs text-slate-400">{`${picked.length + 1} of ${limit} members`}</span>
	</div>
	<p class="mt-1 text-xs leading-relaxed text-slate-500">
		Pick the people who already have an account. Anyone new — a second parent, a grandparent, a
		child — you add from the family page once it exists.
	</p>

	{#if picked.length > 0}
		<ul class="mt-3 space-y-2">
			{#each picked as person (person.id)}
				<!-- The approved `.pick` row, in its chosen state
				     (`family-create.html:20-21`): a terracotta border, a warm wash
				     and a filled round badge with a tick. The row also carries the
				     Remove control, so the same affordance is not duplicated. -->
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
						onclick={() => remove(person.id)}
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
			bind:value={query}
			oninput={handleInput}
			aria-busy={searching}
			class="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
		/>

		{#if searching}
			<div class="py-3 text-sm text-slate-500">Searching…</div>
		{:else if searchFailed}
			<p class="py-3 text-sm text-slate-500">
				Couldn't search just now. Try again, or invite them by email from the family page.
			</p>
		{:else if results.length > 0}
			<ul class="mt-2 max-h-60 overflow-y-auto rounded-lg border border-slate-200">
				{#each results as person (person.id)}
					<li>
						<button
							type="button"
							onclick={() => add(person)}
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
		{:else if searchedFor}
			<p class="py-3 text-sm text-slate-500">
				No account by that name. Send them an email invite from the family page instead.
			</p>
		{/if}
	{/if}

	<!-- The picks ride along with the create form. The action re-checks every
	     id; this is a request, not a promise. -->
	{#each picked as person (person.id)}
		<input type="hidden" name="memberIds" value={person.id} />
	{/each}
</div>
