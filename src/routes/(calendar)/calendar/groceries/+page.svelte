<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { PageData } from './$types';
	import {
		groupGroceriesByStore,
		resolveGroceryColours,
		storesSharingColour,
		colourFor,
		matchesGrocerySearch,
		scopeFromParam,
		scopeOf,
		SCOPE_FILTERS,
		STORE_COLOURS,
		type GroceryScopeKey,
		type StoreColour,
		type StoreColourRow
	} from '$lib/data/groceries';
	import { pushToast } from '$lib/client/toasts';

	export let data: PageData;

	type Item = {
		id: string;
		name: string;
		quantity: number;
		stores: string[];
		familyId: string | null;
	};
	type Scope = 'mine' | 'family';

	// 097: the two scope tabs are gone. ONE list, a scope FILTER, both scopes
	// visible. The parameter keeps its promise — the dashboard's "Mine →" card
	// link passes ?scope=mine and must not land on the wrong list — but it now
	// selects the filter. Junk falls back to "all" rather than showing nothing.
	let scope: GroceryScopeKey = scopeFromParam(page.url.searchParams.get('scope'));
	/** The add form's scope is explicit and visible, never inferred. */
	let addScope: Scope = data.hasFamily ? 'family' : 'mine';
	let searchQuery = '';
	let input = '';
	let storeInput = '';
	let suggested: string | null = null;
	let adding = false;
	let busyId: string | null = null;
	let editingId: string | null = null;
	let editStores = '';
	let error = '';
	let hiddenIds = new Set<string>();
	/** Checked off this session — the only place uncheck has a UI. */
	let recentlyChecked: { item: Item; scope: Scope }[] = [];
	/** Store whose colour is being edited (096). */
	let colourStore: string | null = null;
	/** personal | family — which row the flip writes. Personal wins on read. */
	let colourScope: 'family' | 'personal' = 'family';
	let colourBusy = false;
	/**
	 * Optimistic colour overrides, keyed by the store name. Read inline so
	 * `$:` repaints; dropped on invalidateAll so the server stays the truth.
	 */
	let colourOverrides: Record<string, string> = {};

	function countIn(s: GroceryScopeKey): number {
		if (s === 'all') return allItems.length;
		return allItems.filter((i) => scopeOf(i) === s).length;
	}

	/** "2 items · 5 total" — the Store summary line. */
	function summary(items: Item[]): string {
		const total = items.reduce((sum, i) => sum + i.quantity, 0);
		return `${items.length} ${items.length === 1 ? 'item' : 'items'} · ${total} total`;
	}

	// ONE list, both scopes, grouped by STORE. The group is per store, not per
	// (scope, store): a shop is a shop and you do one trip to it, and a group
	// that split "Aldi" in two would show the same colour twice on one page.
	// The SCOPE rides on the row instead, in words — never in colour alone.
	$: allItems = [...(data.family as Item[]), ...(data.mine as Item[])];
	// hiddenIds, scope and searchQuery are referenced directly: a filter hidden
	// behind a helper call would drop out of Svelte's tracking and never repaint.
	$: scoped = allItems.filter((i) => scope === 'all' || scopeOf(i) === scope);
	$: searched = scoped.filter((i) => matchesGrocerySearch(i, searchQuery));
	$: items = searched.filter((i) => !hiddenIds.has(i.id));
	$: groups = groupGroceriesByStore(items);
	// The rail holds everything checked this session, from either scope.
	$: checked = recentlyChecked;
	$: queryActive = searchQuery.trim().length > 0;

	/**
	 * The colour rows the page resolves against: the loader's rows, plus any
	 * flip this session has not yet been revalidated for. Resolution is by the
	 * VIEWER, not by which tab is open, so a colour set on one list reads the
	 * same on the other.
	 */
	$: colourRows = (data.colours ?? []) as StoreColourRow[];
	$: viewer = { userId: data.userId, familyId: data.familyId };
	$: effectiveRows = [
		...colourRows,
		...Object.entries(colourOverrides).map(([key, color]) => ({
			storeKey: key,
			color,
			userId: data.userId,
			familyId: colourScope === 'family' ? data.familyId : null
		}))
	];
	$: groupNames = groups.map((g) => g.store);
	$: colours = resolveGroceryColours(groupNames, effectiveRows, viewer);
	// Every store the page shows a chip for, so a collision is disclosed.
	$: chipNames = [
		...new Set(
			items.flatMap((i) => [i.stores[0], ...i.stores.slice(1)].filter(Boolean) as string[])
		)
	];
	/** Every store name anywhere on the page, for the free-text store field. */
	$: knownStores = [
		...new Set([...(data.family as Item[]), ...(data.mine as Item[])].flatMap((i) => i.stores))
	];
	$: onPage = (name: string) => !!colourOverrides[name.trim().toLowerCase()];

	function colourOf(name: string | null | undefined): StoreColour | null {
		return colourFor(name, effectiveRows, viewer);
	}

	function twinsOf(name: string): string[] {
		return storesSharingColour(name, chipNames, effectiveRows, viewer);
	}

	async function setColour(store: string, color: string) {
		if (colourBusy) return;
		colourBusy = true;
		error = '';
		const key = store.trim().toLowerCase();
		const was = effectiveRows.find(
			(r) => r.storeKey === key && r.familyId === colourScopeForWrite()
		);
		// Optimistic repaint (<100ms ack); reverted below if the write fails.
		colourOverrides = { ...colourOverrides, [key]: color };
		const res = await fetch('/api/groceries/colours', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ store, color, scope: colourScope })
		});
		if (res.ok) {
			const label =
				color === 'auto'
					? 'Auto — back to its own default'
					: (STORE_COLOURS.find((c) => c.key === color)?.label ?? color);
			pushToast({
				message:
					color === 'auto'
						? `${store} is back to its own default colour.`
						: `${store} is now ${label}${colourScope === 'personal' ? ' (just you)' : ''}.`
			});
			colourStore = null;
			await invalidateAll();
		} else {
			if (was) colourOverrides = { ...colourOverrides, [key]: was.color };
			else {
				const next = { ...colourOverrides };
				delete next[key];
				colourOverrides = next;
			}
			error = "Couldn't set that colour. Try again.";
		}
		colourBusy = false;
	}

	function colourScopeForWrite(): string | null {
		return colourScope === 'family' ? data.familyId : null;
	}

	async function lookupSuggest(name: string) {
		const q = name.trim();
		if (!q) {
			suggested = null;
			return;
		}
		try {
			// Scoped to the scope the form is pointed at, so the suggestion never
			// silently answers for the other list.
			const res = await fetch(
				`/api/groceries?scope=${addScope}&suggest=1&name=${encodeURIComponent(q)}`
			);
			if (res.ok) suggested = (await res.json()).store ?? null;
		} catch {
			suggested = null;
		}
	}

	let debounce: ReturnType<typeof setTimeout>;
	function onInput() {
		clearTimeout(debounce);
		debounce = setTimeout(() => lookupSuggest(input), 300);
	}

	function useSuggestion() {
		if (suggested) storeInput = suggested;
	}

	async function add() {
		if (!input.trim() || adding) return;
		adding = true;
		error = '';
		const guessed = suggested;
		// Captured before the await so a mid-flight scope change cannot send
		// the item to a list the toast did not name.
		const target = addScope;
		try {
			const stores = storeInput
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			const res = await fetch('/api/groceries', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ scope: target, input, stores: stores.length ? stores : undefined })
			});
			if (res.ok) {
				// The toast names the scope: with both lists on one page, "added"
				// alone would not say where the row landed.
				pushToast({
					message: `Added "${input.trim()}" to ${target === 'mine' ? 'Mine' : 'Family'}${guessed && !storeInput ? ` — ${guessed}` : ''}.`
				});
				input = '';
				storeInput = '';
				suggested = null;
				await invalidateAll();
			} else {
				error = (await res.json().catch(() => ({}))).error || "That didn't work. Try again.";
			}
		} catch {
			error = 'Network problem. Try again.';
		} finally {
			adding = false;
		}
	}

	async function check(item: Item) {
		// Optimistic hide (<100ms ack); revert on failure.
		// The row's OWN scope, not the filter: with both lists on one page the
		// filter says what you are looking at, never where the item lives.
		const rowScope = scopeOf(item);
		hiddenIds.add(item.id);
		hiddenIds = hiddenIds;
		const res = await fetch(`/api/groceries/${item.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ scope: rowScope, op: 'check' })
		});
		if (res.ok) {
			recentlyChecked = [...recentlyChecked, { item, scope: rowScope }];
			pushToast({
				message: `Checked off "${item.name}".`,
				actionLabel: 'Undo',
				onAction: () => uncheck(item, rowScope)
			});
			await invalidateAll();
		} else {
			hiddenIds.delete(item.id);
			hiddenIds = hiddenIds;
			error = "Couldn't check that off. Try again.";
		}
	}

	async function uncheck(item: Item, scope: Scope) {
		if (busyId) return;
		busyId = item.id;
		recentlyChecked = recentlyChecked.filter((r) => r.item.id !== item.id);
		hiddenIds.delete(item.id);
		hiddenIds = hiddenIds;
		const res = await fetch(`/api/groceries/${item.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ scope, op: 'uncheck' })
		});
		if (res.ok) {
			pushToast({ message: `Put "${item.name}" back on the list.` });
			await invalidateAll();
		} else {
			recentlyChecked = [...recentlyChecked, { item, scope }];
			hiddenIds.add(item.id);
			hiddenIds = hiddenIds;
			error = "Couldn't put that back. Try again.";
		}
		busyId = null;
	}

	async function saveStores(item: Item) {
		if (busyId) return;
		busyId = item.id;
		const stores = editStores
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		const res = await fetch(`/api/groceries/${item.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ scope: scopeOf(item), op: 'stores', stores })
		});
		if (res.ok) {
			pushToast({ message: `Stores updated for "${item.name}".` });
			editingId = null;
			await invalidateAll();
		} else {
			error = "Couldn't save stores. Try again.";
		}
		busyId = null;
	}

	async function move(item: Item) {
		if (busyId) return;
		busyId = item.id;
		// A row moves to ITS other scope. The destination is derived from the
		// row, not from the filter, so "To Family" is never a no-op.
		const target: Scope = scopeOf(item) === 'mine' ? 'family' : 'mine';
		const res = await fetch(`/api/groceries/${item.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ scope: scopeOf(item), op: 'move', target })
		});
		if (res.ok) {
			pushToast({
				message: `Moved "${item.name}" to ${target === 'mine' ? 'Mine' : 'Family'}.`
			});
			editingId = null;
			await invalidateAll();
		} else {
			error = "Couldn't move that. Try again.";
		}
		busyId = null;
	}

	async function remove(item: Item) {
		if (busyId) return;
		busyId = item.id;
		const res = await fetch(`/api/groceries/${item.id}?scope=${scopeOf(item)}`, {
			method: 'DELETE'
		});
		if (res.ok) {
			pushToast({ message: `Removed "${item.name}" — store memory kept.` });
			await invalidateAll();
		} else {
			error = "Couldn't remove that. Try again.";
		}
		busyId = null;
	}
</script>

<svelte:head>
	<title>Groceries — FamilyPlanz</title>
</svelte:head>

<div class="mx-auto w-full max-w-5xl px-4 py-6">
	<h1 class="text-2xl font-bold">Groceries</h1>

	<div class="mt-4 grid items-start gap-6 lg:grid-cols-[21rem_minmax(0,1fr)]">
		<!-- ── side rail: scope filter, search, add field, checked rail ── -->
		<div class="min-w-0 space-y-4">
			<!-- One list, one filter — the same single-select chip idiom the
			     tasks page uses, so the two pages filter the same way. -->
			<div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter groceries by scope">
				{#each SCOPE_FILTERS as s (s.key)}
					<button
						type="button"
						aria-pressed={scope === s.key}
						class="min-h-[44px] shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors {scope ===
						s.key
							? 'border-slate-900 bg-slate-900 text-white'
							: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}"
						onclick={() => {
							scope = s.key;
							// When the filter names one scope, the add form follows
							// it, so the two can never silently disagree.
							if (s.key !== 'all') addScope = s.key;
						}}
						>{s.label}<span class="ml-1.5 text-xs font-normal opacity-70">{countIn(s.key)}</span
						></button
					>
				{/each}
			</div>

			<!-- A statement about the FAMILY scope, not about the page. -->
			{#if !data.hasFamily && scope !== 'mine'}
				<p class="text-sm text-gray-600">
					No family yet — join or create one to use the shared list.
				</p>
			{/if}

			<!-- Search is a filter over what is already loaded, not a new
			     request: both scopes are on the page, so there is nothing to
			     fetch. Same idiom as the tasks page's searchQuery. -->
			<div class="relative">
				<svg
					class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
					/>
				</svg>
				<input
					type="text"
					class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
					placeholder="Search items or stores…"
					aria-label="Search groceries"
					bind:value={searchQuery}
				/>
				{#if searchQuery.trim()}
					<button
						type="button"
						class="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
						aria-label="Clear search"
						onclick={() => (searchQuery = '')}
					>
						<svg
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M18 6L6 18M6 6l12 12" />
						</svg>
					</button>
				{/if}
			</div>
			{#if queryActive}
				<p class="text-xs text-sky-600">Searching “{searchQuery.trim()}”</p>
			{/if}

			<form
				class="flex min-w-0 flex-col gap-2"
				aria-label="Add a grocery item"
				onsubmit={(e) => {
					e.preventDefault();
					add();
				}}
			>
				<div class="flex min-w-0 gap-2">
					<input
						class="min-w-0 flex-1 rounded-lg border px-3 py-2"
						placeholder="Quick-add, e.g. “milk 2”"
						bind:value={input}
						oninput={onInput}
						aria-label="Add grocery item"
					/>
					<button
						type="submit"
						disabled={adding || !input.trim()}
						class="shrink-0 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
					>
						{adding ? 'Adding…' : 'Add'}
					</button>
				</div>

				<!-- The scope the new row will use is stated on the form, not
				     inferred from a tab that no longer exists. -->
				<label class="flex items-center gap-2 text-xs text-gray-500">
					<span class="shrink-0">Add to</span>
					<select
						class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
						aria-label="Add to"
						bind:value={addScope}
					>
						{#if data.hasFamily}<option value="family">Family (shared)</option>{/if}
						<option value="mine">Mine (private)</option>
					</select>
				</label>

				{#if suggested && !storeInput}
					<div class="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
						<span>Store Memory:</span>
						<button
							type="button"
							class="rounded-full border border-gray-300 bg-white px-2.5 py-1 font-semibold text-gray-700 hover:border-black"
							aria-label="Use store {suggested}"
							onclick={useSuggestion}>{suggested}</button
						>
					</div>
				{/if}

				<input
					class="w-full min-w-0 rounded-lg border px-3 py-1.5 text-sm"
					placeholder="Store (optional, comma = alternates)"
					list="known-stores"
					bind:value={storeInput}
					aria-label="Stores for this item"
				/>
				<!-- Free text means a typo is a second store, and so a second
				     colour. Offer the shops already on the lists first. -->
				<datalist id="known-stores">
					{#each knownStores as s (s)}
						<option value={s}></option>
					{/each}
				</datalist>
			</form>

			{#if error}
				<p class="text-sm text-red-600" role="alert">{error}</p>
			{/if}

			{#if checked.length}
				<section aria-label="Checked off" class="rounded-xl border p-3">
					<h2 class="text-xs font-bold uppercase tracking-wide text-gray-500">
						Checked off ({checked.length})
					</h2>
					<ul class="mt-1 space-y-1">
						{#each checked as rec (rec.item.id)}
							<li class="flex items-center gap-2">
								<button
									role="checkbox"
									aria-checked="true"
									aria-label="Uncheck {rec.item.name}"
									disabled={busyId === rec.item.id}
									class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-gray-400 text-xs leading-none text-gray-500 hover:border-black"
									onclick={() => uncheck(rec.item, rec.scope)}>✓</button
								>
								<span class="min-w-0 truncate text-sm text-gray-400 line-through"
									>{rec.item.name}</span
								>
								<!-- Which list it went back to, in words. -->
								<span
									class="ml-auto shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-gray-500"
									>{rec.scope === 'mine' ? 'Mine' : 'Family'}</span
								>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		</div>

		<!-- ── the list, grouped by Store ── -->
		<section aria-label="Items by store" class="min-w-0">
			{#if items.length === 0}
				<p class="py-10 text-center text-sm text-gray-500">
					{#if queryActive}
						No items match “{searchQuery.trim()}”.
					{:else if scope === 'mine'}
						Your list is empty. Add the first item.
					{:else if scope === 'family'}
						{data.hasFamily
							? 'The family list is empty. Add the first item.'
							: 'No family list yet — join or create a family to use the shared list.'}
					{:else}
						Both lists are empty. Add the first item.
					{/if}
				</p>
			{:else}
				{#each groups as group (group.store)}
					{@const tint = colours.get(group.store)}
					{@const twins = tint ? twinsOf(group.store) : []}
					<section aria-label={group.store} class="mb-4 rounded-2xl border">
						<div
							data-store-bar={tint ? group.store : undefined}
							class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-t-2xl px-3 py-2 {tint
								? tint.bar
								: 'bg-gray-50'}"
						>
							<h2 class="flex min-w-0 items-center gap-2 text-sm font-extrabold text-gray-900">
								{#if tint}
									<span aria-hidden="true" class="h-2.5 w-2.5 shrink-0 rounded-full {tint.dot}"
									></span>
								{/if}
								<span class="truncate">{group.store}</span>
							</h2>
							<p class="text-xs text-gray-600">
								{summary(group.items)}{#if twins.length}
									· shares {tint?.label} with {twins.join(', ')}{/if}
							</p>
							{#if tint}
								<div class="ml-auto flex shrink-0 items-center gap-1.5">
									{#if colourStore === group.store}
										<div class="flex flex-wrap items-center gap-1.5">
											<label class="sr-only" for="colour-{group.store}"
												>Colour for {group.store}</label
											>
											<select
												id="colour-{group.store}"
												class="max-w-[9rem] rounded-lg border border-gray-300 bg-white px-1.5 py-1 text-xs font-semibold"
												aria-label="Colour for {group.store}"
												disabled={colourBusy}
												onchange={(e) => setColour(group.store, e.currentTarget.value)}
											>
												{#each STORE_COLOURS as c (c.key)}
													<option value={c.key} selected={c.key === tint.key}>{c.label}</option>
												{/each}
												<option value="auto" selected={!onPage(group.store)}>Auto</option>
											</select>
											{#if data.hasFamily}
												<label class="flex items-center gap-1 text-[0.6875rem] text-gray-600">
													<input
														type="radio"
														name="colour-scope"
														class="h-3 w-3"
														aria-label="Everyone"
														checked={colourScope === 'family'}
														onchange={() => (colourScope = 'family')}
													/>Everyone
												</label>
												<label class="flex items-center gap-1 text-[0.6875rem] text-gray-600">
													<input
														type="radio"
														name="colour-scope"
														class="h-3 w-3"
														aria-label="Just me"
														checked={colourScope === 'personal'}
														onchange={() => (colourScope = 'personal')}
													/>Just me
												</label>
											{/if}
											<button
												type="button"
												class="text-xs text-gray-500 underline"
												aria-label="Done editing colour for {group.store}"
												onclick={() => (colourStore = null)}>Done</button
											>
										</div>
									{:else}
										<button
											type="button"
											class="rounded-full border border-gray-300 bg-white px-2 py-1 text-[0.6875rem] font-semibold text-gray-700 hover:border-black"
											aria-label="Edit colour for {group.store}"
											onclick={() => {
												colourStore = group.store;
												colourScope = data.hasFamily ? 'family' : 'personal';
											}}>Colour</button
										>
									{/if}
								</div>
							{/if}
						</div>
						<ul class="divide-y divide-gray-100">
							{#each group.items as item (item.id)}
								{@const rowScope = scopeOf(item)}
								{@const destination = rowScope === 'mine' ? 'Family' : 'Mine'}
								<li class="px-3 py-2">
									<div class="flex min-w-0 flex-wrap items-center gap-2">
										<button
											role="checkbox"
											aria-checked="false"
											aria-label="Check off {item.name}"
											disabled={busyId === item.id}
											class="h-5 w-5 shrink-0 rounded-md border-2 border-gray-300 hover:border-black"
											onclick={() => check(item)}
										></button>
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-semibold text-gray-800">
												{item.name}<span class="ml-1 text-xs font-bold text-gray-500"
													>×{item.quantity}</span
												>
											</p>
											<p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
												<!-- Which list this row belongs to, in WORDS. A group
												     can hold both scopes, and the store colour means
												     "which store" — it must never mean "which
												     scope" as well, so this is text, not a hue. -->
												<span
													class="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-gray-500"
													>{rowScope === 'mine' ? 'Mine' : 'Family'}</span
												>
												{#if item.stores[0]}
													{@const primary = colourOf(item.stores[0])}
													<span
														data-primary="true"
														class="rounded-full px-2 py-0.5 font-bold ring-2 ring-inset {primary
															? primary.chip
															: 'bg-gray-100 text-gray-700'} {primary
															? primary.dot
															: 'bg-gray-400'}"
														style={primary ? `box-shadow: inset 0 0 0 2px currentColor` : ''}
														>{item.stores[0]}</span
													>
													{#if item.stores.length > 1}
														<span class="min-w-0 truncate text-gray-500"
															>or {item.stores.slice(1).join(', ')}</span
														>
													{/if}
												{/if}
											</p>
										</div>
										{#if editingId !== item.id}
											<div class="ml-auto flex shrink-0 items-center gap-3 text-xs">
												<button
													class="text-gray-500 underline"
													aria-label="Edit stores for {item.name}"
													onclick={() => {
														editingId = item.id;
														editStores = item.stores.join(', ');
													}}>Stores</button
												>
												<button
													class="text-gray-400 underline hover:text-red-600"
													aria-label="Delete {item.name}"
													disabled={busyId === item.id}
													onclick={() => remove(item)}>Delete</button
												>
											</div>
										{/if}
									</div>

									{#if editingId === item.id}
										<div
											class="mt-2 flex w-full min-w-0 flex-wrap items-center gap-2 border-t border-gray-100 pt-2 text-xs"
										>
											<input
												class="min-w-0 flex-1 basis-32 rounded border px-2 py-1"
												placeholder="stores, comma-separated"
												bind:value={editStores}
												aria-label="Stores for {item.name}"
											/>
											<button
												class="font-semibold underline"
												aria-label="Save stores for {item.name}"
												onclick={() => saveStores(item)}>Save</button
											>
											<button
												class="text-gray-500 underline"
												aria-label="Move {item.name} to {destination}"
												onclick={() => move(item)}
											>
												To {destination}
											</button>
											<button
												class="text-gray-500 underline"
												aria-label="Cancel editing {item.name}"
												onclick={() => (editingId = null)}>Cancel</button
											>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			{/if}
		</section>
	</div>
</div>
