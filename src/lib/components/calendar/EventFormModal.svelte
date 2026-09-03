<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { DateTime } from 'luxon';
	import type { Event } from '$lib/types';
	import { getContactColor } from '$lib/utils/contactColors';
	import { trapFocusAction } from '$lib/utils/focusTrap';
	import LocationSearch from '$lib/components/LocationSearch.svelte';
	import { createEventForm } from './EventFormModel.svelte';
	import ChecklistSection from './ChecklistSection.svelte';
	import AttendantPicker from './AttendantPicker.svelte';
	import { queueMutation } from '$lib/utils/offline';

	export let show = false;
	export let onClose: () => void = () => {};
	export let event: Event | null = null;
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	export let familyMembers: { userId: string; firstName?: string; lastName?: string; email: string }[] = [];
	export let rsvpData: {
		userId: string | null;
		status: string;
		firstName?: string | null;
		lastName?: string | null;
		name?: string | null;
		inviteType?: string | null;
	}[] = [];
	export let userSettings: {
		defaultCalendarId?: string | null;
		autoParseEventDetails?: boolean | null;
		useCloudAI?: boolean | null;
	} | null = null;
	export let initialDate: string | undefined = undefined;
	export let initialTitle: string | undefined = undefined;
	export let initialQuickAdd: string | undefined = undefined;
	export let initialTime: string | undefined = undefined;
	export let createCount = 0;

	const dispatch = createEventDispatcher();

	// Mobile bottom-sheet swipe state (mirrors EventModal).
	let dragging = false;
	let dragStartY = 0;
	let dragOffset = 0;
	let dragTransition = false;

	let nlInput = '';
	let showMore = false;
	// Set when the user clicks "Show Less": suppresses the auto-reveal of
	// parser-detected fields until a fresh parse re-detects them (or the user
	// clicks "Show More" again).
	let nlpCollapsed = false;
	let parsing = false;
	let reportingPhrase = false;
	let phraseReported = false;
	let phraseReportable = false;
	let lastParseResult: Record<string, unknown> | null = null;
	let multiResults: Array<{ parsed: Record<string, unknown>; confidence: number }> | null = null;
	let parseTimeout: ReturnType<typeof setTimeout>;
	let submitting = false;
	let submitError = '';
	let calendarDropdownOpen = false;
	let entryType: 'event' | 'task' = 'event';
	let taskTitle = '';
	let taskDueDate = initialDate || DateTime.now().toISODate() || '';

	let form: ReturnType<typeof createEventForm>;

	$: form = createEventForm({
		calendars: calendarIds,
		familyMembers,
		defaultCalendarId: userSettings?.defaultCalendarId,
		initialDate,
		initialEvent: event ? {
			id: event.id,
			title: event.title || '',
			description: event.description || '',
			location: event.location || '',
			calendarId: event.calendarId || '',
			start: event.start || '',
			end: event.end || undefined,
			allDay: event.allDay || false,
			recurrenceFrequency: event.recurrenceFrequency,
			recurrenceInterval: event.recurrenceInterval,
			reminderMinutes: (event as { reminderMinutes?: number | null }).reminderMinutes ?? null,
			masterId: event.masterId,
			occurrenceDate: event.occurrenceDate
		} : undefined
	});

	// Pre-populate the attendee chips + required/optional roles when the form
	// opens for editing: reuse rsvpData when the page already loaded it, else
	// fetch the attendance once. The edit modal mounts fresh per event, so
	// onMount is safe (legacy component — no runes).
	onMount(() => {
		const id = form.eventId;
		if (!form.isEditMode || !id) return;
		if (rsvpData && rsvpData.length > 0) {
			form.prefillInvites(
				rsvpData as {
					userId: string | null;
					name?: string | null;
					inviteType?: string | null;
				}[]
			);
			return;
		}
		let cancelled = false;
		fetch(`/api/events/${id}/rsvp`)
			.then((r) => (r.ok ? r.json() : []))
			.then((rows) => {
				if (!cancelled && Array.isArray(rows)) form.prefillInvites(rows);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	let editScope: 'this' | 'all' = 'this';
	let showDeleteConfirm = false;

	// Seed the title from initialTitle once per open, mirroring initialDate.
	let initialTitleApplied = false;
	$: if (show && initialTitle && !initialTitleApplied) {
		if (!form.title) form.title = initialTitle;
		initialTitleApplied = true;
	}
	$: if (!show) initialTitleApplied = false;

	// Seed the start time from a picked time slot once per open (create mode
	// only), mirroring initialTitle. A picked slot is timed, never all-day.
	let initialTimeApplied = false;
	$: if (show && !form.isEditMode && initialTime && !initialTimeApplied) {
		if (!form.startTime) {
			form.startTime = initialTime;
			form.allDay = false;
		}
		initialTimeApplied = true;
	}
	$: if (!show) initialTimeApplied = false;

	// Seed the Quick Add (NLP) field from extracted text once per open (create
	// mode only), so date/time/location get auto-parsed on the selected text.
	let initialQuickAddApplied = false;
	$: if (show && !form.isEditMode && initialQuickAdd && !initialQuickAddApplied) {
		if (!nlInput) {
			nlInput = initialQuickAdd;
			onNlInputChange();
		}
		initialQuickAddApplied = true;
	}
	$: if (!show) initialQuickAddApplied = false;

	// Pending checklist titles queued during create; flushed after POST /api/events.
	let pendingTaskTitles: string[] = [];
	let attachedTaskCount = 0;

	$: eventIdForTasks = form?.isEditMode ? form.masterId || form.eventId : null;

	$: hasDetectedFields = form.isDetected('date') || form.isDetected('startTime') || form.isDetected('location') || form.isDetected('attendants');
	$: if (hasDetectedFields && !showMore && !form.isEditMode) {
		showMore = true;
	}

	$: selectedCal = calendarIds.find(c => c.id === form.selectedCalendarId) || null;
	$: calColor = selectedCal
		? (selectedCal.color ? { bg: selectedCal.color, text: '#ffffff' } : getContactColor(selectedCal.name))
		: { bg: '#F1F5F9', text: '#64748B' };

	async function parseNlInput() {
		if (!nlInput.trim()) return;

		parsing = true;
		phraseReported = false;
		try {
			const response = await fetch('/api/parse-event', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					input: nlInput,
					useCloud: userSettings?.useCloudAI ?? true
				})
			});

			if (response.ok) {
				const result = await response.json();
				const first =
					result.results?.length > 1 ? result.results[0].parsed : result.parsed;
				if (first) {
					multiResults = result.results?.length > 1 ? result.results : null;
					form.applyNlpResult(first);
					lastParseResult = first;
					phraseReportable = true;
					// "on the family calendar" preselects the matching calendar.
					// Never blocks creation: unmatched names keep the default.
					if (first.calendarName && calendarIds.length > 0) {
						const want = String(first.calendarName).toLowerCase();
						const match =
							calendarIds.find((c) => c.name.toLowerCase() === want) ??
							calendarIds.find(
								(c) =>
									c.name.toLowerCase().includes(want) || want.includes(c.name.toLowerCase())
							);
						if (match) form.selectedCalendarId = match.id;
					}
					// A fresh parse re-reveals previously collapsed detected fields.
					nlpCollapsed = false;
				}
			}
		} catch (error) {
			console.error('Parse error:', error);
		} finally {
			parsing = false;
		}
	}

	async function reportPhrase() {
		if (reportingPhrase || !nlInput.trim()) return;
		reportingPhrase = true;
		// Multi-event parses report every result, not just the first —
		// admins see the matches for all objects.
		const matched =
			multiResults && multiResults.length > 1
				? { results: multiResults.map((r) => r.parsed) }
				: lastParseResult;
		try {
			const res = await fetch('/api/report-phrase', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phrase: nlInput.trim(), source: 'event_parse', matched })
			});
			if (res.ok) phraseReported = true;
		} catch {
			// Best-effort; leave the link for retry.
		} finally {
			reportingPhrase = false;
		}
	}

	function onNlInputChange() {
		if (!form.isDetected('description')) {
			form.description = nlInput;
		}
		clearTimeout(parseTimeout);
		if (userSettings?.autoParseEventDetails === false) return;
		parseTimeout = setTimeout(() => parseNlInput(), 300);
	}

	function close() {
		show = false;
		submitError = '';
		showDeleteConfirm = false;
		dragOffset = 0;
		dragTransition = false;
		dispatch('close');
		onClose();
	}

	function onDragStart(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		dragStartY = e.touches[0].clientY;
		dragOffset = 0;
		dragTransition = false;
		dragging = true;
	}

	function onDragMove(e: TouchEvent) {
		if (!dragging) return;
		dragOffset = Math.max(0, e.touches[0].clientY - dragStartY);
	}

	function onDragEnd() {
		if (!dragging) return;
		dragging = false;
		dragTransition = true;
		const shouldClose = dragOffset > 100;
		dragOffset = 0;
		if (shouldClose) close();
	}

	async function submitTask() {
		const title = taskTitle.trim();
		if (!title || submitting) return;
		submitting = true;
		try {
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title, dueDate: taskDueDate || null })
			});
			if (res.ok) {
				const json = await res.json();
				dispatch('createTask', json.task);
				taskTitle = '';
				taskDueDate = initialDate || DateTime.now().toISODate() || '';
			}
		} catch (err) {
			console.error('Create task failed:', err);
		} finally {
			submitting = false;
		}
	}

	// Multi-event quick-add: one payload per parsed segment, each built on
	// a throwaway form so the visible form state is never polluted.
	async function createAllEvents() {
		if (!multiResults || multiResults.length < 2 || submitting) return;
		submitError = '';
		submitting = true;
		try {
			for (const r of multiResults) {
				const tmp = createEventForm({
					calendars: calendarIds,
					familyMembers,
					defaultCalendarId: form.selectedCalendarId
				});
				tmp.applyNlpResult(r.parsed as any);
				const payload = tmp.submitPreparation();
				if (!payload) continue;
				const res = await fetch('/api/events', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});
				if (!res.ok) {
					const j = await res.json().catch(() => ({}));
					throw new Error(j.error || 'Something went wrong. Try again.');
				}
				const json = await res.json();
				dispatch('create', { ...payload, created: json.event ?? null });
			}
			close();
		} catch (err) {
			console.error('Create failed:', err);
			submitError = err instanceof Error ? err.message : 'Something went wrong. Try again.';
		} finally {
			submitting = false;
		}
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (entryType === 'task') {
			await submitTask();
			return;
		}
		submitError = '';
		submitting = true;

		const eventData = form.submitPreparation();
		if (!eventData) {
			submitting = false;
			return;
		}

		if (form.isEditMode && form.eventId) {
			try {
				const isOccurrence = form.isRecurringOccurrence;
				// The event object handed to the edit modal is an expanded
				// occurrence carrying a composite VIRTUAL id (`{masterId}~{iso}`),
				// even for non-recurring events. The server only knows the real
				// master id, so always target form.masterId when it exists.
				const targetId = form.masterId || form.eventId;
				const payload = isOccurrence
					? { ...eventData, scope: editScope, occurrenceDate: form.occurrenceDate }
					: eventData;
				const res = await fetch(`/api/events/${targetId}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});
				if (res.ok) {
					dispatch('update', { id: targetId, ...eventData });
				} else {
					const j = await res.json().catch(() => ({}));
					submitError = j.error || 'Something went wrong. Try again.';
				}
			} catch (err) {
				console.error('Update failed:', err);
				submitError = 'Network error. Check your connection and try again.';
			}
		} else {
			try {
				const res = await fetch('/api/events', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(eventData)
				});
				if (res.ok) {
					const json = await res.json();
					// Attach any checklist items queued during creation.
					const createdId = json.event?.id;
					if (createdId && pendingTaskTitles.length > 0) {
						for (const title of pendingTaskTitles) {
							try {
								await fetch('/api/tasks', {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({ title, eventId: createdId })
								});
							} catch (e) {
								console.error('Failed to attach task:', e);
							}
						}
						pendingTaskTitles = [];
					}
					dispatch('create', { ...eventData, created: json.event ?? null });
					// Multi-date quick-add ("sept 23 & 30"): one event per
					// date. Offsets apply from the parsed base date so a
					// user-edited form date shifts the whole set together.
					const extraDates =
						lastParseResult?.dates?.length > 1 && lastParseResult.dates[0]
							? lastParseResult.dates.slice(1)
							: [];
					if (extraDates.length > 0 && lastParseResult.dates[0] && eventData.start) {
						const baseDay = DateTime.fromISO(lastParseResult.dates[0]).startOf('day');
						const shiftIso = (iso: string, offset: number) =>
							DateTime.fromISO(iso).plus({ days: offset }).toISO();
						for (const d of extraDates) {
							const offset = Math.round(
								DateTime.fromISO(d).startOf('day').diff(baseDay, 'days').days
							);
							const shifted = {
								...eventData,
								start: shiftIso(eventData.start, offset) ?? eventData.start,
								end: eventData.end ? (shiftIso(eventData.end, offset) ?? eventData.end) : eventData.end
							};
							try {
								const extra = await (
									await fetch('/api/events', {
										method: 'POST',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify(shifted)
									})
								).json();
								dispatch('create', { ...shifted, created: extra.event ?? null });
							} catch (e) {
								console.error('Create failed:', e);
							}
						}
					}
				} else {
					const j = await res.json().catch(() => ({}));
					submitError = j.error || 'Something went wrong. Try again.';
				}
			} catch (err) {
				console.error('Create failed:', err);
				// Network error — queue for retry when back online
				await queueMutation('/api/events', 'POST', eventData);
				submitError = '';
				dispatch('create', { ...eventData, created: null, offline: true });
				close();
			}
		}

		submitting = false;
	}

	function handleDelete() {
		if (!form.eventId) return;
		showDeleteConfirm = true;
	}

	function deleteThisOccurrence() {
		// Occurrence cancellation keeps the event row, so tasks survive.
		dispatch('delete', { id: form.masterId, scope: 'this', occurrenceDate: form.occurrenceDate });
		showDeleteConfirm = false;
	}

	function deleteWholeSeries() {
		dispatch('delete', { id: form.masterId, scope: 'all', occurrenceDate: form.occurrenceDate });
		showDeleteConfirm = false;
	}

	function deleteSingleEvent() {
		dispatch('delete', { id: form.eventId });
		showDeleteConfirm = false;
	}

	function clearAll() {
		form.reset();
		nlInput = '';
		nlpCollapsed = false;
		multiResults = null;
	}

	// After a successful create, reset the form so the user can type another.
	// The parent bumps `createCount` instead of closing the modal. Wait a beat
	// for the server response / DB write to fully settle before clearing.
	let prevCreateCount = 0;
	$: if (createCount !== prevCreateCount) {
		prevCreateCount = createCount;
		setTimeout(() => {
			clearAll();
			phraseReportable = false;
			phraseReported = false;
			lastParseResult = null;
			multiResults = null;
			entryType = 'event';
			taskTitle = '';
		}, 250);
	}
</script>

<style>
	.modal-scroll::-webkit-scrollbar {
		width: 5px;
	}
	.modal-scroll::-webkit-scrollbar-track {
		background: transparent;
	}
	.modal-scroll::-webkit-scrollbar-thumb {
		background: rgba(148, 163, 184, 0.5);
		border-radius: 3px;
	}
	.modal-scroll::-webkit-scrollbar-thumb:hover {
		background: rgba(100, 116, 139, 0.7);
	}
</style>

<svelte:window on:keydown={(e) => show && e.key === 'Escape' && close()} />

{#if show}
	<div
		class="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
		on:click={close}
		role="presentation"
	>
		<div
			class="flex max-h-[92dvh] w-full max-w-lg transform flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
			style="transform: translateY({dragOffset}px); transition: transform {dragTransition ? '150ms ease-out' : '0ms'}; touch-action: pan-y;"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
			use:trapFocusAction
		>
			<!-- Grab handle (mobile): bottom-sheet affordance + swipe-down-to-close zone -->
			<div
				class="flex shrink-0 touch-none cursor-grab justify-center pb-1 pt-2 active:cursor-grabbing sm:hidden"
				data-drag-handle
				on:touchstart={onDragStart}
				on:touchmove={onDragMove}
				on:touchend={onDragEnd}
				aria-hidden="true"
			>
				<span class="h-1.5 w-10 rounded-full bg-slate-200"></span>
			</div>
			<div class="sticky top-0 z-10 shrink-0 bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4">
				<div class="flex items-center justify-between">
					<div>
						<h2 id="modal-title" class="text-lg font-semibold text-white">
							{form.isEditMode ? 'Edit Event' : entryType === 'task' ? 'Add Task' : 'Create New Event'}
						</h2>
						{#if !form.isEditMode && entryType === 'event'}
							<p class="mt-0.5 text-xs text-primary-100">Type naturally, we'll fill in the rest</p>
						{:else if !form.isEditMode && entryType === 'task'}
							<p class="mt-0.5 text-xs text-primary-100">A completable item — no event needed</p>
						{/if}
					</div>
					<button
						type="button"
						on:click={close}
						class="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
						aria-label="Close modal"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<form id="event-form" on:submit={handleSubmit} class="min-h-0 flex-1 overflow-y-auto overscroll-contain modal-scroll">
				<div class="p-5 space-y-3">
					{#if !form.isEditMode}
						<div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="What are you adding?">
							<button
								type="button"
								on:click={() => (entryType = 'event')}
								class="rounded-md px-3 py-1.5 text-sm font-medium transition-all {entryType === 'event'
									? 'bg-white text-slate-900 shadow-sm'
									: 'text-slate-500 hover:text-slate-700'}"
							>
								Event
							</button>
							<button
								type="button"
								on:click={() => (entryType = 'task')}
								class="rounded-md px-3 py-1.5 text-sm font-medium transition-all {entryType === 'task'
									? 'bg-white text-slate-900 shadow-sm'
									: 'text-slate-500 hover:text-slate-700'}"
							>
								Task
							</button>
						</div>
					{/if}

					{#if entryType === 'event'}
					{#if !form.isEditMode}
						<div>
							<label for="nl-input" class="mb-1 block text-sm font-medium text-slate-700">Quick Add</label>
							<div class="mt-1 flex gap-2">
								<div class="relative flex-1">
									<input
										id="nl-input"
										type="text"
										bind:value={nlInput}
										on:input={onNlInputChange}
										placeholder="Lunch Friday at noon with John"
										class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
									/>
									{#if parsing}
										<div class="absolute right-3 top-1/2 -translate-y-1/2">
											<div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
										</div>
									{/if}
								</div>
								<button
									type="button"
									on:click={clearAll}
									class="rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
								>
									Clear
								</button>
							</div>
							{#if lastParseResult?.dates?.length > 1}
								<div class="mt-1 text-right text-xs font-medium text-primary-600">
									Creates {lastParseResult.dates.length} events — one per date
								</div>
							{/if}
							{#if multiResults && multiResults.length > 1}
								<div class="mt-2 rounded-lg border border-primary-200 bg-primary-50 p-3">
									<div class="mb-1 text-xs font-semibold text-primary-700">
										{multiResults.length} events detected
									</div>
									<ul class="mb-2 space-y-0.5">
										{#each multiResults as r}
											<li class="text-xs text-slate-600">
												{String(r.parsed.title || 'Untitled')} — {String(r.parsed.date || '')}{r.parsed.startTime
													? ` at ${r.parsed.startTime}`
													: ''}
											</li>
										{/each}
									</ul>
									<div class="flex gap-2">
										<button
											type="button"
											on:click={createAllEvents}
											disabled={submitting}
											class="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 transition-colors"
										>
											Create {multiResults.length} events
										</button>
										<button
											type="button"
											on:click={() => (multiResults = null)}
											class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
										>
											Just the first
										</button>
									</div>
								</div>
							{/if}
							{#if phraseReportable && nlInput.trim()}
								<div class="mt-1 text-right">
									{#if phraseReported}
										<span class="text-xs text-slate-400">Thanks — we'll teach the parser.</span>
									{:else}
										<button
											type="button"
											on:click={reportPhrase}
											disabled={reportingPhrase}
											class="text-xs text-slate-400 underline hover:text-slate-600 disabled:opacity-50"
										>
											{reportingPhrase ? 'Reporting…' : 'Parsed wrong? Report this phrase'}
										</button>
									{/if}
								</div>
							{/if}
						</div>
					{/if}

					<div>
						<label for="event-title" class="mb-1 block text-sm font-medium text-slate-700">
							Event Title {#if form.isDetected('title')}<span class="text-emerald-600 ml-1">✓</span>{/if}*
						</label>
						<input
							id="event-title"
							type="text"
							bind:value={form.title}
							on:input={() => form.markTouched('title')}
							placeholder="e.g., Family Dinner, Doctor Appointment"
							required
							class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
						/>
					</div>

					<div>
						<label for="event-desc" class="mb-1 block text-sm font-medium text-slate-700">Description</label>
						<textarea
							id="event-desc"
							bind:value={form.description}
							on:input={() => form.markTouched('description')}
							placeholder="Add details..."
							rows="2"
							class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
						></textarea>
					</div>

					{#if !form.isEditMode && !showMore}
						<button
							type="button"
							on:click={() => { showMore = true; nlpCollapsed = false; }}
							class="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
						>
							Show More
							<svg class="h-3.5 w-3.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
							</svg>
						</button>
					{/if}

					{#if form.isEditMode || showMore || (!nlpCollapsed && (form.isDetected('date') || form.isDetected('startTime') || form.isDetected('location') || form.isDetected('attendants')))}
						{#if showMore || form.isEditMode}
							<div class="flex items-center gap-3">
								<button
									type="button"
									on:click={() => { form.allDay = !form.allDay; form.markTouched('allDay'); }}
									class="flex-1 flex items-center justify-between rounded-full border px-4 py-2 text-sm font-medium transition-all {
										form.allDay
											? 'border-primary-300 bg-primary-50 text-primary-700'
											: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
									}"
								>
									<span>All day</span>
									<div class="relative w-8 h-4 rounded-full transition-colors {form.allDay ? 'bg-primary-500' : 'bg-slate-300'}">
										<div class="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform {form.allDay ? 'translate-x-4' : ''}"></div>
									</div>
								</button>
								<button
									type="button"
									on:click={() => { form.multiDay = !form.multiDay; form.markTouched('endDate'); }}
									class="flex-1 flex items-center justify-between rounded-full border px-4 py-2 text-sm font-medium transition-all {
										form.multiDay
											? 'border-primary-300 bg-primary-50 text-primary-700'
											: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
									}"
								>
									<span>Multi-day</span>
									<div class="relative w-8 h-4 rounded-full transition-colors {form.multiDay ? 'bg-primary-500' : 'bg-slate-300'}">
										<div class="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform {form.multiDay ? 'translate-x-4' : ''}"></div>
									</div>
								</button>
							</div>

							<!-- Repeat picker -->
							<div class="flex items-center gap-2">
								<select
									on:change={(e) => { form.recurrenceFrequency = e.currentTarget.value || null; }}
									value={form.recurrenceFrequency || ''}
									class="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none"
									aria-label="Repeat"
								>
									<option value="">Doesn't repeat</option>
									<option value="daily">Daily</option>
									<option value="weekly">Weekly</option>
									<option value="monthly">Monthly</option>
									<option value="yearly">Yearly</option>
								</select>
								{#if form.recurrenceFrequency}
									<span class="whitespace-nowrap text-sm text-slate-600">every</span>
									<input
										type="number"
										min="1"
										max="365"
										bind:value={form.recurrenceInterval}
										class="w-16 rounded-lg border border-slate-300 px-2 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none"
										aria-label="Repeat interval"
									/>
									<span class="text-sm text-slate-600">
										{form.recurrenceInterval === 1
											? { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[form.recurrenceFrequency]
											: { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' }[form.recurrenceFrequency]}
									</span>
								{/if}
							</div>

							<!-- Reminder picker -->
							<div class="flex items-center gap-2">
								<select
									bind:value={form.reminderSelectValue}
									class="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none"
									aria-label="Reminder"
								>
									<option value="">No reminder</option>
									<option value="15">15 min before</option>
									<option value="30">30 min before</option>
									<option value="60">1 hour before</option>
									<option value="120">2 hours before</option>
									<option value="1440">1 day before</option>
									{#if form.reminderMinutes != null && ![15, 30, 60, 120, 1440].includes(form.reminderMinutes)}
										<option value={form.reminderSelectValue}>
											{form.reminderMinutes} min before (from Quick Add)
										</option>
									{/if}
								</select>
							</div>

							{#if form.isRecurringOccurrence}
								<div class="rounded-lg border border-purple-200 bg-purple-50 p-3">
									<h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-purple-700">This event repeats — save changes for:</h4>
									<div class="flex gap-4 text-sm text-slate-700">
										<label class="flex cursor-pointer items-center gap-1.5">
											<input type="radio" bind:group={editScope} value="this" name="editScope" />
											This event only
										</label>
										<label class="flex cursor-pointer items-center gap-1.5">
											<input type="radio" bind:group={editScope} value="all" name="editScope" />
											All events in series
										</label>
									</div>
								</div>
							{/if}
						{/if}

						<div class="{form.multiDay ? 'grid grid-cols-2 gap-3' : ''}">
							<div>
								<label for="event-date" class="mb-1 block text-sm font-medium text-slate-700">
									Start Date
									{#if form.isDetected('date')}<span class="text-emerald-600 ml-1">✓</span>{/if}
								</label>
								<input
									id="event-date"
									type="date"
									bind:value={form.date}
									on:input={() => form.markTouched('date')}
									required
									class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
								/>
							</div>
							{#if form.multiDay}
								<div>
									<label for="event-end-date" class="mb-1 block text-sm font-medium text-slate-700">
										End Date
										{#if form.isDetected('endDate')}<span class="text-emerald-600 ml-1">✓</span>{/if}
									</label>
									<input
										id="event-end-date"
										type="date"
										bind:value={form.endDate}
										on:input={() => form.markTouched('endDate')}
										class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
									/>
								</div>
							{/if}
						</div>

						{#if !form.allDay}
							<div class="grid grid-cols-2 gap-3">
								<div>
									<label for="start-time" class="mb-1 block text-sm font-medium text-slate-700">
										Start Time
										{#if form.isDetected('startTime')}<span class="text-emerald-600 ml-1">✓</span>{/if}
									</label>
									<input
										id="start-time"
										type="time"
										bind:value={form.startTime}
										on:input={() => form.markTouched('startTime')}
										class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
									/>
								</div>
								<div>
									<label for="end-time" class="mb-1 block text-sm font-medium text-slate-700">
										End Time
										{#if form.isDetected('endTime')}<span class="text-emerald-600 ml-1">✓</span>{/if}
									</label>
								<input
									id="end-time"
									type="time"
									bind:value={form.endTime}
									on:input={() => form.markTouched('endTime')}
									class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
								/>
								{#if form.endBeforeStart}
									<p class="mt-1 text-xs text-red-600">End must be after start</p>
								{/if}
								</div>
							</div>
						{/if}

						<div>
							<div class="mb-1 text-sm font-medium text-slate-700">
								Location
								{#if form.isDetected('location')}<span class="text-emerald-600 ml-1">✓</span>{/if}
							</div>
							<LocationSearch bind:value={form.location} />
						</div>

						{#if form.isEditMode || showMore || (!nlpCollapsed && form.isDetected('attendants'))}
						<div>
							<div class="mb-1 text-sm font-medium text-slate-700">
								Attendees
								{#if form.isDetected('attendants')}<span class="text-emerald-600 ml-1">✓</span>{/if}
							</div>
							<AttendantPicker
								selected={form.attendants}
								familyMembers={familyMembers}
								recent={form.recentAttendants}
								selections={form.inviteTypes}
								onChangeInviteType={(value, type) => form.setInviteType(value, type)}
								on:toggle={(e) => form.toggleAttendant(e.detail)}
							/>
						</div>
					{/if}

						{#if (form.isEditMode || showMore) && calendarIds.length > 1}
							<div class="relative">
								<div class="mb-1 text-sm font-medium text-slate-700">Calendar</div>
								<button
									type="button"
									on:click={() => calendarDropdownOpen = !calendarDropdownOpen}
									on:blur={() => setTimeout(() => calendarDropdownOpen = false, 150)}
									class="flex w-full items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
								>
									<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
										style="background-color: {calColor.bg}; color: {calColor.text}">
										{selectedCal ? selectedCal.name.charAt(0).toUpperCase() : '?'}
									</span>
									<span class="flex-1 truncate text-left font-medium text-slate-700">{selectedCal?.name || 'Select calendar'}</span>
									<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
									</svg>
								</button>

								{#if calendarDropdownOpen}
									<div class="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-52 overflow-y-auto">
										<div class="p-1">
											{#each calendarIds as cal}
												{@const color = cal.color ? { bg: cal.color, text: '#ffffff' } : getContactColor(cal.name)}
												{@const selected = form.selectedCalendarId === cal.id}
												<button
													type="button"
													on:click={() => { form.selectedCalendarId = cal.id; form.markTouched('calendar'); calendarDropdownOpen = false; }}
													class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50 {selected ? 'bg-primary-50' : ''}"
												>
													<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
														style="background-color: {color.bg}; color: {color.text}">
														{cal.name.charAt(0).toUpperCase()}
													</span>
													<span class="flex-1 truncate font-medium text-slate-700">{cal.name}</span>
													{#if selected}
														<svg class="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
															<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
														</svg>
													{/if}
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/if}
					{/if}
					{:else}
						<div>
							<label for="task-title" class="mb-1 block text-sm font-medium text-slate-700">Task Title *</label>
							<input
								id="task-title"
								type="text"
								bind:value={taskTitle}
								placeholder="e.g., Pay water bill"
								required
								class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
							/>
						</div>

						<div>
							<label for="task-due-date" class="mb-1 block text-sm font-medium text-slate-700">Due Date</label>
							<input
								id="task-due-date"
								type="date"
								bind:value={taskDueDate}
								class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
							/>
							<p class="mt-1 text-xs text-slate-400">Optional — shows as a dashed chip on its due day.</p>
						</div>
					{/if}
				</div>

				{#if !form.isEditMode && showMore && entryType === 'event'}
					<div class="px-5 pb-3">
						<button
							type="button"
							on:click={() => { showMore = false; nlpCollapsed = true; }}
							class="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
						>
							Show Less
							<svg class="h-3.5 w-3.5 transition-transform rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
							</svg>
						</button>
					</div>
				{/if}

				{#if form.isEditMode && rsvpData.length > 0}
					<div class="border-t border-slate-100 p-5">
						<h3 class="mb-2 text-sm font-semibold text-slate-700">RSVP Status</h3>
						{#if rsvpData.filter(r => r.status === 'going').length > 0}
							<div class="mb-2">
								<span class="text-xs font-medium text-emerald-700">Going ({rsvpData.filter(r => r.status === 'going').length}):</span>
								<div class="mt-1 flex flex-wrap gap-1">
									{#each rsvpData.filter(r => r.status === 'going') as rsvp}
										<span class="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{rsvp.firstName || rsvp.userId}</span>
									{/each}
								</div>
							</div>
						{/if}
						{#if rsvpData.filter(r => r.status === 'maybe').length > 0}
							<div class="mb-2">
								<span class="text-xs font-medium text-amber-700">Maybe ({rsvpData.filter(r => r.status === 'maybe').length}):</span>
								<div class="mt-1 flex flex-wrap gap-1">
									{#each rsvpData.filter(r => r.status === 'maybe') as rsvp}
										<span class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{rsvp.firstName || rsvp.userId}</span>
									{/each}
								</div>
							</div>
						{/if}
						{#if rsvpData.filter(r => r.status === 'declined' || r.status === 'not_going').length > 0}
							<div class="mb-2">
								<span class="text-xs font-medium text-red-700">Not Going ({rsvpData.filter(r => r.status === 'declined' || r.status === 'not_going').length}):</span>
								<div class="mt-1 flex flex-wrap gap-1">
									{#each rsvpData.filter(r => r.status === 'declined' || r.status === 'not_going') as rsvp}
										<span class="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{rsvp.firstName || rsvp.userId}</span>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}

				{#if entryType === 'event'}
					<ChecklistSection
						eventId={eventIdForTasks}
						bind:pendingTitles={pendingTaskTitles}
						bind:attachedCount={attachedTaskCount}
					/>
				{/if}

				{#if showDeleteConfirm}
				<div class="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 p-3">
					<p class="text-sm font-medium text-red-700">Delete this event?</p>
					{#if attachedTaskCount > 0}
						<p class="mt-0.5 text-xs text-red-600">⚠️ {attachedTaskCount} attached task(s) will also be deleted.</p>
					{/if}
					<div class="mt-2 flex flex-wrap items-center gap-2">
						{#if form.isRecurringOccurrence}
							<button
								type="button"
								on:click={deleteThisOccurrence}
								class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
							>
								This occurrence
							</button>
							<button
								type="button"
								on:click={deleteWholeSeries}
								class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
							>
								Whole series
							</button>
						{:else}
							<button
								type="button"
								on:click={deleteSingleEvent}
								class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
							>
								Delete
							</button>
						{/if}
						<button
							type="button"
							on:click={() => (showDeleteConfirm = false)}
							class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
						>
							Cancel
						</button>
					</div>
				</div>
			{/if}

			{#if submitError}
				<div class="px-5 pb-3">
					<p role="alert" class="text-sm text-red-600">{submitError}</p>
				</div>
			{/if}

			</form>

			<!-- Sticky action bar (outside the scroll region; stays visible with keyboard open) -->
			<div
				class="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-5 py-3"
				style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 1.25rem)"
			>
				{#if form.isEditMode}
					<button type="button" on:click={handleDelete} class="mr-auto rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">Delete</button>
				{/if}
				<button type="button" on:click={close} class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
				{#if !form.isEditMode && entryType === 'event'}
					<button type="button" on:click={clearAll} class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Clear</button>
				{/if}
				<button
					type="submit"
					form="event-form"
					class="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					disabled={(entryType === 'task' ? !taskTitle.trim() : !form.title || !form.date || form.endBeforeStart) || submitting}
				>
					{#if submitting}
						<div class="flex items-center gap-2">
							<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
							{form.isEditMode ? 'Updating...' : entryType === 'task' ? 'Adding...' : 'Creating...'}
						</div>
					{:else}
						{form.isEditMode ? 'Update' : entryType === 'task' ? 'Add Task' : 'Create'}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
