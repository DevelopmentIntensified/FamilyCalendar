<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { writable } from 'svelte/store';
	import { DateTime } from 'luxon';
	import type { PageData } from './$types';
	import type { Event } from '$lib/types';
	import Calendar from '$lib/components/calendar/Calendar.svelte';
	import EventFormModal from '$lib/components/calendar/EventFormModal.svelte';
	import EmptyState from '$lib/components/calendar/EmptyState.svelte';
	import calendarNoteDate from '$lib/assets/svgs/calendar-note-date-svgrepo-com.svg';
	import { parseEvents } from '$lib/utils/eventDisplay';
	import { invalidateAll, goto } from '$app/navigation';
	
	import { page } from '$app/stores';

	export let data: PageData;

	const currentDate = writable(DateTime.now());

	// Deep-link seeding: /calendar?date=YYYY-MM-DD&view=day opens the requested
	// day. Read once at init; $page.url works in the browser for the SSR'd page.
	// Only override the store when the date param is present and valid.
	const VALID_VIEW_PARAMS = new Set(['month', 'week', 'day', 'list']);
	let urlSeedHandled = false;
	$: if (!urlSeedHandled && $page.url.searchParams.has('date')) {
		const dateParam = $page.url.searchParams.get('date');
		const parsed = dateParam ? DateTime.fromISO(dateParam) : null;
		if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && parsed && parsed.isValid) {
			currentDate.set(parsed.startOf('day'));
		}
		urlSeedHandled = true;
	}
	$: initialViewParam = (() => {
		const v = $page.url.searchParams.get('view');
		return v && VALID_VIEW_PARAMS.has(v) ? v : undefined;
	})();

	let showModal = false;
	let showEditModal = false;
	let selectedEvent: Event | null = null;
	let selectedEventRsvp: any[] = [];
	let createInitialDate: string | undefined = undefined;
	let createInitialTitle: string | undefined = undefined;
	let createInitialQuickAdd: string | undefined = undefined;
	let createCount = 0;

	// "Create event from selection": a floating bar appears when the user
	// selects text on the page, letting them parse it into a new event via the
	// Quick Add (NLP) pipeline (mirrors the native/extension selection idea).
	let sliceText = '';
	let sliceVisible = false;

	// Bulk edit (selection mode)
	let selectionMode = false;
	let selectedIds: string[] = [];
	let bulkBusy = false;
	let bulkError = '';
	let reportingPhrase = false;
	let phraseReported = false;

	async function reportPhrase(phrase: string, source: 'bulk_edit' | 'event_parse') {
		if (reportingPhrase) return;
		reportingPhrase = true;
		try {
			const res = await fetch('/api/report-phrase', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phrase, source })
			});
			if (res.ok) phraseReported = true;
		} catch {
			// Reporting is best-effort; leave the button for a retry.
		} finally {
			reportingPhrase = false;
		}
	}
	let bulkLocation = '';
	let bulkAttendants = '';
	let bulkInstruction = '';
	let moreToolsOpen = false;

	function setSelectionMode(on: boolean) {
		selectionMode = on;
		selectedIds = [];
		bulkError = '';
		phraseReported = false;
		smartPlan = null;
	}

	function handleEscape(e: KeyboardEvent) {
		if (e.key === 'Escape' && !showModal && !showEditModal && selectionMode) {
			setSelectionMode(false);
		}
	}

	function applyBulkCalendar(e: globalThis.Event) {
		const select = e.currentTarget as HTMLSelectElement;
		const calendarId = select.value;
		select.value = '';
		if (calendarId) runBulk({ type: 'calendar', calendarId });
	}

	async function runBulk(op: Record<string, unknown>) {
		if (selectedIds.length === 0 || bulkBusy) return;
		if (op.type === 'delete' && !confirm(`Delete ${selectedIds.length} event(s)? Attached checklists go too.`)) return;
		bulkBusy = true;
		bulkError = '';
		phraseReported = false;
		try {
			const res = await fetch('/api/events/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: selectedIds.map((id) => ({ id })), op })
			});
			if (res.ok) {
				selectedIds = [];
				bulkLocation = '';
				bulkAttendants = '';
				bulkInstruction = '';
				await invalidateAll();
			} else {
				const j = await res.json().catch(() => ({}));
				bulkError = j.error || "Hmm, that didn't take. Try again.";
			}
		} catch {
			bulkError = "Hmm, that didn't take. Try again.";
		} finally {
			bulkBusy = false;
		}
	}

	// Smart mode, phase 1: dry-run returns a plan; phase 2 echoes it for execution.
	// ops = raw plan sent back verbatim on apply; items = display labels.
	let smartPlan: { ops: Record<string, unknown>[]; items: { id: string; label: string }[] } | null =
		null;

	function describePlanOp(po: any): string {
		const ev: any = allEvents.find((e: any) => (e.masterId || e.id) === po.id || e.id === po.id);
		const name = ev?.title || po.title || 'Event';
		if (po.delete) return `Delete "${name}"`;
		const parts: string[] = [];
		if (po.title && po.title !== ev?.title) parts.push(`rename to "${po.title}"`);
		if (po.date) {
			const marker = isPastDate(po.date) ? ' (past)' : '';
			parts.push(`move to ${DateTime.fromISO(po.date).toFormat('ccc, MMM d')}${marker}`);
		}
		if (po.startTime) parts.push(`start ${po.startTime}`);
		if (po.endTime) parts.push(`end ${po.endTime}`);
		if (po.location) parts.push(`at ${po.location}`);
		if (typeof po.allDay === 'boolean') parts.push(po.allDay ? 'all day' : 'timed');
		if (po.calendarId) {
			const cal = (data.calendarIds || []).find((c: any) => c.id === po.calendarId);
			if (cal) parts.push(`→ ${cal.name}`);
		}
		return parts.length ? `${name}: ${parts.join(', ')}` : name;
	}

	function isPastDate(dateIso: string): boolean {
		return DateTime.fromISO(dateIso) < DateTime.now().startOf('day');
	}

	function planMovesToPast(): boolean {
		return !!smartPlan?.ops.some(
			(op) => typeof op.date === 'string' && isPastDate(op.date)
		);
	}

	async function runSmart() {
		const instruction = bulkInstruction.trim();
		if (!instruction || !selectedIds.length || bulkBusy) return;
		// Moving events into the past is allowed, but confirm first.
		if (smartPlan && planMovesToPast()) {
			const pastCount = smartPlan.ops.filter(
				(op) => typeof op.date === 'string' && isPastDate(op.date)
			).length;
			if (!confirm(`${pastCount} change${pastCount === 1 ? '' : 's'} move${pastCount === 1 ? 's' : ''} events to past dates. Apply anyway?`)) {
				return;
			}
		}
		bulkBusy = true;
		bulkError = '';
		phraseReported = false;
		try {
			const res = await fetch('/api/events/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					ids: selectedIds.map((id) => ({ id })),
					op: { type: 'smart', instruction },
					dryRun: !smartPlan,
					plan: smartPlan?.ops ?? undefined
				})
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				bulkError = j.error || "Hmm, that didn't take. Try again.";
				smartPlan = null;
				return;
			}
			if (smartPlan) {
				// Phase 2 applied server-side.
				smartPlan = null;
				selectedIds = [];
				bulkInstruction = '';
				await invalidateAll();
			} else {
				const plan: any[] = j.plan ?? [];
				if (plan.length === 0) {
					bulkError = 'Could not match that instruction. Try naming a date or the events.';
					return;
				}
				smartPlan = {
					ops: plan,
					items: plan.map((po) => ({ id: po.id, label: describePlanOp(po) }))
				};
			}
		} catch {
			bulkError = "Hmm, that didn't take. Try again.";
		} finally {
			bulkBusy = false;
		}
	}

	// Optimistically shown events between creation and the next load refresh.
	let localExtras: Event[] = [];

	function toDisplayEvent(row: any): Event[] {
		// Same multi-day split as the server pipeline (shared parseEvents).
		return parseEvents([row]) as Event[];
	}

	// Combine all events
	$: allEvents = [
		...(data.userEvents || []),
		...(data.familyEvents || []),
		...(data.adEvents || []),
		...localExtras
	];

	// First-run card: shown only when there is truly nothing on the calendar.
	let dismissedFirstRun = false;

	onMount(() => {
		dismissedFirstRun = localStorage.getItem('familyplanz:firstRunDismissed') === 'true';

		// Deep link: /calendar?quickadd=<title> opens the create modal prefilled.
		const quickAddTitle = $page.url.searchParams.get('quickadd');
		if (quickAddTitle && quickAddTitle.trim()) {
			createInitialTitle = quickAddTitle;
			showModal = true;
			goto('/calendar', { replaceState: true });
		}

		// "Create event from selection": watch for text selection anywhere on the
		// page and surface a floating bar offering to turn it into an event.
		const updateSlice = () => {
			const sel = window.getSelection();
			const text = sel?.toString().trim() || '';
			if (!text || sel?.isCollapsed) {
				sliceVisible = false;
				sliceText = '';
				return;
			}
			// Don't hijack selections happening inside the modal's own inputs.
			if (showModal) return;
			sliceText = text;
			sliceVisible = true;
		};
		document.addEventListener('selectionchange', updateSlice);
		window.addEventListener('mouseup', updateSlice);
		window.addEventListener('keyup', updateSlice);
		onDestroy(() => {
			document.removeEventListener('selectionchange', updateSlice);
			window.removeEventListener('mouseup', updateSlice);
			window.removeEventListener('keyup', updateSlice);
		});
	});

	function dismissFirstRun() {
		dismissedFirstRun = true;
		try {
			localStorage.setItem('familyplanz:firstRunDismissed', 'true');
		} catch {
			// Storage may be unavailable (private mode); dismissal still applies for this session.
		}
	}

	$: showFirstRunCard = !dismissedFirstRun && allEvents.length === 0 && (data.dueTasks || []).length === 0;

	function close() {
		showModal = false;
		showEditModal = false;
		selectedEvent = null;
		selectedEventRsvp = [];
		createInitialDate = undefined;
		createInitialTitle = undefined;
		createInitialQuickAdd = undefined;
	}

	function openCreateAt(date: DateTime) {
		currentDate.set(date);
		createInitialDate = date.toISODate() ?? undefined;
		showModal = true;
	}

	// Open the create modal pre-parsed with the currently selected text.
	function createEventFromSelection() {
		const text = sliceText.trim();
		if (!text) return;
		createInitialTitle = undefined; // let the NLP Quick Add field drive parsing
		createInitialQuickAdd = text;
		createInitialDate = undefined;
		showModal = true;
		sliceText = '';
		sliceVisible = false;
		// Clear the OS/highlight selection so it doesn't linger behind the modal.
		const sel = window.getSelection();
		if (sel) sel.removeAllRanges();
	}

	async function handleTaskCreated() {
		await invalidateAll();
		close();
	}

	async function handleEventCreated(event: CustomEvent) {
		const created = event.detail?.created;
		if (created) {
			const familyCalIds = new Set((data.calendarIds || []).slice(1).map((c: any) => c.id));
			const color = familyCalIds.has(created.calendarId)
				? data.familyCalendarColor
				: data.userCalendarColor;
			localExtras = [...localExtras, ...toDisplayEvent({ ...created, color })];
		}
	try {
		await invalidateAll();
	} finally {
		localExtras = [];
	}
	// Reset the form for another creation instead of closing the modal.
	createInitialDate = undefined;
	createInitialTitle = undefined;
	createCount++;
	}

	async function handleEventUpdate(event: CustomEvent) {
		await invalidateAll();
		close();
	}

	async function handleEventDelete(event: CustomEvent) {
		const { id, scope, occurrenceDate } = event.detail;
		try {
			const res = await fetch(`/api/events/${id}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(scope && occurrenceDate ? { scope, occurrenceDate } : {})
			});
			if (res.ok) {
				await invalidateAll();
			}
		} catch (e) {
			console.error('Failed to delete event:', e);
		}
		close();
	}

	// Handle event click from calendar views
	async function handleEventClick(event: CustomEvent) {
		await openEditModal(event.detail);
	}

	async function openEditModal(target: Event) {
		selectedEvent = target;
		if (!selectedEvent) return;
		// Occurrences share the series master's API identity.
		const serverId = selectedEvent.masterId || selectedEvent.id;
		const eventId = selectedEvent.id;
		// Fetch RSVP data for this event
		try {
			const res = await fetch(`/api/events/${serverId}/rsvp`);
			if (res.ok) {
				const rsvp = await res.json();
				// Ignore a stale response if the selection changed while fetching.
				if (selectedEvent?.id === eventId) selectedEventRsvp = rsvp;
			}
		} catch (e) {
			console.error('Failed to fetch RSVP data:', e);
		}
		showEditModal = true;
	}

	// Deep link: /calendar?edit=<eventId> opens the edit modal once data is loaded.
	let autoOpenedEditId: string | null = null;

	$: if (allEvents.length > 0 && $page.url.searchParams.has('edit')) {
		const editId = $page.url.searchParams.get('edit');
		if (editId && autoOpenedEditId !== editId) {
			autoOpenedEditId = editId;
			goto('/calendar', { replaceState: true });
			const target = allEvents.find(
				(e) => e.id === editId || ('masterId' in e && e.masterId === editId)
			);
			if (target) openEditModal(target as Event);
		}
	}
</script>

<div class="pb-24">
	{#if (data.loadWarnings ?? []).length > 0}
		<div class="mx-auto max-w-xl px-4 pt-4" role="alert">
			<div class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
				Couldn't load {(data.loadWarnings ?? []).join(', ')} just now — everything else is up to date.
			</div>
		</div>
	{/if}
	{#if showFirstRunCard}
		<div class="relative mx-auto mb-4 max-w-xl px-4 pt-4">
			<EmptyState
				illustration={calendarNoteDate}
				title="Blank calendar!"
				hint="Add your first thing — or import a year of home upkeep in two taps."
			>
				<a
					href="/calendar/tasks"
					class="mt-4 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
				>
					Browse ✨ Smart tasks
				</a>
			</EmptyState>
			<button
				type="button"
				onclick={dismissFirstRun}
				aria-label="Dismiss"
				class="absolute right-6 top-6 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-white hover:text-slate-600"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	{/if}
	<Calendar
		{currentDate}
		events={allEvents}
		removeEvent={() => {}}
		preferedFirstDayOfWeek={data.userSettings?.weekStart || data.user?.firstDayOfWeek || 'sunday'}
		calendarIds={data.calendarIds || []}
		dueTasks={data.dueTasks || []}
		defaultViewSetting={data.userSettings?.defaultView || 'monthView'}
		initialView={initialViewParam}
		createAt={openCreateAt}
		dailyVerse={data.dailyVerse}
		selectionMode={selectionMode}
		selectedIds={selectedIds}
		onToggleSelectionMode={setSelectionMode}
		onToggleSelect={(e: any) => {
			selectedIds = selectedIds.includes(e.id) ? selectedIds.filter((x) => x !== e.id) : [...selectedIds, e.id];
		}}
		on:eventClick={handleEventClick}
	/>
</div>

<svelte:window on:keydown={handleEscape} />

{#if !selectionMode}
	<!-- Floating Quick Add Button -->
	<button
		onclick={() => { createInitialDate = undefined; showModal = true; }}
		class="fixed bottom-24 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-primary-600 shadow-xl shadow-primary-400/50 hover:bg-primary-700 hover:scale-105 active:scale-95 transition-all"
		aria-label="Quick Add Event"
	>
		<svg class="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
		</svg>
	</button>
{/if}

{#if selectionMode}
	<!-- Bulk edit bar -->
	<div
		class="fixed bottom-14 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
		role="toolbar"
		aria-label="Bulk edit selected events"
	>
		{#if smartPlan}
			<div class="mb-2 rounded-lg border border-purple-200 bg-purple-50/70 p-2.5">
				<p class="mb-1 text-[10px] font-bold uppercase tracking-wide text-purple-700">
					Planned changes — review, then apply
				</p>
				<ul class="max-h-28 space-y-0.5 overflow-y-auto text-xs text-slate-700">
					{#each smartPlan.items as p (p.id)}
						<li class="truncate">• {p.label}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div class="flex flex-wrap items-center gap-2">
			<span class="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
				{selectedIds.length} selected
			</span>

			<div class="flex flex-wrap items-center gap-2 {moreToolsOpen ? '' : 'hidden'} sm:contents">
				<select
					onchange={applyBulkCalendar}
					disabled={bulkBusy || selectedIds.length === 0}
					aria-label="Move to calendar"
					class="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-medium text-slate-700 disabled:opacity-50 sm:py-1.5"
				>
					<option value="">Calendar…</option>
					{#each data.calendarIds || [] as c (c.id)}
						<option value={c.id}>{c.name}</option>
					{/each}
				</select>

				<div class="flex items-center gap-1">
					<input
						type="text"
						bind:value={bulkLocation}
						placeholder="Location…"
						aria-label="Set location"
						class="w-28 rounded-lg border border-slate-300 px-2 py-2 text-xs disabled:opacity-50 sm:py-1.5"
						disabled={bulkBusy || selectedIds.length === 0}
						onkeydown={(e) => e.key === 'Enter' && runBulk({ type: 'location', location: bulkLocation })}
					/>
					<button
						type="button"
						onclick={() => runBulk({ type: 'location', location: bulkLocation })}
						disabled={bulkBusy || selectedIds.length === 0 || !bulkLocation.trim()}
						class="rounded-lg border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:py-1.5"
					>
						Set
					</button>
				</div>

				<div class="flex items-center gap-1">
					<input
						type="text"
						bind:value={bulkAttendants}
						placeholder="+ Attendant…"
						aria-label="Add attendant"
						class="w-28 rounded-lg border border-slate-300 px-2 py-2 text-xs disabled:opacity-50 sm:py-1.5"
						disabled={bulkBusy || selectedIds.length === 0}
						onkeydown={(e) => e.key === 'Enter' && runBulk({ type: 'attendants', add: [bulkAttendants] })}
					/>
					<button
						type="button"
						onclick={() => runBulk({ type: 'attendants', add: bulkAttendants.split(',').map((s) => s.trim()).filter(Boolean) })}
						disabled={bulkBusy || selectedIds.length === 0 || !bulkAttendants.trim()}
						class="rounded-lg border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:py-1.5"
					>
						Add
					</button>
				</div>
			</div>

			<div class="ml-auto flex items-center gap-2">
				{#if smartPlan}
					<button
						type="button"
						onclick={() => (smartPlan = null)}
						disabled={bulkBusy}
						class="rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:py-1.5"
					>
						Discard
					</button>
					<button
						type="button"
						onclick={runSmart}
						disabled={bulkBusy}
						class="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50 sm:py-1.5"
					>
						{bulkBusy
							? 'Applying…'
							: `Apply ${smartPlan.items.length} change${smartPlan.items.length === 1 ? '' : 's'}`}
					</button>
				{:else}
					<div class="flex items-center gap-1 {moreToolsOpen ? '' : 'hidden'} sm:contents">
						<input
							type="text"
							bind:value={bulkInstruction}
							placeholder='e.g. "move all to next friday"'
							aria-label="Smart instruction"
							class="w-44 rounded-lg border border-purple-200 bg-purple-50/40 px-2 py-2 text-xs placeholder:text-purple-300 disabled:opacity-50 sm:py-1.5"
							disabled={bulkBusy || selectedIds.length === 0}
							onkeydown={(e) => e.key === 'Enter' && runSmart()}
						/>
						<button
							type="button"
							onclick={runSmart}
							disabled={bulkBusy || selectedIds.length === 0 || !bulkInstruction.trim()}
							title="Rename, reschedule, relocate, move calendars or delete — previewed before anything applies"
							class="rounded-lg bg-purple-600 px-2.5 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50 sm:py-1.5"
						>
							✨ Smart…
						</button>
					</div>

					<button
						type="button"
						onclick={() => runBulk({ type: 'delete' })}
						disabled={bulkBusy || selectedIds.length === 0}
						class="rounded-lg border border-red-200 px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 sm:py-1.5"
					>
						Delete
					</button>
				{/if}

				<button
					type="button"
					onclick={() => setSelectionMode(false)}
					class="rounded-lg px-2 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 sm:py-1.5"
				>
					Done
				</button>
			</div>

			<button
				type="button"
				onclick={() => (moreToolsOpen = !moreToolsOpen)}
				aria-expanded={moreToolsOpen}
				class="rounded-lg border border-slate-300 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:hidden"
			>
				{moreToolsOpen ? 'Less tools' : 'More tools'}
			</button>
		</div>
		{#if bulkError}
			<div class="mt-2 flex items-center gap-2">
				<p class="text-xs font-medium text-red-600" role="alert">{bulkError}</p>
				{#if bulkInstruction.trim()}
					{#if phraseReported}
						<span class="text-xs text-slate-400">Thanks — reported.</span>
					{:else}
						<button
							type="button"
							onclick={() => reportPhrase(bulkInstruction.trim(), 'bulk_edit')}
							disabled={reportingPhrase}
							class="text-xs text-slate-400 underline hover:text-slate-600 disabled:opacity-50"
						>
							{reportingPhrase ? 'Reporting…' : 'Report this'}
						</button>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
{/if}

{#if sliceVisible && !showModal && !showEditModal && !selectionMode}
	<!-- Create event from selection -->
	<button
		type="button"
		onclick={createEventFromSelection}
		class="fixed bottom-6 left-1/2 z-30 max-w-[90vw] -translate-x-1/2 truncate rounded-full bg-slate-900/90 px-4 py-2.5 text-sm font-medium text-white shadow-xl backdrop-blur-sm transition-colors hover:bg-slate-900"
		aria-label="Create event from selection"
	>
		Create event from selection
	</button>
{/if}

<!-- Create Event Modal -->
{#if showModal}
	<EventFormModal
		show={true}
		calendarIds={data.calendarIds || []}
		familyMembers={data.familyMembers || []}
		userSettings={data.userSettings}
		initialDate={createInitialDate}
		initialTitle={createInitialTitle}
		initialQuickAdd={createInitialQuickAdd}
		{createCount}
		onClose={close}
		on:create={handleEventCreated}
		on:createTask={handleTaskCreated}
	/>
{/if}

<!-- Edit Event Modal -->
{#if showEditModal && selectedEvent}
	<EventFormModal
		show={true}
		event={selectedEvent}
		calendarIds={data.calendarIds || []}
		familyMembers={data.familyMembers || []}
		rsvpData={selectedEventRsvp}
		userSettings={data.userSettings}
		onClose={close}
		on:update={handleEventUpdate}
		on:delete={handleEventDelete}
	/>
{/if}
