<script lang="ts">
	import { writable } from 'svelte/store';
	import { DateTime } from 'luxon';
	import type { PageData } from './$types';
	import type { Event } from '$lib/types';
	import Calendar from '$lib/components/calendar/Calendar.svelte';
	import EventFormModal from '$lib/components/calendar/EventFormModal.svelte';
	import { parseEvents } from '$lib/utils/eventDisplay';
	import { invalidateAll } from '$app/navigation';

	export let data: PageData;

	const currentDate = writable(DateTime.now());
	let showModal = false;
	let showEditModal = false;
	let selectedEvent: Event | null = null;
	let selectedEventRsvp: any[] = [];
	let createInitialDate: string | undefined = undefined;

	// Bulk edit (selection mode)
	let selectionMode = false;
	let selectedIds: string[] = [];
	let bulkBusy = false;
	let bulkError = '';
	let bulkLocation = '';
	let bulkAttendants = '';
	let bulkInstruction = '';

	function setSelectionMode(on: boolean) {
		selectionMode = on;
		selectedIds = [];
		bulkError = '';
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
				bulkError = j.error || 'Bulk edit failed';
			}
		} catch {
			bulkError = 'Bulk edit failed';
		} finally {
			bulkBusy = false;
		}
	}

	// Smart mode, phase 1: dry-run returns a plan; phase 2 echoes it for execution.
	let smartPlan: { id: string; label: string }[] | null = null;

	function describePlanOp(po: any): string {
		const ev: any = allEvents.find((e: any) => (e.masterId || e.id) === po.id || e.id === po.id);
		const name = ev?.title || po.title || 'Event';
		if (po.delete) return `Delete "${name}"`;
		const parts: string[] = [];
		if (po.title && po.title !== ev?.title) parts.push(`rename to "${po.title}"`);
		if (po.date) parts.push(`move to ${DateTime.fromISO(po.date).toFormat('ccc, MMM d')}`);
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

	async function runSmart() {
		const instruction = bulkInstruction.trim();
		if (!instruction || !selectedIds.length || bulkBusy) return;
		bulkBusy = true;
		bulkError = '';
		try {
			const res = await fetch('/api/events/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					ids: selectedIds.map((id) => ({ id })),
					op: { type: 'smart', instruction },
					dryRun: !smartPlan,
					plan: smartPlan ?? undefined
				})
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) {
				bulkError = j.error || 'Smart edit failed';
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
					bulkError = 'AI found nothing to change';
					return;
				}
				smartPlan = plan.map((po) => ({ id: po.id, label: describePlanOp(po) }));
			}
		} catch {
			bulkError = 'Smart edit failed';
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

	function close() {
		showModal = false;
		showEditModal = false;
		selectedEvent = null;
		selectedEventRsvp = [];
		createInitialDate = undefined;
	}

	function openCreateAt(date: DateTime) {
		currentDate.set(date);
		createInitialDate = date.toISODate() ?? undefined;
		showModal = true;
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
		await invalidateAll();
		localExtras = [];
		close();
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
		selectedEvent = event.detail;
		if (!selectedEvent) return;
		// Occurrences share the series master's API identity.
		const serverId = selectedEvent.masterId || selectedEvent.id;
		// Fetch RSVP data for this event
		try {
			const res = await fetch(`/api/events/${serverId}/rsvp`);
			if (res.ok) {
				selectedEventRsvp = await res.json();
			}
		} catch (e) {
			console.error('Failed to fetch RSVP data:', e);
		}
		showEditModal = true;
	}
</script>

<div class="pb-24">
	<Calendar
		{currentDate}
		events={allEvents}
		removeEvent={() => {}}
		preferedFirstDayOfWeek={data.userSettings?.weekStart || data.user?.firstDayOfWeek || 'sunday'}
		calendarIds={data.calendarIds || []}
		dueTasks={data.dueTasks || []}
		defaultViewSetting={data.userSettings?.defaultView || 'monthView'}
		createAt={openCreateAt}
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
					{#each smartPlan as p (p.id)}
						<li class="truncate">• {p.label}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<div class="flex flex-wrap items-center gap-2">
			<span class="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
				{selectedIds.length} selected
			</span>

			<select
				onchange={applyBulkCalendar}
				disabled={bulkBusy || selectedIds.length === 0}
				aria-label="Move to calendar"
				class="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
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
					class="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-xs disabled:opacity-50"
					disabled={bulkBusy || selectedIds.length === 0}
					onkeydown={(e) => e.key === 'Enter' && runBulk({ type: 'location', location: bulkLocation })}
				/>
				<button
					type="button"
					onclick={() => runBulk({ type: 'location', location: bulkLocation })}
					disabled={bulkBusy || selectedIds.length === 0 || !bulkLocation.trim()}
					class="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
					class="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-xs disabled:opacity-50"
					disabled={bulkBusy || selectedIds.length === 0}
					onkeydown={(e) => e.key === 'Enter' && runBulk({ type: 'attendants', add: [bulkAttendants] })}
				/>
				<button
					type="button"
					onclick={() => runBulk({ type: 'attendants', add: bulkAttendants.split(',').map((s) => s.trim()).filter(Boolean) })}
					disabled={bulkBusy || selectedIds.length === 0 || !bulkAttendants.trim()}
					class="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
				>
					Add
				</button>
			</div>

			<div class="ml-auto flex items-center gap-2">
				{#if smartPlan}
					<button
						type="button"
						onclick={() => (smartPlan = null)}
						disabled={bulkBusy}
						class="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
					>
						Discard
					</button>
					<button
						type="button"
						onclick={runSmart}
						disabled={bulkBusy}
						class="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
					>
						{bulkBusy ? 'Applying…' : `Apply ${smartPlan.length} change${smartPlan.length === 1 ? '' : 's'}`}
					</button>
				{:else}
					<div class="flex items-center gap-1">
						<input
							type="text"
							bind:value={bulkInstruction}
							placeholder='e.g. "move all to next friday"'
							aria-label="Smart instruction"
							class="w-44 rounded-lg border border-purple-200 bg-purple-50/40 px-2 py-1.5 text-xs placeholder:text-purple-300 disabled:opacity-50"
							disabled={bulkBusy || selectedIds.length === 0}
							onkeydown={(e) => e.key === 'Enter' && runSmart()}
						/>
						<button
							type="button"
							onclick={runSmart}
							disabled={bulkBusy || selectedIds.length === 0 || !bulkInstruction.trim()}
							title="Rename, reschedule, relocate, move calendars or delete — previewed before anything applies"
							class="rounded-lg bg-purple-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
						>
							✨ Smart…
						</button>
					</div>

					<button
						type="button"
						onclick={() => runBulk({ type: 'delete' })}
						disabled={bulkBusy || selectedIds.length === 0}
						class="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
					>
						Delete
					</button>
				{/if}

				<button
					type="button"
					onclick={() => setSelectionMode(false)}
					class="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
				>
					Done
				</button>
			</div>
		</div>
		{#if bulkError}
			<p class="mt-2 text-xs font-medium text-red-600" role="alert">{bulkError}</p>
		{/if}
	</div>
{/if}

<!-- Create Event Modal -->
{#if showModal}
	<EventFormModal
		show={true}
		calendarIds={data.calendarIds || []}
		familyMembers={data.familyMembers || []}
		userSettings={data.userSettings}
		initialDate={createInitialDate}
		on:close={close}
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
		on:close={close}
		on:update={handleEventUpdate}
		on:delete={handleEventDelete}
	/>
{/if}
