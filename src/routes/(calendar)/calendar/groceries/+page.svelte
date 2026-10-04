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
		NO_STORE_LABEL,
		storeKey,
		colourOverrideKey,
		isStoreColourKey,
		withColourOverrides,
		type ColourOverrides,
		type ColourScopeKey,
		type GroceryScopeKey,
		type StoreColour,
		type StoreColourRow,
		type StoreColourViewer
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
	let colourScope: ColourScopeKey = 'family';
	let colourBusy = false;
	/**
	 * 115: the rail card has its OWN scope. Sharing `colourScope` with the group
	 * picker would let a group that is open on "Just me" silently retarget the
	 * next card flip for a different shop — the same control-drives-another-
	 * store bug, one row over.
	 */
	let railScope: ColourScopeKey = 'family';
	/**
	 * Optimistic colour overrides, keyed `scope:storeKey` (115). The SCOPE is
	 * in the key and in the value, so a personal colour and a family colour for
	 * one shop are two answers rather than one slot fighting over the other, and
	 * nothing the page can change afterwards re-labels an override. Read inline
	 * so `$:` repaints; dropped on invalidateAll so the server stays the truth.
	 */
	let colourOverrides: ColourOverrides = {};

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
	 *
	 * 115: the overrides are merged in at THEIR OWN scope (`withColourOverrides`),
	 * not at whatever `colourScope` happens to say right now — that rebuild was
	 * what let a control re-label a pending colour.
	 */
	$: colourRows = (data.colours ?? []) as StoreColourRow[];
	$: viewer = { userId: data.userId, familyId: data.familyId };
	$: effectiveRows = withColourOverrides(colourRows, colourOverrides, viewer);
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
	/**
	 * groceries.html, approved: the rail's Store colours card lists every shop
	 * the page knows, from BOTH scopes and in first-seen order — so the card does
	 * not empty out when the scope filter narrows the list beside it.
	 *
	 * "Any store" is the absence of a shop, never a shop, so it is never listed
	 * and never tinted.
	 */
	$: colourStores = knownStores.filter((s) => s.trim() && s.trim() !== NO_STORE_LABEL);
	/**
	 * Swatches carrying more than one shop. Six swatches over unbounded shops
	 * makes a collision ordinary, not exceptional, so the card counts the shops
	 * involved rather than the pairs — and the group header names the twin.
	 */
	$: sharedStores = (() => {
		const bySwatch = new Map<string, string[]>();
		for (const s of colourStores) {
			const tint = colourOf(s);
			if (!tint) continue;
			const group = bySwatch.get(tint.key) ?? [];
			group.push(s);
			bySwatch.set(tint.key, group);
		}
		return [...bySwatch.values()].filter((shops) => shops.length > 1).flat();
	})();

	/**
	 * What a picker shows for ONE shop in ONE scope: the pending override if
	 * there is one, else the stored row at that scope, else `auto`.
	 *
	 * 115: the answer is scoped, and the scope is the one the control is pointing
	 * at — so `Auto` here says "you have not chosen a colour for this shop AT
	 * THIS SCOPE", which is the truth. Reading it back from the resolved tint
	 * would let the control re-label a colour the other scope owns (and would
	 * mark two options `selected` at once, so the select would show whichever
	 * came first in the DOM rather than what was actually chosen).
	 */
	function pickerValue(name: string, scope: ColourScopeKey): string {
		const key = storeKey(name);
		const pending = colourOverrides[colourOverrideKey(scope, key)];
		if (pending) return pending;
		const stored = colourRows.find(
			(r) => r.storeKey === key && r.familyId === familyIdForScope(scope, viewer)
		);
		if (stored && isStoreColourKey(stored.color)) return stored.color;
		return 'auto';
	}

	function colourOf(name: string | null | undefined): StoreColour | null {
		return colourFor(name, effectiveRows, viewer);
	}

	function twinsOf(name: string, names: string[] = chipNames): string[] {
		return storesSharingColour(name, names, effectiveRows, viewer);
	}

	async function setColour(store: string, color: string, scope: ColourScopeKey) {
		if (colourBusy) return;
		colourBusy = true;
		error = '';
		const key = storeKey(store);
		// 115: the scope is captured HERE, with the write. Every later read of
		// this override names the scope it was made at, so the Everyone/Just me
		// control can only choose where the NEXT write goes — never where an
		// existing one is read from.
		const overrideKey = colourOverrideKey(scope, key);
		const was = colourRows.find(
			(r) => r.storeKey === key && r.familyId === familyIdForScope(scope, viewer)
		);
		// Optimistic repaint (<100ms ack); reverted below if the write fails.
		colourOverrides = { ...colourOverrides, [overrideKey]: color };
		const res = await fetch('/api/groceries/colours', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ store, color, scope })
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
						: `${store} is now ${label}${scope === 'personal' ? ' (just you)' : ''}.`
			});
			colourStore = null;
			await invalidateAll();
		} else {
			if (was) colourOverrides = { ...colourOverrides, [overrideKey]: was.color };
			else {
				const next = { ...colourOverrides };
				delete next[overrideKey];
				colourOverrides = next;
			}
			error = "Couldn't set that colour. Try again.";
		}
		colourBusy = false;
	}

	/** The `familyId` a scope writes. "Everyone" is not a place without a
	 *  family, so it resolves to the personal row rather than inventing one. */
	function familyIdForScope(scope: ColourScopeKey, who: StoreColourViewer): string | null {
		return scope === 'family' ? who.familyId : null;
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

	<!-- groceries.html, approved, and measured: `.wrapx` is ONE column at 949px
	     and `336px + 590px` at 990px, i.e. the break is 950px and the rail is
	     21rem. The app broke at `lg` (1024px), so between those widths a rail
	     and a list that both fit were stacked. -->
	<div
		data-testid="grocery-layout"
		class="mt-4 grid items-start gap-6 min-[950px]:grid-cols-[21rem_minmax(0,1fr)]"
	>
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

			<!-- groceries.html, approved: a STORE COLOURS card — one place to see
			     and change every shop, instead of only finding a colour by opening
			     the group it belongs to. It is not a replacement for the group's
			     own picker (096 put that there on purpose, one tap from the item
			     that revealed the problem); it is the other direction, and it is
			     built from BOTH scopes so a colour you set on Mine is still yours
			     to see while you are looking at Family.

			     The card carries the collision disclosure the group header carries:
			     six swatches over unbounded shops means two names CAN land on one,
			     and a collision is permitted but never silent. -->
			<section data-testid="store-colours" aria-label="Store colours" class="rounded-xl border p-3">
				<div class="flex items-center justify-between gap-2">
					<h2 class="text-xs font-bold uppercase tracking-wide text-gray-500">Store colours</h2>
					{#if data.hasFamily}
						<!-- The card's OWN scope, not the group picker's: it says where a
						     flip from THIS card lands, and moving one never retargets
						     the other (115). -->
						<label class="sr-only" for="rail-colour-scope">Colour scope for the card</label>
						<select
							id="rail-colour-scope"
							class="max-w-[6.5rem] rounded-lg border border-gray-300 bg-white px-1 py-0.5 text-[0.625rem] font-semibold text-gray-600"
							aria-label="Colour scope for the card"
							bind:value={railScope}
						>
							<option value="family">Everyone</option>
							<option value="personal">Just me</option>
						</select>
					{/if}
				</div>
				{#if colourStores.length === 0}
					<p data-testid="store-colours-empty" class="mt-1 text-sm text-gray-500">
						No shops yet. Type one on an item and it turns up here with a colour of its
						own.
					</p>
				{:else}
					<ul class="mt-2">
						{#each colourStores as store, index (storeKey(store))}
							{@const tint = colourOf(store)}
							{@const twins = tint ? twinsOf(store, colourStores) : []}
							<li
								data-testid="store-colour-row"
								data-store={store}
								class="flex flex-wrap items-center gap-2 py-1.5 {index
									? 'border-t border-gray-100'
									: ''}"
							>
								<span
									class="h-3 w-3 shrink-0 rounded-full {tint
										? tint.dot
										: 'bg-gray-400'}"
									aria-hidden="true"
								></span>
								<span class="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
									{store}
								</span>
								{#if colourStore === store}
									<!-- One picker per shop. While its group is open for
									     editing, that group owns the control, so the shop
									     never answers to two selects with the same name. -->
									<span class="text-[0.625rem] font-semibold text-gray-400">editing →</span>
								{:else}
									{@const choice = pickerValue(store, railScope)}
									<label class="sr-only" for="rail-colour-{storeKey(store)}"
										>Colour for {store}</label
									>
									<select
										id="rail-colour-{storeKey(store)}"
										class="max-w-[7.5rem] rounded-lg border border-gray-300 bg-white px-1.5 py-1 text-xs font-semibold"
										aria-label="Colour for {store}"
										value={choice}
										disabled={colourBusy}
										onchange={(e) => setColour(store, e.currentTarget.value, railScope)}
									>
										{#each STORE_COLOURS as c (c.key)}
											<option value={c.key} selected={c.key === choice}>{c.label}</option>
										{/each}
										<option value="auto" selected={choice === 'auto'}>Auto</option>
									</select>
								{/if}
								{#if twins.length > 0 && tint}
									<!-- A collision is never silent. -->
									<p class="w-full text-[0.6875rem] leading-snug text-gray-400">
										shares {tint.label} with {twins.join(', ')}
									</p>
								{/if}
							</li>
						{/each}
					</ul>
					<p class="mt-2 text-[0.6875rem] leading-snug text-gray-400">
						{colourStores.length}
						{colourStores.length === 1 ? 'store' : 'stores'}, {STORE_COLOURS.length} swatches.
						{#if sharedStores.length > 0}
							<b>{sharedStores.length} of them land on the same swatch</b> — {sharedStores.join(
								', '
							)}. A collision is permitted and always named here and on the group.
						{:else}
							No two stores land on the same swatch.
						{/if}
					</p>
				{/if}
			</section>
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
										{@const choice = pickerValue(group.store, colourScope)}
										<div class="flex flex-wrap items-center gap-1.5">
											<label class="sr-only" for="colour-{storeKey(group.store)}"
												>Colour for {group.store}</label
											>
											<select
												id="colour-{storeKey(group.store)}"
												class="max-w-[9rem] rounded-lg border border-gray-300 bg-white px-1.5 py-1 text-xs font-semibold"
												aria-label="Colour for {group.store}"
												value={choice}
												disabled={colourBusy}
												onchange={(e) => setColour(group.store, e.currentTarget.value, colourScope)}
											>
												{#each STORE_COLOURS as c (c.key)}
													<option value={c.key} selected={c.key === choice}>{c.label}</option>
												{/each}
												<option value="auto" selected={choice === 'auto'}>Auto</option>
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
													<!-- groceries.html, approved. EVERY store on the row
													     is a chip in ITS OWN colour — that was the
													     half of the review mark 096 never touched
													     ("so Costco and Aldi are still grey on a
													     row the table can already colour").

													     Colouring them all costs the primary/alternate
													     distinction, so that moves onto a SECOND
													     channel: the filled dot and the 2px ring on
													     `stores[0]`, which is the key this row is
													     grouped under. Colour says "which shop";
													     the ring says "the one I file it under". -->
													{#each item.stores as store, index (store)}
														{@const tint = colourOf(store)}
														{#if index === 1}
															<!-- groceries.html, approved: `<span class="alt">or</span>`
															     between the shop this row is filed under and its
															     alternates. Every store is its own coloured chip now,
															     so without the word a row reads "Aldi, Kroger" and
															     primary/alternate rides on a 2px ring alone. -->
															<span
																data-store-alternate-join
																class="shrink-0 text-[0.6875rem] text-gray-400">or</span
															>
														{/if}
														<span
															data-store-chip
															data-primary={index === 0 ? 'true' : undefined}
															title={tint
																? `${store} — ${tint.label}${index === 0 ? ' (the shop this row is grouped under)' : ''}`
																: store}
															class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] leading-none ring-inset {index ===
																0
																	? 'font-bold ring-2 ring-current'
																	: 'font-semibold ring-1 ring-current'} {tint
																? tint.chip
																: 'bg-gray-100 text-gray-700 ring-gray-300'}"
															>
															{#if index === 0}
																<!-- The second channel: this filled dot and the heavier ring
															     name the shop the row is filed under, so colouring
															     every store costs nothing. -->
																<span
																	class="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
																	aria-hidden="true"
																></span>
															{/if}{store}</span
														>
													{/each}
												{/if}
											</p>
										</div>
										<div class="ml-auto flex shrink-0 items-center gap-1">
											<!-- groceries.html, approved: the row carries all THREE
											     actions as quiet icon buttons — edit, move,
											     delete — rather than hiding move behind an
											     edit-mode the user has to find first. -->
												<button
													class="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700"
													aria-label="Edit stores for {item.name}"
													title="Edit stores"
													onclick={() => {
														editingId = item.id;
														editStores = item.stores.join(', ');
													}}>✎</button
												>
												<button
													class="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700"
													aria-label="Move {item.name} to {destination}"
													title="Move to {destination}"
													disabled={busyId === item.id}
													onclick={() => move(item)}>⇄</button
												>
												<button
													class="flex h-7 w-7 items-center justify-center rounded-lg text-sm text-gray-400 hover:bg-red-50 hover:text-red-600"
													aria-label="Delete {item.name}"
													title="Delete"
													disabled={busyId === item.id}
													onclick={() => remove(item)}>✕</button
												>
											</div>
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
