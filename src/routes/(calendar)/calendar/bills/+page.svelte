<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import { pushToast } from '$lib/client/toasts';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';

	let { data }: { data: PageData } = $props();

	type BillRow = PageData['bills'][number];

	const CATEGORIES = ['housing', 'utilities', 'subscriptions', 'insurance', 'other'];

	let newTitle = $state('');
	let newAmount = $state('');
	let newDueDate = $state('');
	let newCategory = $state('other');
	let adding = $state(false);
	let busyId: string | null = $state(null);
	let actionError = $state('');
	let confirmDeleteId: string | null = $state(null);

	/** BillId -> optimistic paid state while a toggle is in flight. */
	interface PaidOverrides {
		[billId: string]: boolean;
	}
	let paidOverrides: PaidOverrides = $state({});

	function isPaid(bill: BillRow): boolean {
		return bill.id in paidOverrides ? paidOverrides[bill.id] : !!bill.paidAt;
	}

	/** Mirrors the tasks page: past-due and not yet settled. */
	function isOverdue(bill: BillRow): boolean {
		if (!bill.dueDate || isPaid(bill)) return false;
		return new Date(bill.dueDate).getTime() < Date.now();
	}

	function clearPaidOverride(id: string) {
		const rest = { ...paidOverrides };
		delete rest[id];
		paidOverrides = rest;
	}

	function dollars(cents: number): string {
		return (cents / 100).toFixed(2);
	}

	function dueLabel(dueDate: string | Date | null): string {
		if (!dueDate) return 'No due date';
		const d = new Date(dueDate);
		return Number.isNaN(d.getTime()) ? String(dueDate) : d.toLocaleDateString();
	}

	/** 'utilities' -> 'Utilities' for select options and row labels. */
	function categoryLabel(category: string): string {
		return category.charAt(0).toUpperCase() + category.slice(1);
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

	async function togglePaid(bill: BillRow) {
		if (busyId) return;
		const paid = !isPaid(bill);
		busyId = bill.id;
		actionError = '';
		paidOverrides = { ...paidOverrides, [bill.id]: paid };
		try {
			const res = await fetch(`/api/bills/${bill.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ paid })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error || 'Could not update the bill.');
			}
			pushToast({
				message: paid ? `Marked “${bill.title}” as paid.` : `Marked “${bill.title}” as unpaid.`
			});
			await invalidateAll();
			clearPaidOverride(bill.id);
		} catch (error) {
			// Revert the optimistic badge; the server state stands.
			clearPaidOverride(bill.id);
			actionError = error instanceof Error ? error.message : 'Could not update the bill.';
		} finally {
			busyId = null;
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
			confirmDeleteId = null;
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
		<div
			class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
			role="alert"
		>
			Couldn't load {data.loadWarnings.join(', ')} just now — everything else is up to date.
		</div>
	{/if}

	{#if data.canEdit}
		<form
			class="mt-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4"
			onsubmit={(e) => {
				e.preventDefault();
				addBill();
			}}
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
						{#each CATEGORIES as category (category)}
							<option value={category}>{categoryLabel(category)}</option>
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
		<div
			role="alert"
			class="mt-2 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"
		>
			<span>{actionError}</span>
			<button
				type="button"
				onclick={() => (actionError = '')}
				class="shrink-0 rounded-full p-0.5 text-red-400 transition-colors hover:bg-red-100 hover:text-red-600"
				aria-label="Dismiss error"
			>
				✕
			</button>
		</div>
	{/if}

	{#if data.bills.length === 0}
		<div class="mt-6 flex flex-col items-center justify-center py-16 text-center">
			<svg
				class="mb-4 h-14 w-14 text-slate-300"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h4"
				/>
			</svg>
			<p class="text-lg font-medium text-slate-700">No bills yet</p>
			<p class="text-sm text-slate-500">
				{data.canEdit
					? 'Add your first bill above — rent, electric, a subscription.'
					: 'Bills added by your family will show up here.'}
			</p>
		</div>
	{:else}
		<ul class="mt-4 flex flex-col gap-2">
			{#each data.bills as bill (bill.id)}
				<li class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<p class="truncate font-semibold text-slate-900">{bill.title}</p>
							{#if isPaid(bill)}
								<span
									class="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700"
									>Paid</span
								>
							{/if}
						</div>
						<div class="mt-0.5 flex items-center gap-2">
							<span class="text-xs text-slate-500">{categoryLabel(bill.category ?? 'other')}</span>
							{#if bill.dueDate}
								<span
									class="rounded-full px-2 py-0.5 text-[11px] font-medium {isOverdue(bill)
										? 'bg-red-100 text-red-700'
										: 'bg-slate-100 text-slate-600'}"
								>
									{dueLabel(bill.dueDate)}
								</span>
							{/if}
						</div>
					</div>
					<p class="shrink-0 font-mono font-semibold text-slate-900">
						${dollars(bill.amountCents)}
					</p>
					{#if data.canEdit}
						<button
							type="button"
							onclick={() => togglePaid(bill)}
							disabled={busyId !== null}
							aria-label="{isPaid(bill) ? 'Mark unpaid' : 'Mark paid'} {bill.title}"
							class="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 {isPaid(
								bill
							)
								? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
								: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}"
						>
							{busyId === bill.id ? 'Saving…' : isPaid(bill) ? 'Mark unpaid' : 'Mark paid'}
						</button>
						{#if confirmDeleteId === bill.id}
							<button
								type="button"
								onclick={() => (confirmDeleteId = null)}
								disabled={busyId !== null}
								aria-label="Cancel delete"
								class="shrink-0 rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-50"
							>
								Cancel
							</button>
							<button
								type="button"
								onclick={() => deleteBill(bill.id, bill.title)}
								disabled={busyId !== null}
								aria-label="Confirm delete {bill.title}"
								class="shrink-0 rounded bg-red-600 px-2 py-1 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
							>
								{busyId === bill.id ? 'Deleting…' : 'Confirm delete'}
							</button>
						{:else}
							<button
								type="button"
								onclick={() => (confirmDeleteId = bill.id)}
								disabled={busyId !== null}
								aria-label="Delete bill {bill.title}"
								class="shrink-0 rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
							>
								Delete
							</button>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
