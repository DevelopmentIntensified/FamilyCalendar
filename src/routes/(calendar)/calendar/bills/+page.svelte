<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import { pushToast } from '$lib/client/toasts';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';

	export let data: PageData;

	const CATEGORIES = ['housing', 'utilities', 'subscriptions', 'insurance', 'other'];

	let newTitle = '';
	let newAmount = '';
	let newDueDate = '';
	let newCategory = 'other';
	let adding = false;
	let busyId: string | null = null;
	let actionError = '';

	function dollars(cents: number): string {
		return (cents / 100).toFixed(2);
	}

	function dueLabel(dueDate: string | null): string {
		if (!dueDate) return 'No due date';
		const d = new Date(dueDate);
		return Number.isNaN(d.getTime()) ? dueDate : d.toLocaleDateString();
	}

	async function addBill() {
		if (!newTitle.trim() || !newAmount.trim() || adding) return;
		adding = true;
		actionError = '';
		try {
			const res = await fetch('/api/bills', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: newTitle.trim(),
					amount: newAmount.trim(),
					dueDate: newDueDate || null,
					category: newCategory
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error || 'Could not add the bill.');
			}
			newTitle = '';
			newAmount = '';
			newDueDate = '';
			newCategory = 'other';
			pushToast({ message: 'Bill added.' });
			await invalidateAll();
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Could not add the bill.';
		} finally {
			adding = false;
		}
	}

	async function deleteBill(id: string, title: string) {
		if (busyId) return;
		busyId = id;
		actionError = '';
		try {
			const res = await fetch(`/api/bills/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error || 'Could not delete the bill.');
			}
			pushToast({ message: `Deleted “${title}”.` });
			await invalidateAll();
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Could not delete the bill.';
		} finally {
			busyId = null;
		}
	}
</script>

<svelte:head>
	<title>Bills — Family Planz</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6">
	<Breadcrumbs crumbs={[{ label: 'Calendar', href: '/calendar' }, { label: 'Bills' }]} />
	<h1 class="mt-2 text-2xl font-bold text-slate-900">Bills</h1>

	{#if data.loadWarnings.length > 0}
		<p class="mt-2 text-sm text-amber-600" role="status">
			Some sections failed to load: {data.loadWarnings.join('; ')}
		</p>
	{/if}

	{#if data.canEdit}
		<form
			class="mt-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4"
			on:submit|preventDefault={addBill}
		>
			<div class="flex flex-col gap-2 sm:flex-row">
				<label class="flex-1">
					<span class="sr-only">Bill title</span>
					<input
						class="w-full rounded border border-slate-300 px-3 py-2"
						placeholder="Bill title (e.g. Electric)"
						bind:value={newTitle}
						disabled={adding}
					/>
				</label>
				<label class="sm:w-32">
					<span class="sr-only">Amount in dollars</span>
					<input
						class="w-full rounded border border-slate-300 px-3 py-2"
						placeholder="$0.00"
						inputmode="decimal"
						bind:value={newAmount}
						disabled={adding}
					/>
				</label>
			</div>
			<div class="flex flex-col gap-2 sm:flex-row">
				<label class="flex-1">
					<span class="sr-only">Due date</span>
					<input
						class="w-full rounded border border-slate-300 px-3 py-2"
						type="date"
						bind:value={newDueDate}
						disabled={adding}
					/>
				</label>
				<label class="flex-1">
					<span class="sr-only">Category</span>
					<select
						class="w-full rounded border border-slate-300 px-3 py-2"
						bind:value={newCategory}
						disabled={adding}
					>
						{#each CATEGORIES as category}
							<option value={category}>{category}</option>
						{/each}
					</select>
				</label>
				<button
					class="rounded bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50"
					type="submit"
					disabled={adding || !newTitle.trim() || !newAmount.trim()}
				>
					{adding ? 'Adding…' : 'Add bill'}
				</button>
			</div>
		</form>
	{/if}

	{#if actionError}
		<p class="mt-2 text-sm text-red-600" role="alert">{actionError}</p>
	{/if}

	{#if data.bills.length === 0}
		<div class="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center">
			<p class="font-semibold text-slate-700">No bills yet</p>
			<p class="mt-1 text-sm text-slate-500">
				{data.canEdit
					? 'Add your first bill above — rent, electric, a subscription.'
					: 'Bills added by your family will show up here.'}
			</p>
		</div>
	{:else}
		<ul class="mt-4 flex flex-col gap-2">
			{#each data.bills as bill (bill.id)}
				<li class="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
					<div class="min-w-0 flex-1">
						<p class="truncate font-semibold text-slate-900">{bill.title}</p>
						<p class="text-sm text-slate-500">
							{bill.category ?? 'other'} · {dueLabel(bill.dueDate)}
						</p>
					</div>
					<p class="shrink-0 font-mono font-semibold text-slate-900">
						${dollars(bill.amountCents)}
					</p>
					{#if data.canEdit}
						<button
							class="shrink-0 rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
							aria-label="Delete bill {bill.title}"
							disabled={busyId === bill.id}
							on:click={() => deleteBill(bill.id, bill.title)}
						>
							{busyId === bill.id ? '…' : 'Delete'}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
