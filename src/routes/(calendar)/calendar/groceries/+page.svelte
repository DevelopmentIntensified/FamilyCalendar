<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import { groupGroceriesByStore } from '$lib/data/groceries';
	import { pushToast } from '$lib/client/toasts';

	export let data: PageData;

	type Item = {
		id: string;
		name: string;
		quantity: number;
		stores: string[];
	};
	type Scope = 'mine' | 'family';

	// The approved prototype opens on Family, with Mine second.
	let tab: Scope = 'family';
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

	const scopes: { key: Scope; label: string }[] = [
		{ key: 'family', label: 'Family' },
		{ key: 'mine', label: 'Mine' }
	];

	function countIn(scope: Scope): number {
		return (scope === 'family' ? data.family : data.mine).length;
	}

	/** "2 items · 5 total" — the Store summary line. */
	function summary(items: Item[]): string {
		const total = items.reduce((sum, i) => sum + i.quantity, 0);
		return `${items.length} ${items.length === 1 ? 'item' : 'items'} · ${total} total`;
	}

	// hiddenIds and tab are referenced directly: a filter hidden behind a helper
	// call would drop out of Svelte's dependency tracking and never repaint.
	$: scoped = (tab === 'family' ? data.family : data.mine) as Item[];
	$: items = scoped.filter((i) => !hiddenIds.has(i.id));
	$: groups = groupGroceriesByStore(items);
	$: checked = recentlyChecked.filter((r) => r.scope === tab);
	$: other = tab === 'mine' ? 'Family' : 'Mine';

	async function lookupSuggest(name: string) {
		const q = name.trim();
		if (!q) {
			suggested = null;
			return;
		}
		try {
			const res = await fetch(
				`/api/groceries?scope=${tab}&suggest=1&name=${encodeURIComponent(q)}`
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
		try {
			const stores = storeInput
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			const res = await fetch('/api/groceries', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ scope: tab, input, stores: stores.length ? stores : undefined })
			});
			if (res.ok) {
				pushToast({
					message: `Added "${input.trim()}"${guessed && !storeInput ? ` — ${guessed}` : ''}.`
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
		const scope = tab;
		hiddenIds.add(item.id);
		hiddenIds = hiddenIds;
		const res = await fetch(`/api/groceries/${item.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ scope, op: 'check' })
		});
		if (res.ok) {
			recentlyChecked = [...recentlyChecked, { item, scope }];
			pushToast({
				message: `Checked off "${item.name}".`,
				actionLabel: 'Undo',
				onAction: () => uncheck(item, scope)
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
			body: JSON.stringify({ scope: tab, op: 'stores', stores })
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
		const scope = tab;
		busyId = item.id;
		const res = await fetch(`/api/groceries/${item.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ scope, op: 'move', target: other === 'Mine' ? 'mine' : 'family' })
		});
		if (res.ok) {
			pushToast({
				message: `Moved "${item.name}" to ${other === 'Mine' ? 'your list' : 'Family'}.`
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
		const res = await fetch(`/api/groceries/${item.id}?scope=${tab}`, { method: 'DELETE' });
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
		<!-- ── side rail: scope tabs, add field, Store Memory, checked rail ── -->
		<div class="min-w-0 space-y-4">
			<div
				class="inline-flex max-w-full rounded-xl bg-gray-100 p-1"
				role="tablist"
				aria-label="Grocery lists"
			>
				{#each scopes as s (s.key)}
					<button
						role="tab"
						aria-selected={tab === s.key}
						class="min-h-9 shrink-0 rounded-lg px-4 text-sm font-semibold {tab === s.key
							? 'bg-white text-black shadow-sm'
							: 'text-gray-600 hover:text-black'}"
						onclick={() => (tab = s.key)}
						>{s.label}<span class="ml-1.5 text-xs font-normal text-gray-400">{countIn(s.key)}</span
						></button
					>
				{/each}
			</div>

			{#if tab === 'family' && !data.hasFamily}
				<p class="text-sm text-gray-600">Join or create a family to use the shared list.</p>
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
					bind:value={storeInput}
					aria-label="Stores for this item"
				/>
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
					{tab === 'family' ? 'The family list is empty.' : 'Your list is empty.'} Add the first item.
				</p>
			{:else}
				{#each groups as group (group.store)}
					<section aria-label={group.store} class="mb-4 rounded-2xl border">
						<div
							class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-t-2xl bg-emerald-50/60 px-3 py-2"
						>
							<h2 class="text-sm font-extrabold text-gray-900">{group.store}</h2>
							<p class="text-xs text-gray-600">{summary(group.items)}</p>
						</div>
						<ul class="divide-y divide-gray-100">
							{#each group.items as item (item.id)}
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
											{#if item.stores[0]}
												<p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
													<span
														class="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-900"
														>{item.stores[0]}</span
													>
													{#if item.stores.length > 1}
														<span class="min-w-0 truncate text-gray-500"
															>or {item.stores.slice(1).join(', ')}</span
														>
													{/if}
												</p>
											{/if}
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
												aria-label="Move {item.name} to {other}"
												onclick={() => move(item)}
											>
												To {other}
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
