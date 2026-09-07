<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { ReceiptRef } from '$lib/server/db/actions/attachments';
	import { pushToast } from '$lib/client/toasts';
	import { scanReceiptImage, stripExif } from '$lib/client/receiptOcr';
	import { scanReceipt } from '$lib/utils/receiptScan';
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

	// Receipt state (issue 010).
	let expandedId: string | null = $state(null);
	let viewReceiptUrl: string | null = $state(null);
	let confirmRemoveReceiptId: string | null = $state(null);
	let attachBusyId: string | null = $state(null);
	/** Bill whose "Attach receipt" picked the shared file input; null = new-bill scan. */
	let receiptTargetId: string | null = $state(null);
	let scanFileInput: HTMLInputElement | null = $state(null);
	let attachFileInput: HTMLInputElement | null = $state(null);
	/** Receipt uploaded for the new-bill form, attached when the bill is created. */
	let pendingReceipt: ReceiptRef | null = $state(null);
	let scanBusy = $state(false);
	let scanProgress = $state(0);
	let scanNotice = $state('');
	/** True while the category select still shows the OCR suggestion. */
	let categorySuggested = $state(false);

	function receiptFor(bill: BillRow): ReceiptRef | null {
		return data.receiptsByBillId[bill.id] ?? null;
	}

	function toggleExpanded(bill: BillRow) {
		expandedId = expandedId === bill.id ? null : bill.id;
		confirmRemoveReceiptId = null;
	}

	/** Dollars string from OCR cents, empty when unextracted. */
	function dollarsFromCents(cents: number | null): string {
		return cents === null ? '' : (cents / 100).toFixed(2);
	}

	/** Uploads the picked image as a receipt attachment; null on failure.
	 * The image is canvas re-encoded first so EXIF/GPS never leaves the
	 * device (privacy audit #029). */
	async function uploadReceipt(file: File): Promise<ReceiptRef | null> {
		const cleaned = await stripExif(file);
		const body = new FormData();
		body.append('file', cleaned);
		const res = await fetch('/api/receipts', { method: 'POST', body });
		if (!res.ok) {
			const json = await res.json().catch(() => ({}));
			throw new Error(json.error || 'Could not upload the receipt.');
		}
		const json = await res.json();
		return json.attachment ?? null;
	}

	/**
	 * Scan → prefill the new-bill form → attach the photo as a pending
	 * receipt. Garbled/failed OCR keeps the photo and asks for manual fields.
	 */
	async function scanAndPrefill(file: File) {
		scanBusy = true;
		scanProgress = 0;
		scanNotice = '';
		categorySuggested = false;
		try {
			const outcome = await scanReceiptImage(file, (p) => (scanProgress = p));
			const result = scanReceipt(outcome.text);
			if (!outcome.ok || (!result.merchant && result.totalCents === null && !result.dateIso)) {
				scanNotice = "Couldn't read the receipt clearly — fill the fields manually.";
			}
			if (result.merchant) newTitle = result.merchant;
			const amount = dollarsFromCents(result.totalCents);
			if (amount) newAmount = amount;
			if (result.dateIso) newDueDate = result.dateIso;
			if (result.category !== 'other' || result.merchant) {
				newCategory = result.category;
				categorySuggested = true;
			}
			pendingReceipt = (await uploadReceipt(file)) ?? null;
			pushToast({
				message:
					outcome.ok && result.merchant
						? 'Receipt scanned — review the details below.'
						: 'Receipt attached — review the details below.'
			});
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Could not scan the receipt.';
		} finally {
			scanBusy = false;
			scanProgress = 0;
		}
	}

	function onScanPicked(event: Event) {
		// SAFETY: the only onchange target is the hidden scan file input.
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) scanAndPrefill(file);
	}

	/** Attaches the picked image to an existing bill (upload then PATCH-like PUT). */
	async function attachToBill(billId: string, file: File) {
		attachBusyId = billId;
		actionError = '';
		try {
			const attachment = await uploadReceipt(file);
			if (!attachment) throw new Error('Could not attach the receipt.');
			const res = await fetch(`/api/bills/${billId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ attachmentId: attachment.id })
			});
			if (!res.ok) {
				const json = await res.json().catch(() => ({}));
				throw new Error(json.error || 'Could not attach the receipt.');
			}
			pushToast({ message: 'Receipt attached.' });
			await invalidateAll();
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Could not attach the receipt.';
		} finally {
			attachBusyId = null;
		}
	}

	function onAttachPicked(event: Event) {
		// SAFETY: the only onchange target is the hidden attach file input.
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file && receiptTargetId) attachToBill(receiptTargetId, file);
		receiptTargetId = null;
	}

	async function removeReceipt(bill: BillRow) {
		const receipt = receiptFor(bill);
		if (!receipt) return;
		attachBusyId = bill.id;
		actionError = '';
		try {
			const res = await fetch(`/api/receipts/${receipt.id}`, { method: 'DELETE' });
			if (!res.ok) {
				const json = await res.json().catch(() => ({}));
				throw new Error(json.error || 'Could not remove the receipt.');
			}
			pushToast({ message: 'Receipt removed.' });
			confirmRemoveReceiptId = null;
			await invalidateAll();
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Could not remove the receipt.';
		} finally {
			attachBusyId = null;
		}
	}

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
				// undefined attachmentId is dropped by JSON.stringify — same as
				// "not provided" server-side.
				body: JSON.stringify({
					title: newTitle.trim(),
					amount: newAmount.trim(),
					dueDate: newDueDate || null,
					category: newCategory,
					attachmentId: pendingReceipt?.id
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
			pendingReceipt = null;
			scanNotice = '';
			categorySuggested = false;
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

<svelte:window onkeydown={(e) => e.key === 'Escape' && (viewReceiptUrl = null)} />

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
						onchange={() => (categorySuggested = false)}
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
			<div class="flex flex-wrap items-center gap-2">
				<input
					type="file"
					accept="image/*"
					capture="environment"
					class="sr-only"
					aria-label="Pick a receipt photo to scan"
					bind:this={scanFileInput}
					onchange={onScanPicked}
				/>
				<button
					type="button"
					class="min-h-[44px] rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
					disabled={scanBusy || adding}
					onclick={() => scanFileInput?.click()}
				>
					Scan receipt
				</button>
				{#if categorySuggested}
					<span class="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
						Category from receipt — confirm
					</span>
				{/if}
				{#if pendingReceipt}
					<span class="text-xs text-slate-500"> Receipt photo attached to this new bill. </span>
				{/if}
			</div>
			{#if scanBusy}
				<div class="flex flex-col gap-1" role="status" aria-live="polite">
					<span class="text-sm text-slate-600">Reading receipt…</span>
					<div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
						<div
							class="h-full rounded-full bg-sky-500 transition-all"
							style="width: {Math.max(8, Math.round(scanProgress * 100))}%"
						></div>
					</div>
				</div>
			{/if}
			{#if scanNotice}
				<p class="text-sm text-amber-700" role="status">{scanNotice}</p>
			{/if}
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
				<li class="rounded-xl border border-slate-200 bg-white">
					<div class="flex items-center gap-3 p-3">
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
								<span class="text-xs text-slate-500">{categoryLabel(bill.category ?? 'other')}</span
								>
								{#if bill.dueDate}
									<span
										class="rounded-full px-2 py-0.5 text-[11px] font-medium {isOverdue(bill)
											? 'bg-red-100 text-red-700'
											: 'bg-slate-100 text-slate-600'}"
									>
										{dueLabel(bill.dueDate)}
									</span>
								{/if}
								{#if receiptFor(bill)}
									<span class="text-[11px] font-medium text-sky-700">Receipt</span>
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
						{#if data.canEdit || receiptFor(bill)}
							<button
								type="button"
								onclick={() => toggleExpanded(bill)}
								aria-expanded={expandedId === bill.id}
								aria-label="{expandedId === bill.id
									? 'Hide details'
									: 'Show details'} for {bill.title}"
								class="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
							>
								<svg
									class="h-5 w-5 transition-transform {expandedId === bill.id ? 'rotate-180' : ''}"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/>
								</svg>
							</button>
						{/if}
					</div>
					{#if expandedId === bill.id}
						<div class="border-t border-slate-100 p-3">
							{#if attachBusyId === bill.id && !receiptFor(bill)}
								<div class="flex items-center gap-3" role="status" aria-live="polite">
									<div class="h-20 w-16 animate-pulse rounded bg-slate-100"></div>
									<span class="text-sm text-slate-500">Working on receipt…</span>
								</div>
							{:else if data.receiptsByBillId[bill.id]}
								{@const receipt = data.receiptsByBillId[bill.id]}
								<div class="flex flex-wrap items-start gap-3">
									<button
										type="button"
										class="shrink-0 rounded border border-slate-200 p-1 transition-colors hover:border-slate-400"
										onclick={() => (viewReceiptUrl = receipt.url)}
										aria-label="View receipt full size for {bill.title}"
									>
										<img
											src={receipt.url}
											alt="Receipt for {bill.title}"
											class="h-20 w-16 rounded object-cover"
											loading="lazy"
										/>
									</button>
									<div class="flex min-w-0 flex-col items-start gap-2">
										<button
											type="button"
											class="min-h-[44px] rounded px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
											onclick={() => (viewReceiptUrl = receipt.url)}
										>
											View full size
										</button>
										{#if data.canEdit}
											{#if confirmRemoveReceiptId === bill.id}
												<div class="flex gap-2">
													<button
														type="button"
														class="min-h-[44px] rounded px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
														onclick={() => (confirmRemoveReceiptId = null)}
														aria-label="Cancel remove receipt"
													>
														Cancel
													</button>
													<button
														type="button"
														class="min-h-[44px] rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
														onclick={() => removeReceipt(bill)}
														aria-label="Confirm remove receipt from {bill.title}"
													>
														{attachBusyId === bill.id ? 'Removing…' : 'Confirm remove'}
													</button>
												</div>
											{:else}
												<button
													type="button"
													class="min-h-[44px] rounded px-3 py-2 text-sm text-red-600 hover:bg-red-50"
													disabled={attachBusyId !== null}
													onclick={() => (confirmRemoveReceiptId = bill.id)}
													aria-label="Remove receipt from {bill.title}"
												>
													Remove receipt
												</button>
											{/if}
										{/if}
									</div>
								</div>
							{:else if data.canEdit}
								<div class="flex flex-col gap-2">
									<input
										type="file"
										accept="image/*"
										capture="environment"
										class="sr-only"
										aria-label="Pick a receipt photo to attach"
										bind:this={attachFileInput}
										onchange={onAttachPicked}
									/>
									<button
										type="button"
										class="flex min-h-[44px] items-center justify-center rounded border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
										onclick={() => {
											receiptTargetId = bill.id;
											attachFileInput?.click();
										}}
									>
										Attach receipt photo
									</button>
								</div>
							{:else}
								<p class="text-sm text-slate-500">No receipt attached.</p>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if viewReceiptUrl}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
			<div
				class="flex max-h-full max-w-full flex-col items-center gap-2"
				role="dialog"
				aria-modal="true"
				aria-label="Receipt full size"
			>
				<img src={viewReceiptUrl} alt="Receipt full size" class="max-h-[80vh] rounded bg-white" />
				<button
					type="button"
					class="min-h-[44px] rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-800"
					onclick={() => (viewReceiptUrl = null)}
				>
					Close
				</button>
			</div>
		</div>
	{/if}
</div>
