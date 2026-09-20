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

	let tab: 'mine' | 'family' = 'family';
	let input = '';
	let storeInput = '';
	let suggested: string | null = null;
	let adding = false;
	let busyId: string | null = null;
	let editingId: string | null = null;
	let editStores = '';
	let error = '';
	let hiddenIds = new Set<string>();

	$: items = ((tab === 'family' ? data.family : data.mine) as Item[]).filter(
		(i) => !hiddenIds.has(i.id)
	);
	$: groups = groupGroceriesByStore(items);

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

	async function add() {
		if (!input.trim() || adding) return;
		adding = true;
		error = '';
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
				pushToast({ message: `Added "${input.trim()}"${suggested && !storeInput ? ` — ${suggested}` : ''}.` });
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
		hiddenIds.add(item.id);
		hiddenIds = hiddenIds;
		const res = await fetch(`/api/groceries/${item.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ scope: tab, op: 'check' })
		});
		if (res.ok) {
			pushToast({ message: `Checked off "${item.name}".` });
			await invalidateAll();
		} else {
			hiddenIds.delete(item.id);
			hiddenIds = hiddenIds;
			error = "Couldn't check that off. Try again.";
		}
	}

	async function saveStores(item: Item) {
		if (busyId) return;
		busyId = item.id;
		const stores = editStores.split(',').map((s) => s.trim()).filter(Boolean);
		const res = await fetch(`/api/groceries/${item.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ scope: tab, op: 'stores', stores })
		});
		if (res.ok) {
			editingId = null;
			await invalidateAll();
		} else {
			error = "Couldn't save stores. Try again.";
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

<div class="mx-auto max-w-2xl px-4 py-6">
	<h1 class="text-2xl font-bold">Groceries</h1>

	<div class="mt-3 flex gap-2" role="tablist" aria-label="Grocery lists">
		<button
			role="tab"
			aria-selected={tab === 'family'}
			class="rounded-full px-4 py-1.5 text-sm font-semibold {tab === 'family'
				? 'bg-black text-white'
				: 'bg-gray-100 text-gray-700'}"
			onclick={() => (tab = 'family')}>Family</button
		>
		<button
			role="tab"
			aria-selected={tab === 'mine'}
			class="rounded-full px-4 py-1.5 text-sm font-semibold {tab === 'mine'
				? 'bg-black text-white'
				: 'bg-gray-100 text-gray-700'}"
			onclick={() => (tab = 'mine')}>Mine</button
		>
	</div>

	{#if tab === 'family' && !data.hasFamily}
		<p class="mt-4 text-sm text-gray-600">Join or create a family to use the shared list.</p>
	{/if}

	<form class="mt-4 flex flex-col gap-2" onsubmit={(e) => { e.preventDefault(); add(); }}>
		<div class="flex gap-2">
			<input
				class="flex-1 rounded-lg border px-3 py-2"
				placeholder='Quick-add, e.g. "milk 2"'
				bind:value={input}
				oninput={onInput}
				aria-label="Add grocery item"
			/>
			<button
				type="submit"
				disabled={adding || !input.trim()}
				class="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
			>
				{adding ? 'Adding…' : 'Add'}
			</button>
		</div>
		<div class="flex items-center gap-2 text-sm">
			<input
				class="flex-1 rounded-lg border px-3 py-1.5"
				placeholder={suggested ? `Store (suggested: ${suggested})` : 'Store (optional, comma = alternates)'}
				bind:value={storeInput}
				aria-label="Stores for this item"
			/>
		</div>
	</form>

	{#if error}
		<p class="mt-2 text-sm text-red-600" role="alert">{error}</p>
	{/if}

	{#if items.length === 0}
		<p class="mt-8 text-center text-sm text-gray-500">Nothing on this list. Add the first item above.</p>
	{:else}
		{#each groups as group (group.store)}
			<h2 class="mt-6 text-sm font-bold uppercase tracking-wide text-gray-500">{group.store}</h2>
			<ul class="mt-1 divide-y divide-gray-100 rounded-xl border">
				{#each group.items as item (item.id)}
					<li class="flex items-center gap-3 px-3 py-2">
						<button
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 hover:border-black"
							aria-label='Check off {item.name}'
							disabled={busyId === item.id}
							onclick={() => check(item)}
						></button>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">
								{item.name}{#if item.quantity > 1}<span class="text-gray-500"> × {item.quantity}</span>{/if}
							</p>
							{#if item.stores.length > 1}
								<p class="truncate text-xs text-gray-500">also: {item.stores.slice(1).join(', ')}</p>
							{/if}
						</div>
						{#if editingId === item.id}
							<input
								class="w-32 rounded border px-2 py-1 text-xs"
								placeholder="stores, comma-separated"
								bind:value={editStores}
								aria-label="Edit stores"
							/>
							<button class="text-xs font-semibold underline" onclick={() => saveStores(item)}>Save</button>
							<button class="text-xs text-gray-500 underline" onclick={() => (editingId = null)}>Cancel</button>
						{:else}
							<button
								class="text-xs text-gray-500 underline"
								onclick={() => {
									editingId = item.id;
									editStores = item.stores.join(', ');
								}}>Stores</button
							>
							<button
								class="text-xs text-gray-400 underline hover:text-red-600"
								disabled={busyId === item.id}
								onclick={() => remove(item)}>Delete</button
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/each}
	{/if}
</div>
