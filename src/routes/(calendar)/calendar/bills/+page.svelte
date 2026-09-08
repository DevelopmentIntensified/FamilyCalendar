<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { pushToast } from '$lib/client/toasts';
	import {
		cloudScanReceipt,
		scanReceiptWithFallback,
		type ScanFlowResult
	} from '$lib/client/receiptOcr';
	import { extractPdfTextFromPdf } from '$lib/client/receiptPdf';
	import type { BillCategory } from '$lib/utils/receiptScan';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';

	let { data }: { data: PageData } = $props();

	type BillRow = PageData['bills'][number];
	type ItemRow = NonNullable<ReturnType<PageData['itemsByBill']['get']>>[number];
	type TagRow = PageData['tagSuggestions']['user'][number];

	const CATEGORIES = ['housing', 'utilities', 'subscriptions', 'insurance', 'tax', 'fees', 'other'];

	/** One editable line-item row (price held as a dollars string). */
	interface DraftItem {
		label: string;
		price: string;
		category: string | null;
		name: string | null;
	}

	/** Mirrors the server's tag-key normalization (suggestion badge matching). */
	function normalizeKey(raw: string): string {
		return raw
			.toLowerCase()
			.replace(/[^\p{L}\p{N}\s]/gu, ' ')
			.trim()
			.replace(/\s+/g, ' ')
			.trim();
	}

	/** True when a label is a bare numeric code — a store-SKU item (#031). */
	function isBareCode(label: string): boolean {
		return /^\d{3,24}$/.test(label.trim());
	}

	/** Integer cents from a dollars string; null when blank/invalid. */
	function centsFromPrice(price: string): number | null {
		if (!price.trim()) return null;
		const n = Number(price);
		return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
	}

	let newTitle = $state('');
	let newAmount = $state('');
	let newDueDate = $state('');
	let newCategory = $state('other');
	let adding = $state(false);
	let busyId: string | null = $state(null);
	let actionError = $state('');
	let confirmDeleteId: string | null = $state(null);

	// Create-form line items (#031): optional section, collapsed by default.
	let newItemsOpen = $state(false);
	let newItems: DraftItem[] = $state([]);

	// Expanded-bill line-item editor (#031). Drafts clone the stored items;
	// saving PUTs the whole list (replace-all) and retrains the Tag Table.
	let expandedId: string | null = $state(null);
	let draftItems: DraftItem[] = $state([]);
	let itemsSaving = $state(false);
	let itemsError = $state('');
	/** Most recent label keystroke — feeds the shared <datalist>. */
	let labelQuery = $state('');
	let datalistOptions = $state<string[]>([]);

	/**
	 * The learned name for a (merchant, sku) key, if the user or the global
	 * table already named this code-only item — the "name it once" memory.
	 */
	function learnedName(merchant: string, label: string): string | null {
		const key = normalizeKey(`${normalizeKey(merchant)} ${label}`);
		return suggestionPool.find((tag) => tag.key === key)?.name ?? null;
	}

	function draftFromStored(items: ItemRow[] | undefined, merchant: string): DraftItem[] {
		return (items ?? []).map((item) => ({
			label: item.label,
			price: (item.priceCents / 100).toFixed(2),
			category: item.category,
			name: learnedName(merchant, item.label)
		}));
	}

	function addDraftRow(into: DraftItem[]) {
		into.push({ label: '', price: '', category: null, name: null });
	}

	function removeDraftRow(into: DraftItem[], index: number) {
		into.splice(index, 1);
	}

	/** Rows a save will send: labeled, priceable, validated client-side. */
	function sendableItems(items: DraftItem[]): DraftItem[] {
		return items.filter((item) => item.label.trim() !== '' && centsFromPrice(item.price) !== null);
	}

	async function saveItems(bill: BillRow) {
		if (itemsSaving) return;
		itemsSaving = true;
		itemsError = '';
		try {
			const res = await fetch(`/api/bills/${bill.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					items: sendableItems(draftItems).map((item) => ({
						label: item.label.trim(),
						priceCents: centsFromPrice(item.price),
						category: item.category,
						name: item.name?.trim() ? item.name.trim() : null
					}))
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error || 'Could not save the line items.');
			}
			pushToast({ message: `Line items saved for “${bill.title}”.` });
			await invalidateAll();
		} catch (error) {
			itemsError = error instanceof Error ? error.message : 'Could not save the line items.';
		} finally {
			itemsSaving = false;
		}
	}

	/** Draft items sum in cents (reconcile hint math). */
	function draftSum(items: DraftItem[]): number {
		return items.reduce((sum, item) => sum + (centsFromPrice(item.price) ?? 0), 0);
	}

	// Tag Table suggestions (#031): preloaded user + global top lists,
	// filtered client-side to ≤10 — no per-keystroke server calls, and the
	// full 1000-row set never renders as DOM nodes.
	const suggestionPool = $derived([...data.tagSuggestions.user, ...data.tagSuggestions.global]);

	function refreshDatalist(query: string) {
		labelQuery = query;
		const q = query.trim().toLowerCase();
		const seen = new Set<string>();
		datalistOptions = [];
		for (const tag of suggestionPool) {
			if (datalistOptions.length >= 10) break;
			const candidate = tag.name && isBareCode(tag.key) ? tag.name : tag.key;
			if (q === '' || candidate.startsWith(q)) {
				if (!seen.has(candidate)) {
					seen.add(candidate);
					datalistOptions.push(candidate);
				}
			}
		}
	}

	/** 'your history' | 'common' | null badge for a draft row's label. */
	function suggestionSource(label: string): 'your history' | 'common' | null {
		const key = normalizeKey(label);
		if (!key) return null;
		if (data.tagSuggestions.user.some((tag) => tag.key === key)) return 'your history';
		if (data.tagSuggestions.global.some((tag) => tag.key === key)) return 'common';
		return null;
	}

	// Spend Detail card (surface a, #031): month filter (server-computed via
	// ?month=), category bars, tap → filtered bill list. The effect keeps the
	// select in sync when the load returns a new month (?month= navigation).
	let spendMonth = $state('');
	let selectedCategory: string | null = $state(null);

	$effect(() => {
		spendMonth = data.spendMonth;
	});

	const spendMonths = $derived([
		...new Set(
			data.bills.filter((bill) => bill.dueDate).map((bill) => (bill.dueDate ?? '').slice(0, 7))
		)
	]);

	async function onMonthChange() {
		selectedCategory = null;
		await goto(`/calendar/bills?month=${encodeURIComponent(spendMonth)}`);
	}

	const visibleBills = $derived.by(() => {
		if (!selectedCategory) return data.bills;
		const slice = data.spend.find((s) => s.category === selectedCategory);
		return slice ? data.bills.filter((bill) => slice.billIds.includes(bill.id)) : [];
	});

	const spendTotal = $derived(data.spend.reduce((sum, slice) => sum + slice.cents, 0));

	function toggleExpanded(bill: BillRow) {
		if (expandedId === bill.id) {
			expandedId = null;
			draftItems = [];
			return;
		}
		expandedId = bill.id;
		draftItems = draftFromStored(data.itemsByBill.get(bill.id), bill.title);
		itemsError = '';
	}
	let scanFileInput: HTMLInputElement | null = $state(null);
	let scanBusy = $state(false);
	let scanProgress = $state(0);
	let scanNotice = $state('');
	/** True while the category select still shows a scan/NLP suggestion. */
	let categorySuggested = $state(false);
	/** Opt-in cloud step (issue 010): prompt + pending image (held in memory only). */
	let cloudPrompt = $state(false);
	let cloudBusy = $state(false);
	let pendingScanFile: File | null = null;

	// Quick-add NLP state (issue 011): debounced parse → prefill hints.
	let parseTimer: ReturnType<typeof setTimeout> | null = null;

	/** Dollars string from OCR cents, empty when unextracted. */
	function dollarsFromCents(cents: number | null): string {
		return cents === null ? '' : (cents / 100).toFixed(2);
	}

	/** Common prefill for local and cloud scans; user still confirms with Add bill. */
	function prefillFromScan(scan: {
		merchant: string | null;
		totalCents: number | null;
		dateIso: string | null;
		category: BillCategory;
	}) {
		if (scan.merchant) newTitle = scan.merchant;
		const amount = dollarsFromCents(scan.totalCents);
		if (amount) newAmount = amount;
		if (scan.dateIso) newDueDate = scan.dateIso;
		if (scan.category !== 'other' || scan.merchant) {
			newCategory = scan.category;
			categorySuggested = true;
		}
	}

	/**
	 * Scan → prefill the new-bill form → discard the image. Garbled/failed
	 * OCR keeps nothing: with cloud available the page ASKS before sending
	 * anything (never auto-send); otherwise it asks for manual fields.
	 */
	async function scanAndPrefill(file: File) {
		scanBusy = true;
		scanProgress = 0;
		scanNotice = '';
		categorySuggested = false;
		try {
			const flow = await scanReceiptWithFallback(file, {
				allowCloud: false,
				onProgress: (p) => (scanProgress = p)
			});
			applyScanFlow(file, flow);
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Could not scan the receipt.';
		} finally {
			scanBusy = false;
			scanProgress = 0;
		}
	}

	function applyScanFlow(file: File, flow: ScanFlowResult) {
		if (flow.quality === 'ok') {
			prefillFromScan({
				merchant: flow.local.merchant,
				totalCents: flow.local.totalCents,
				dateIso: flow.local.dateIso,
				category: flow.local.category
			});
			pushToast({ message: 'Receipt scanned — review the details below.' });
			return;
		}
		if (data.cloudScanAvailable) {
			// Poor local read + cloud capability: opt-in prompt, image still on device.
			pendingScanFile = file;
			cloudPrompt = true;
			return;
		}
		scanNotice = "Couldn't read the receipt clearly — fill the fields manually.";
		pushToast({
			message: 'Scanned the photo, but read nothing usable — fill the fields manually.'
		});
	}

	/** Cloud opt-in accepted: EXIF-stripped upload → Azure → same prefill. */
	async function acceptCloudScan() {
		if (!pendingScanFile || cloudBusy) return;
		cloudBusy = true;
		actionError = '';
		try {
			const scan = await cloudScanReceipt(pendingScanFile);
			prefillFromScan({
				merchant: scan.merchant,
				totalCents: scan.totalCents,
				dateIso: scan.date,
				category: scan.category
			});
			scanNotice = '';
			pushToast({ message: 'Cloud scan complete — review the details below.' });
		} catch (error) {
			scanNotice = error instanceof Error ? error.message : 'Cloud scan failed. Try again.';
		} finally {
			cloudBusy = false;
			cloudPrompt = false;
			pendingScanFile = null; // image discarded — never kept
		}
	}

	/** Cloud opt-in declined: drop the pending image, fall back to manual fields. */
	function declineCloudScan() {
		cloudPrompt = false;
		pendingScanFile = null;
		scanNotice = "Couldn't read the receipt clearly — fill the fields manually.";
	}

	function onScanPicked(event: Event) {
		// SAFETY: the only onchange target is the hidden scan file input.
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) scanAndPrefill(file);
	}

	// ── Digital receipt import (#033): paste text / PDF ──────────────────
	// The server extracts a draft; everything lands in the form as a HINT —
	// the user still confirms with "Add bill". A parse is never a commit.
	let pasteOpen = $state(false);
	let pasteText = $state('');
	let importBusy = $state(false);
	let importNote = $state('');
	let pdfFileInput: HTMLInputElement | null = $state(null);

	/** Shape of POST /api/parse-receipt-text's draft response. */
	interface ImportedDraft {
		merchant: string | null;
		date: string | null;
		items: Array<{ label: string; priceCents: number; category: string | null }>;
		totalCents: number | null;
		source: 'llm' | 'regex';
	}

	/** Fills the create form from a server-extracted draft. */
	function applyDraft(draft: ImportedDraft) {
		if (draft.merchant) newTitle = draft.merchant;
		const amount = dollarsFromCents(draft.totalCents);
		if (amount) newAmount = amount;
		if (draft.date) newDueDate = draft.date;
		newItems = draft.items.map((item) => ({
			label: item.label,
			price: dollarsFromCents(item.priceCents),
			category: CATEGORIES.includes(item.category ?? '') ? item.category : null,
			name: null
		}));
		newItemsOpen = draft.items.length > 0;
		importNote = `Read from pasted text (${draft.source === 'llm' ? 'AI' : 'offline'}) — review and fix anything wrong.`;
		pushToast({ message: 'Receipt imported — review the details below.' });
	}

	async function importReceiptText(text: string) {
		importBusy = true;
		importNote = '';
		try {
			const res = await fetch('/api/parse-receipt-text', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error || 'Could not read the receipt text.');
			if (!body.draft)
				throw new Error('Nothing usable in that receipt — fill the fields manually.');
			// SAFETY: the route's draft contract is validated server-side before
			// returning; the assertion restores that shape for the local helper.
			// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- response-shape cast, justified above.
			applyDraft(body.draft as ImportedDraft);
		} catch (error) {
			importNote = error instanceof Error ? error.message : 'Could not read the receipt text.';
		} finally {
			importBusy = false;
		}
	}

	function importPastedText() {
		if (importBusy || !pasteText.trim()) return;
		importReceiptText(pasteText);
	}

	function togglePaste() {
		pasteOpen = !pasteOpen;
		importNote = '';
	}

	/** PDF path: extract the text layer in-browser, then the same pipeline. */
	async function onImportPdfPicked(event: Event) {
		// SAFETY: the only onchange target is the hidden PDF file input.
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!file.name.toLowerCase().endsWith('.pdf')) {
			importNote = 'Pick a PDF file, or use Scan receipt for photos.';
			return;
		}
		importBusy = true;
		importNote = '';
		try {
			const text = await extractPdfTextFromPdf(file);
			if (!text.trim()) {
				importNote = 'This PDF looks like a scan — use Scan receipt instead.';
				return;
			}
			await importReceiptText(text);
		} catch {
			importNote = 'Could not read that PDF — paste the text instead.';
		} finally {
			importBusy = false;
		}
	}

	// ── Email ingest address (#033) ──────────────────────────────────────
	// Local override after a regenerate; the load's value is the default.
	let ingestOverride = $state<string | null>(null);
	const ingestAddress = $derived(ingestOverride ?? data.ingestAddress);
	let ingestBusy = $state(false);

	async function copyIngestAddress() {
		if (!ingestAddress) return;
		try {
			await navigator.clipboard.writeText(ingestAddress);
			pushToast({ message: 'Ingest address copied.' });
		} catch {
			importNote = 'Could not copy — select the address manually.';
		}
	}

	async function regenerateIngestAddress() {
		if (ingestBusy) return;
		ingestBusy = true;
		try {
			const res = await fetch('/api/receipt-ingest-address', { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error || 'Could not regenerate the address.');
			// SAFETY: the route returns { address } (string when configured);
			// the guard above rules out the error body.
			// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- response-shape cast, justified above.
			ingestOverride = body.address as string;
			pushToast({ message: 'New ingest address ready — the old one stopped working.' });
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Could not regenerate the address.';
		} finally {
			ingestBusy = false;
		}
	}

	/** An unconfirmed email-ingest draft: review before it counts. */
	function isDraftBill(bill: BillRow): boolean {
		return Boolean(bill.source && bill.source !== 'manual');
	}

	async function confirmDraftBill(bill: BillRow) {
		if (busyId) return;
		busyId = bill.id;
		actionError = '';
		try {
			const res = await fetch(`/api/bills/${bill.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ confirmDraft: true })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error || 'Could not confirm the bill.');
			}
			pushToast({ message: `“${bill.title}” confirmed — it now counts in your spend.` });
			await invalidateAll();
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Could not confirm the bill.';
		} finally {
			busyId = null;
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

	/**
	 * Quick-add NLP (issue 011): debounced local parse of the title field
	 * prefills the form as a hint — the user still confirms with "Add bill".
	 * Parsed recurrence (recurring/frequency/interval) is parked client-side
	 * until #006; it is never sent to the create endpoint.
	 */
	async function parseQuickAdd(input: string) {
		try {
			const res = await fetch('/api/parse-bill', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ input })
			});
			if (!res.ok) return;
			const json = await res.json();
			const parsed = json.parsed;
			if (!parsed) return;
			if (parsed.title) newTitle = parsed.title;
			const amount = dollarsFromCents(parsed.amountCents ?? null);
			if (amount) newAmount = amount;
			if (parsed.dueDate) newDueDate = parsed.dueDate;
			if (parsed.category && parsed.category !== 'other') {
				newCategory = parsed.category;
				categorySuggested = true;
			}
			// Parked until #006: parsed.recurring / parsed.frequency / parsed.interval
		} catch {
			// Prefill is best-effort; a failed parse leaves the fields alone.
		}
	}

	function onTitleInput() {
		if (parseTimer) clearTimeout(parseTimer);
		if (!newTitle.trim() || adding || scanBusy) return;
		const input = newTitle.trim();
		parseTimer = setTimeout(() => parseQuickAdd(input), 300);
	}

	async function addBill() {
		if (!newTitle.trim() || !newAmount.trim() || adding) return;
		adding = true;
		actionError = '';
		if (parseTimer) {
			clearTimeout(parseTimer);
			parseTimer = null;
		}
		try {
			const items = sendableItems(newItems);
			// Items ride along only when the optional section has usable rows —
			// built as a union, never a conditional empty spread.
			const base = {
				title: newTitle.trim(),
				amount: newAmount.trim(),
				dueDate: newDueDate || null,
				category: newCategory
			};
			const payload =
				items.length > 0
					? {
							...base,
							items: items.map((item) => ({
								label: item.label.trim(),
								priceCents: centsFromPrice(item.price),
								category: item.category,
								name: item.name?.trim() ? item.name.trim() : null
							}))
						}
					: base;
			const res = await fetch('/api/bills', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error || 'Could not add the bill.');
			}
			newTitle = '';
			newAmount = '';
			newDueDate = '';
			newCategory = 'other';
			newItems = [];
			newItemsOpen = false;
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
						placeholder="e.g. Electric $120 due friday"
						bind:value={newTitle}
						oninput={onTitleInput}
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
				<button
					type="button"
					class="min-h-[44px] rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
					disabled={adding}
					aria-expanded={newItemsOpen}
					onclick={() => (newItemsOpen = !newItemsOpen)}
				>
					Line items {newItemsOpen ? '▴' : '▾'}
				</button>
				<input
					type="file"
					accept="image/*"
					capture="environment"
					class="sr-only"
					aria-label="Pick a receipt photo to scan"
					bind:this={scanFileInput}
					onchange={onScanPicked}
				/>
				<input
					type="file"
					accept="application/pdf,.pdf"
					class="sr-only"
					aria-label="Pick a receipt PDF to import"
					bind:this={pdfFileInput}
					onchange={onImportPdfPicked}
				/>
				<button
					type="button"
					class="min-h-[44px] rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
					disabled={scanBusy || adding}
					onclick={() => scanFileInput?.click()}
				>
					Scan receipt
				</button>
				<button
					type="button"
					class="min-h-[44px] rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
					aria-expanded={pasteOpen}
					disabled={scanBusy || adding}
					onclick={togglePaste}
				>
					Paste receipt text
				</button>
				<button
					type="button"
					class="min-h-[44px] rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
					disabled={importBusy || scanBusy || adding}
					onclick={() => pdfFileInput?.click()}
				>
					Import PDF
				</button>
				{#if categorySuggested}
					<span class="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
						Category suggested — confirm
					</span>
				{/if}
			</div>
			{#if newItemsOpen}
				<div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
					<p class="mb-2 text-xs text-slate-500">
						Optional — label what the bill covers. The total stays the bill's amount.
					</p>
					{#snippet createItemRow(item: DraftItem, index: number)}
						<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
							<input
								class="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
								placeholder="Label (e.g. Whole Milk)"
								list="tag-suggestions"
								aria-label="Line item label {index + 1}"
								bind:value={item.label}
								oninput={() => refreshDatalist(item.label)}
								disabled={adding}
							/>
							<input
								class="rounded border border-slate-300 px-2 py-1.5 text-sm sm:w-24"
								placeholder="$0.00"
								inputmode="decimal"
								aria-label="Line item price {index + 1}"
								bind:value={item.price}
								disabled={adding}
							/>
							<select
								class="rounded border border-slate-300 px-2 py-1.5 text-sm sm:w-32"
								aria-label="Line item category {index + 1}"
								bind:value={item.category}
								disabled={adding}
							>
								<option value={null}>Inherit</option>
								{#each CATEGORIES as category (category)}
									<option value={category}>{categoryLabel(category)}</option>
								{/each}
							</select>
							<button
								type="button"
								class="min-h-[44px] rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
								aria-label="Remove line item {index + 1}"
								onclick={() => removeDraftRow(newItems, index)}
								disabled={adding}
							>
								✕
							</button>
						</div>
						{#if suggestionSource(item.label)}
							<span
								class="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700"
							>
								{suggestionSource(item.label) === 'your history' ? 'your history' : 'common'}
							</span>
						{/if}
					{/snippet}
					{#each newItems as item, index (index)}
						{@render createItemRow(item, index)}
					{/each}
					<div class="mt-2 flex items-center gap-3">
						<button
							type="button"
							class="min-h-[44px] rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
							onclick={() => addDraftRow(newItems)}
							disabled={adding || newItems.length >= 50}
						>
							Add item
						</button>
						<span class="text-xs text-slate-500">
							{newItems.length}/50 items · sum ${dollars(draftSum(newItems))}
						</span>
					</div>
				</div>
			{/if}
			{#if pasteOpen}
				<div class="rounded-lg border border-slate-100 bg-slate-50 p-3">
					<label class="flex flex-col gap-2">
						<span class="text-xs text-slate-500">
							Paste the receipt, invoice, or order-confirmation text. It is parsed into the form as
							a hint — nothing is saved until you add the bill.
						</span>
						<textarea
							class="min-h-32 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-sm"
							placeholder={'KROGER #4412\nWHOLE MILK   3.49\nSALES TAX    0.38\nTOTAL       15.12'}
							bind:value={pasteText}
							disabled={importBusy || adding}
						></textarea>
					</label>
					<button
						type="button"
						class="mt-2 min-h-[44px] rounded bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
						onclick={importPastedText}
						disabled={importBusy || adding || !pasteText.trim()}
					>
						{importBusy ? 'Reading…' : 'Import text'}
					</button>
				</div>
			{/if}
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
			{#if cloudBusy}
				<div class="flex flex-col gap-1" role="status" aria-live="polite">
					<span class="text-sm text-slate-600">Scanning with cloud…</span>
					<div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
						<div class="h-full w-1/3 rounded-full bg-sky-500 motion-safe:animate-pulse"></div>
					</div>
				</div>
			{/if}
			{#if scanNotice}
				<p class="text-sm text-amber-700" role="status">{scanNotice}</p>
			{/if}
			{#if importNote}
				<p class="text-sm text-amber-700" role="status">{importNote}</p>
			{/if}
			{#if cloudPrompt}
				<div
					class="flex flex-col gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3"
					role="status"
				>
					<p class="text-sm text-slate-700">
						Try cloud scan? Your receipt photo is sent to Azure's receipt service (deleted there
						within 24h, never stored by us).
					</p>
					<div class="flex flex-col gap-2 sm:flex-row">
						<button
							type="button"
							class="min-h-[44px] rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
							disabled={cloudBusy}
							onclick={acceptCloudScan}
						>
							Scan with cloud
						</button>
						<button
							type="button"
							class="min-h-[44px] rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
							disabled={cloudBusy}
							onclick={declineCloudScan}
						>
							No thanks
						</button>
					</div>
				</div>
			{/if}
		</form>
	{/if}

	{#if data.canEdit && ingestAddress}
		<section
			class="mt-4 rounded-lg border border-slate-200 bg-white p-4"
			aria-label="Receipt email ingest"
		>
			<h2 class="text-sm font-semibold text-slate-700">Email receipts to Family Planz</h2>
			<p class="mt-1 text-xs text-slate-500">
				Forward any receipt or invoice email to this address — it arrives here as an unconfirmed
				draft you review before it counts. Only mail sent to it reaches your account.
			</p>
			<div class="mt-2 flex flex-wrap items-center gap-2">
				<code
					class="min-w-0 flex-1 truncate rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
				>
					{ingestAddress}
				</code>
				<button
					type="button"
					class="min-h-[44px] rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
					onclick={copyIngestAddress}
					disabled={ingestBusy}
				>
					Copy
				</button>
				<button
					type="button"
					class="min-h-[44px] rounded px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
					onclick={regenerateIngestAddress}
					disabled={ingestBusy}
				>
					{ingestBusy ? 'Regenerating…' : 'Regenerate'}
				</button>
			</div>
		</section>
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

	{#snippet spendBar(slice: (typeof data.spend)[number])}
		<li>
			<button
				type="button"
				class="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-100 {selectedCategory ===
				slice.category
					? 'bg-slate-100'
					: ''}"
				aria-pressed={selectedCategory === slice.category}
				onclick={() =>
					(selectedCategory = selectedCategory === slice.category ? null : slice.category)}
			>
				<div class="flex items-baseline justify-between gap-2 text-sm">
					<span class="font-medium text-slate-700">{categoryLabel(slice.category)}</span>
					<span class="font-mono text-slate-900">
						${dollars(slice.cents)}
						<span class="text-xs font-normal text-slate-500">
							{spendTotal > 0 ? Math.round((slice.cents / spendTotal) * 100) : 0}%
						</span>
					</span>
				</div>
				<div class="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
					<div
						class="h-full rounded-full bg-sky-500"
						style="width: {spendTotal > 0
							? Math.max(2, Math.round((slice.cents / spendTotal) * 100))
							: 2}%"
					></div>
				</div>
			</button>
		</li>
	{/snippet}

	<section
		class="mt-4 rounded-xl border border-slate-200 bg-white p-4"
		aria-label="Spend by category"
	>
		<div class="flex items-center justify-between gap-2">
			<h2 class="text-sm font-semibold text-slate-700">Spend by category</h2>
			<select
				class="rounded border border-slate-300 px-2 py-1 text-sm"
				aria-label="Spend month"
				bind:value={spendMonth}
				onchange={onMonthChange}
			>
				<option value="all">All time</option>
				{#each spendMonths as month (month)}
					<option value={month}>{month}</option>
				{/each}
			</select>
		</div>
		{#if data.spend.length === 0}
			<p class="mt-2 text-sm text-slate-500">No bills due in this month yet.</p>
		{:else}
			<ul class="mt-2 flex flex-col gap-1">
				{#each data.spend as slice (slice.category)}
					{@render spendBar(slice)}
				{/each}
			</ul>
		{/if}
		{#if selectedCategory}
			<p class="mt-2 flex items-center gap-2 text-xs text-slate-500">
				Showing {categoryLabel(selectedCategory)} bills.
				<button
					type="button"
					class="font-semibold text-sky-700 hover:underline"
					onclick={() => (selectedCategory = null)}
				>
					Show all
				</button>
			</p>
		{/if}
	</section>

	<datalist id="tag-suggestions">
		{#each datalistOptions as option (option)}
			<option value={option}></option>
		{/each}
	</datalist>

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
	{:else if visibleBills.length === 0}
		<p class="mt-6 py-10 text-center text-sm text-slate-500">
			No {categoryLabel(selectedCategory ?? '')} bills in this view.
		</p>
	{:else}
		<ul class="mt-4 flex flex-col gap-2">
			{#each visibleBills as bill (bill.id)}
				<li class="rounded-xl border border-slate-200 bg-white">
					<div class="flex items-center gap-3 p-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<p class="truncate font-semibold text-slate-900">{bill.title}</p>
								{#if isDraftBill(bill)}
									<span
										class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700"
										>From email</span
									>
								{/if}
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
							</div>
						</div>
						<p class="shrink-0 font-mono font-semibold text-slate-900">
							${dollars(bill.amountCents)}
						</p>
						{#if data.canEdit}
							{#if isDraftBill(bill)}
								<button
									type="button"
									onclick={() => confirmDraftBill(bill)}
									disabled={busyId !== null}
									aria-label="Confirm draft bill {bill.title}"
									class="shrink-0 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-200 disabled:opacity-50"
								>
									{busyId === bill.id ? 'Confirming…' : 'Confirm'}
								</button>
							{:else}
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
							{/if}
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
					</div>
					{#if expandedId === bill.id}
						{#snippet draftRow(item: DraftItem, index: number)}
							<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
								<input
									class="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
									placeholder="Label (e.g. Whole Milk)"
									list="tag-suggestions"
									aria-label="Line item label {index + 1}"
									bind:value={item.label}
									oninput={() => refreshDatalist(item.label)}
								/>
								<input
									class="rounded border border-slate-300 px-2 py-1.5 text-sm sm:w-24"
									placeholder="$0.00"
									inputmode="decimal"
									aria-label="Line item price {index + 1}"
									bind:value={item.price}
								/>
								<select
									class="rounded border border-slate-300 px-2 py-1.5 text-sm sm:w-32"
									aria-label="Line item category {index + 1}"
									bind:value={item.category}
								>
									<option value={null}>Inherit</option>
									{#each CATEGORIES as category (category)}
										<option value={category}>{categoryLabel(category)}</option>
									{/each}
								</select>
								<button
									type="button"
									class="min-h-[44px] rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
									aria-label="Remove line item {index + 1}"
									onclick={() => removeDraftRow(draftItems, index)}
								>
									✕
								</button>
							</div>
							{#if isBareCode(item.label)}
								<div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
									<span class="text-xs text-slate-500">
										Item {item.label.trim()} · ${dollars(centsFromPrice(item.price) ?? 0)} — name it
										once and it sticks:
									</span>
									<input
										class="flex-1 rounded border border-sky-300 px-2 py-1.5 text-sm"
										placeholder="What is this item?"
										aria-label="Name for item {item.label.trim()}"
										bind:value={item.name}
									/>
								</div>
							{/if}
							{#if suggestionSource(item.label)}
								<span
									class="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700"
								>
									{suggestionSource(item.label) === 'your history' ? 'your history' : 'common'}
								</span>
							{/if}
						{/snippet}

						<div class="border-t border-slate-100 p-3">
							<p class="text-sm text-slate-500">
								No receipt photos are kept — receipts are scanned on your device and discarded after
								prefilling.
							</p>

							{#if data.canEdit}
								<div class="mt-3 flex flex-col gap-2">
									<p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
										Line items
									</p>
									{#each draftItems as item, index (index)}
										{@render draftRow(item, index)}
									{/each}
									{#if draftItems.length > 0}
										{@const sum = draftSum(draftItems)}
										{@const diff = bill.amountCents - sum}
										<p class="text-xs text-slate-500">
											Items sum to ${dollars(sum)} of ${dollars(bill.amountCents)}
										</p>
										{#if Math.abs(diff) > 1}
											<div
												class="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
												role="status"
											>
												<span>
													Items sum to ${dollars(sum)} of ${dollars(bill.amountCents)} — add a tax/fees
													line?
												</span>
												{#if diff > 0}
													<button
														type="button"
														class="rounded bg-amber-200 px-2 py-1 font-semibold text-amber-900 hover:bg-amber-300"
														onclick={() =>
															draftItems.push({
																label: 'Sales tax',
																price: dollars(diff),
																category: 'tax',
																name: null
															})}
													>
														Add “Sales tax” ${dollars(diff)}
													</button>
												{/if}
											</div>
										{/if}
									{/if}
									<div class="flex flex-wrap items-center gap-2">
										<button
											type="button"
											class="min-h-[44px] rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
											onclick={() => addDraftRow(draftItems)}
											disabled={itemsSaving || draftItems.length >= 50}
										>
											Add item
										</button>
										<button
											type="button"
											class="min-h-[44px] rounded bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
											onclick={() => saveItems(bill)}
											disabled={itemsSaving || sendableItems(draftItems).length === 0}
										>
											{itemsSaving ? 'Saving…' : 'Save line items'}
										</button>
									</div>
									{#if itemsError}
										<p class="text-sm text-red-600" role="alert">{itemsError}</p>
									{/if}
								</div>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
