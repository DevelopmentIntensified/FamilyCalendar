<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { DateTime } from 'luxon';
	import type { Event } from '$lib/types';
	import { getContactColor } from '$lib/utils/contactColors';
	import LocationSearch from '$lib/components/LocationSearch.svelte';
	import { createEventForm } from './EventFormModel.svelte';
	import ChecklistSection from './ChecklistSection.svelte';
	import AttendantPicker from './AttendantPicker.svelte';

	export let show = false;
	export let event: Event | null = null;
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	export let familyMembers: { userId: string; firstName?: string; lastName?: string; email: string }[] = [];
	export let rsvpData: { userId: string; status: string; firstName?: string; lastName?: string }[] = [];
	export let userSettings: {
		defaultCalendarId?: string | null;
		autoParseEventDetails?: boolean | null;
		useCloudAI?: boolean | null;
	} | null = null;
	export let initialDate: string | undefined = undefined;

	const dispatch = createEventDispatcher();

	let nlInput = '';
	let showMore = false;
	let parsing = false;
	let reportingPhrase = false;
	let phraseReported = false;
	let phraseReportable = false;
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
			masterId: event.masterId,
			occurrenceDate: event.occurrenceDate
		} : undefined
	});

	let editScope: 'this' | 'all' = 'this';
	let showDeleteConfirm = false;

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
				if (result.parsed) {
					form.applyNlpResult(result.parsed);
					phraseReportable = true;
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
		try {
			const res = await fetch('/api/report-phrase', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phrase: nlInput.trim(), source: 'event_parse' })
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
		dispatch('close');
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
				const targetId = isOccurrence ? form.masterId : form.eventId;
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
				} else {
					const j = await res.json().catch(() => ({}));
					submitError = j.error || 'Something went wrong. Try again.';
				}
			} catch (err) {
				console.error('Create failed:', err);
				submitError = 'Network error. Check your connection and try again.';
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
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
		on:click={close}
		role="presentation"
	>
		<div
			class="w-full max-w-lg transform rounded-xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto modal-scroll"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
		>
			<div class="sticky top-0 z-10 bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4">
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

			<form on:submit={handleSubmit}>
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
							on:click={() => showMore = true}
							class="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
						>
							Show More
							<svg class="h-3.5 w-3.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
							</svg>
						</button>
					{/if}

					{#if form.isEditMode || showMore || form.isDetected('date') || form.isDetected('startTime') || form.isDetected('location') || form.isDetected('attendants')}
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

						{#if form.isEditMode || showMore || form.isDetected('attendants')}
						<div>
							<div class="mb-1 text-sm font-medium text-slate-700">
								Attendees
								{#if form.isDetected('attendants')}<span class="text-emerald-600 ml-1">✓</span>{/if}
							</div>
							<AttendantPicker
								selected={form.attendants}
								familyMembers={familyMembers}
								recent={form.recentAttendants}
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
							on:click={() => showMore = false}
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

			<div class="flex items-center justify-end gap-2 border-t border-slate-100 p-5">
					{#if form.isEditMode}
						<button type="button" on:click={handleDelete} class="mr-auto rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">Delete</button>
					{/if}
				<button type="button" on:click={close} class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
				{#if !form.isEditMode && entryType === 'event'}
					<button type="button" on:click={clearAll} class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Clear</button>
				{/if}
				<button
					type="submit"
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
			</form>
		</div>
	</div>
{/if}
