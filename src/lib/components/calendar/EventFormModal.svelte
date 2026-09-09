<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { DateTime } from 'luxon';
	import type { Event } from '$lib/types';
	import { getContactColor } from '$lib/utils/contactColors';
	import { trapFocusAction } from '$lib/utils/focusTrap';
	import LocationSearch from '$lib/components/LocationSearch.svelte';
	import TaskQuickAddHelp from '$lib/components/TaskQuickAddHelp.svelte';
	import { submitTaskQuickAdd } from '$lib/client/taskSubmit';
	import { createEventForm } from './EventFormModel.svelte';
	import type { NlpFormInput } from './EventFormModel.svelte';
	import ChecklistSection from './ChecklistSection.svelte';
	import AttendantPicker from './AttendantPicker.svelte';
	import EventDateTimeFields from './EventDateTimeFields.svelte';
	import EventTitleFields from './EventTitleFields.svelte';
	import EventQuickAdd from './EventQuickAdd.svelte';
	import EventMetaFields from './EventMetaFields.svelte';
	import EventDeleteConfirm from './EventDeleteConfirm.svelte';
	import EventActionBar from './EventActionBar.svelte';
	import EventRsvpList from './EventRsvpList.svelte';
	import EventTaskFields from './EventTaskFields.svelte';
	import { queueMutation } from '$lib/utils/offline';

	export let show = false;
	export let onClose: () => void = () => {};
	export let event: Event | null = null;
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	export let familyMembers: {
		userId: string;
		firstName?: string;
		lastName?: string;
		email: string;
	}[] = [];
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
	// Task mode (issue 021): the viewer's family id, so @family can scope a
	// task to the family (null when the user isn't in one).
	export let familyId: string | null = null;
	export let initialDate: string | undefined = undefined;
	export let initialTitle: string | undefined = undefined;
	export let initialQuickAdd: string | undefined = undefined;
	export let initialTime: string | undefined = undefined;
	export let initialEndTime: string | undefined = undefined;
	// Explicit create-mode default; falls back to the saved setting.
	export let defaultCalendarId: string | null = null;
	export let createCount = 0;

	const dispatch = createEventDispatcher();

	// Mobile bottom-sheet swipe state (mirrors EventModal).
	let dragging = false;
	let dragStartY = 0;
	let dragOffset = 0;
	let dragTransition = false;

	let nlInput = '';
	let showMore = !!(initialDate || initialTime || initialEndTime); // Set when the user clicks "Show Less": suppresses the auto-reveal of
	// parser-detected fields until a fresh parse re-detects them (or the user
	// clicks "Show More" again).
	let nlpCollapsed = false;
	let parsing = false;
	/** Subtle inline note when the quick-add parser call itself fails (not a parse miss). */
	let parseError = false;
	let reportingPhrase = false;
	let phraseReported = false;
	let phraseReportable = false;
	let lastParseResult: NlpFormInput | null = null;
	let multiResults: Array<{ parsed: NlpFormInput; confidence: number }> | null = null;
	let parseTimeout: ReturnType<typeof setTimeout>;
	let submitting = false;
	let submitError = '';
	let calendarDropdownOpen = false;
	let entryType: 'event' | 'task' = 'event';
	let taskTitle = '';
	let taskDueDate = initialDate || DateTime.now().toISODate() || '';
	// Task mode scoping (issue 021): explicit picker + parser override.
	let taskVisibility: 'public' | 'private' = 'public';
	let taskError = '';

	/** Family roster the task quick-add can assign to (names required). */
	$: taskRoster = familyMembers.flatMap((m) =>
		m.userId && m.firstName && m.lastName
			? [{ userId: m.userId, firstName: m.firstName, lastName: m.lastName }]
			: []
	);

	let form: ReturnType<typeof createEventForm>;

	$: form = createEventForm({
		calendars: calendarIds,
		familyMembers,
		defaultCalendarId: defaultCalendarId ?? userSettings?.defaultCalendarId,
		initialDate,
		initialEvent: event
			? {
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
					recurrenceByDay: event.recurrenceByDay ?? null,
					recurrenceCount: event.recurrenceCount ?? null,
					recurrenceUntil: event.recurrenceUntil ?? null,
					reminderMinutes: event.reminderMinutes ?? null,
					masterId: event.masterId,
					occurrenceDate: event.occurrenceDate
				}
			: undefined
	});

	// Pre-populate the attendee chips + required/optional roles when the form
	// opens for editing: reuse rsvpData when the page already loaded it, else
	// fetch the attendance once. The edit modal mounts fresh per event, so
	// onMount is safe (legacy component — no runes).
	onMount(() => {
		const id = form.eventId;
		if (!form.isEditMode || !id) return;
		if (rsvpData && rsvpData.length > 0) {
			form.prefillInvites(rsvpData);
			return;
		}
		// Occurrence display ids are composite (`master~iso`); the RSVP route
		// only knows the real master id, so resolve it the way the PUT does.
		const target = form.masterId || id;
		let cancelled = false;
		fetch(`/api/events/${target}/rsvp`)
			.then((r) => (r.ok ? r.json() : null))
			.then((body) => {
				if (cancelled || !body) return;
				const rows = Array.isArray(body) ? body : body.attendance;
				// Never prefill from an empty/failed response: an empty list would
				// be re-sent as "no invites" and wipe the real ones.
				if (Array.isArray(rows) && rows.length > 0) form.prefillInvites(rows);
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
	// Marked touched so Quick Add never clobbers a picked range's times.
	let initialTimeApplied = false;
	$: if (show && !form.isEditMode && initialTime && !initialTimeApplied) {
		if (!form.startTime) {
			form.startTime = initialTime;
			form.allDay = false;
			form.markTouched('startTime');
		}
		initialTimeApplied = true;
	}
	$: if (!show) initialTimeApplied = false;

	// Seed the end time from a picked range once per open (create mode only).
	let initialEndTimeApplied = false;
	$: if (show && !form.isEditMode && initialEndTime && !initialEndTimeApplied) {
		if (!form.endTime) {
			form.endTime = initialEndTime;
			form.markTouched('endTime');
		}
		initialEndTimeApplied = true;
	}
	$: if (!show) initialEndTimeApplied = false;

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

	$: hasDetectedFields =
		form.isDetected('date') ||
		form.isDetected('startTime') ||
		form.isDetected('location') ||
		form.isDetected('attendants');
	$: if (hasDetectedFields && !showMore && !form.isEditMode) {
		showMore = true;
	}

	$: selectedCal = calendarIds.find((c) => c.id === form.selectedCalendarId) || null;
	$: calColor = selectedCal
		? selectedCal.color
			? { bg: selectedCal.color, text: '#ffffff' }
			: getContactColor(selectedCal.name)
		: { bg: '#F1F5F9', text: '#64748B' };

	async function parseNlInput() {
		if (!nlInput.trim()) return;

		parsing = true;
		parseError = false;
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
				const first = result.results?.length > 1 ? result.results[0].parsed : result.parsed;
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
								(c) => c.name.toLowerCase().includes(want) || want.includes(c.name.toLowerCase())
							);
						if (match) form.selectedCalendarId = match.id;
					}
					// A fresh parse re-reveals previously collapsed detected fields.
					nlpCollapsed = false;
				}
			} else {
				parseError = true;
			}
		} catch (error) {
			console.error('Parse error:', error);
			parseError = true;
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
		parseError = false;
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
		// Shared with the tasks page card (issue 021 parity) — same parser,
		// guards, and POST shape. Bare recurrences now also get a cursor
		// here (the modal previously sent null when the picker was clear).
		taskError = '';
		submitting = true;
		try {
			const result = await submitTaskQuickAdd({
				title,
				dueDateFallback: taskDueDate || null,
				visibilityFallback: taskVisibility,
				familyId,
				members: taskRoster
			});
			if (!result.ok) {
				taskError = result.error;
				return;
			}
			dispatch('createTask', result.task);
			taskTitle = '';
			taskVisibility = 'public';
			taskError = '';
			taskDueDate = initialDate || DateTime.now().toISODate() || '';
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
				tmp.applyNlpResult(r.parsed);
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
					const parsedDates = lastParseResult?.dates;
					const extraDates =
						parsedDates && parsedDates.length > 1 && parsedDates[0] ? parsedDates.slice(1) : [];
					if (extraDates.length > 0 && parsedDates?.[0] && eventData.start) {
						const baseDay = DateTime.fromISO(parsedDates[0]).startOf('day');
						const shiftIso = (iso: string, offset: number) =>
							DateTime.fromISO(iso).plus({ days: offset }).toISO();
						for (const d of extraDates) {
							const offset = Math.round(
								DateTime.fromISO(d).startOf('day').diff(baseDay, 'days').days
							);
							const shifted = {
								...eventData,
								start: shiftIso(eventData.start, offset) ?? eventData.start,
								end: eventData.end
									? (shiftIso(eventData.end, offset) ?? eventData.end)
									: eventData.end
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
		parseError = false;
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
			taskVisibility = 'public';
			taskError = '';
		}, 250);
	}
</script>

<svelte:window on:keydown={(e) => show && e.key === 'Escape' && close()} />

{#if show}
	<div
		class="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
		on:click={close}
		role="presentation"
	>
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div
			class="flex max-h-[92dvh] w-full max-w-lg transform flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
			style="transform: translateY({dragOffset}px); transition: transform {dragTransition
				? '150ms ease-out'
				: '0ms'}; touch-action: pan-y;"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
			use:trapFocusAction
		>
			<!-- Grab handle (mobile): bottom-sheet affordance + swipe-down-to-close zone -->
			<div
				class="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2 active:cursor-grabbing sm:hidden"
				data-drag-handle
				on:touchstart={onDragStart}
				on:touchmove={onDragMove}
				on:touchend={onDragEnd}
				aria-hidden="true"
			>
				<span class="h-1.5 w-10 rounded-full bg-slate-200"></span>
			</div>
			<div
				class="sticky top-0 z-10 shrink-0 bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4"
			>
				<div class="flex items-center justify-between">
					<div>
						<h2 id="modal-title" class="text-lg font-semibold text-white">
							{form.isEditMode
								? 'Edit Event'
								: entryType === 'task'
									? 'Add Task'
									: 'Create New Event'}
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
						<svg
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<form
				id="event-form"
				on:submit={handleSubmit}
				class="modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain"
			>
				<div class="space-y-3 p-5">
					{#if !form.isEditMode}
						<div
							class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1"
							role="tablist"
							aria-label="What are you adding?"
						>
							<button
								type="button"
								on:click={() => (entryType = 'event')}
								class="rounded-md px-3 py-1.5 text-sm font-medium transition-all {entryType ===
								'event'
									? 'bg-white text-slate-900 shadow-sm'
									: 'text-slate-500 hover:text-slate-700'}"
							>
								Event
							</button>
							<button
								type="button"
								on:click={() => (entryType = 'task')}
								class="rounded-md px-3 py-1.5 text-sm font-medium transition-all {entryType ===
								'task'
									? 'bg-white text-slate-900 shadow-sm'
									: 'text-slate-500 hover:text-slate-700'}"
							>
								Task
							</button>
						</div>
					{/if}

					{#if entryType === 'event'}
						{#if !form.isEditMode}
							<EventQuickAdd
								bind:nlInput
								{parsing}
								{parseError}
								bind:multiResults
								{submitting}
								{lastParseResult}
								{phraseReportable}
								{phraseReported}
								{reportingPhrase}
								{onNlInputChange}
								onClear={clearAll}
								onCreateAll={createAllEvents}
								onDismissMulti={() => (multiResults = null)}
								onReportPhrase={reportPhrase}
							/>
						{/if}

						<EventTitleFields
							{form}
							{showMore}
							onShowMore={() => {
								showMore = true;
								nlpCollapsed = false;
							}}
						/>

						{#if form.isEditMode || showMore || (!nlpCollapsed && (form.isDetected('date') || form.isDetected('startTime') || form.isDetected('location') || form.isDetected('attendants')))}
							{#if showMore || form.isEditMode}
								<EventDateTimeFields {form} bind:editScope />
							{/if}

							<EventMetaFields
								{form}
								{familyMembers}
								{calendarIds}
								{showMore}
								showAttendees={form.isEditMode ||
									showMore ||
									(!nlpCollapsed && form.isDetected('attendants'))}
							/>
						{/if}
					{:else}
						<EventTaskFields bind:taskTitle bind:taskVisibility bind:taskDueDate {taskError} />
					{/if}
				</div>

				{#if !form.isEditMode && showMore && entryType === 'event'}
					<div class="px-5 pb-3">
						<button
							type="button"
							on:click={() => {
								showMore = false;
								nlpCollapsed = true;
							}}
							class="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
						>
							Show Less
							<svg
								class="h-3.5 w-3.5 rotate-180 transition-transform"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
							</svg>
						</button>
					</div>
				{/if}

				{#if form.isEditMode}
					<EventRsvpList {rsvpData} />
				{/if}

				{#if entryType === 'event'}
					<ChecklistSection
						eventId={eventIdForTasks}
						bind:pendingTitles={pendingTaskTitles}
						bind:attachedCount={attachedTaskCount}
					/>
				{/if}

				{#if showDeleteConfirm}
					<EventDeleteConfirm
						isRecurringOccurrence={form.isRecurringOccurrence}
						{attachedTaskCount}
						onDeleteOccurrence={deleteThisOccurrence}
						onDeleteSeries={deleteWholeSeries}
						onDeleteSingle={deleteSingleEvent}
						onCancel={() => (showDeleteConfirm = false)}
					/>
				{/if}

				{#if submitError}
					<div class="px-5 pb-3">
						<p role="alert" class="text-sm text-red-600">{submitError}</p>
					</div>
				{/if}
			</form>

			<!-- Sticky action bar (outside the scroll region; stays visible with keyboard open) -->
			<EventActionBar
				isEditMode={form.isEditMode}
				{entryType}
				{submitting}
				canSubmit={entryType === 'task'
					? !!taskTitle.trim()
					: !!form.title && !!form.date && !form.endBeforeStart && !form.endDateBeforeStart}
				submitBlockedReason={form.endBeforeStart || form.endDateBeforeStart
					? 'End must be after start'
					: undefined}
				onDelete={handleDelete}
				onClose={close}
				onClear={clearAll}
			/>
		</div>
	</div>
{/if}

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
