<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { DateTime } from 'luxon';
	import type { Event } from '$lib/types';
	import LocationSearch from '$lib/components/LocationSearch.svelte';
	import { getContactColor, getInitials } from '$lib/utils/contactColors';
	import { createEventForm } from './EventFormModel.svelte';

	export let show = false;
	export let event: Event | null = null;
	export let calendarIds: { id: string; name: string; color?: string }[] = [];
	export let familyMembers: { userId: string; firstName: string; lastName: string; email: string }[] = [];
	export let rsvpData: { userId: string; status: string; firstName?: string; lastName?: string }[] = [];
	export let userSettings: {
		defaultCalendarId?: string | null;
		autoParseEventDetails?: boolean;
		useCloudAI?: boolean;
	} | null = null;
	export let initialDate: string | undefined = undefined;

	const dispatch = createEventDispatcher();

	let nlInput = '';
	let showMore = false;
	let parsing = false;
	let parseTimeout: ReturnType<typeof setTimeout>;
	let submitting = false;
	let contactSearch = '';
	let attendantDropdownOpen = false;
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

	// Event checklist: real rows when editing, pending titles when creating.
	let eventTasks: any[] = [];
	let pendingTaskTitles: string[] = [];
	let showChecklistInput = false;
	let checklistTitle = '';
	let checklistBusy = false;
	let tasksLoadedFor: string | null = null;

	$: eventIdForTasks = form?.isEditMode ? form.masterId || form.eventId : null;
	$: if (eventIdForTasks && eventIdForTasks !== tasksLoadedFor) {
		tasksLoadedFor = eventIdForTasks;
		fetchChecklistTasks(eventIdForTasks);
	}

	async function fetchChecklistTasks(id: string) {
		try {
			const res = await fetch(`/api/tasks?eventId=${id}`);
			if (res.ok) {
				eventTasks = (await res.json()).tasks ?? [];
			}
		} catch (e) {
			console.error('Failed to load event tasks:', e);
		}
	}

	function addChecklistItem() {
		const title = checklistTitle.trim();
		if (!title || checklistBusy) return;
		if (!form.isEditMode) {
			pendingTaskTitles = [...pendingTaskTitles, title];
			checklistTitle = '';
			return;
		}
		createChecklistRow(title);
	}

	async function createChecklistRow(title: string) {
		checklistBusy = true;
		try {
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title, eventId: eventIdForTasks })
			});
			if (res.ok) {
				const json = await res.json();
				eventTasks = [...eventTasks, json.task];
				checklistTitle = '';
			}
		} finally {
			checklistBusy = false;
		}
	}

	function removePendingItem(index: number) {
		pendingTaskTitles = pendingTaskTitles.filter((_, i) => i !== index);
	}

	async function toggleChecklistItem(task: any) {
		if (checklistBusy) return;
		checklistBusy = true;
		try {
			const res = await fetch(`/api/tasks/${task.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toggleComplete: true })
			});
			if (res.ok) {
				const json = await res.json();
				eventTasks = eventTasks.map(t => (t.id === task.id ? json.task : t));
			}
		} finally {
			checklistBusy = false;
		}
	}

	async function deleteChecklistItem(taskId: string) {
		if (checklistBusy) return;
		checklistBusy = true;
		try {
			const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
			if (res.ok) {
				eventTasks = eventTasks.filter(t => t.id !== taskId);
			}
		} finally {
			checklistBusy = false;
		}
	}

	$: dedupedFamilyMembers = dedupeFamilyMembers(familyMembers);

	$: filteredFamilyMembers = dedupedFamilyMembers.filter(m => {
		if (!contactSearch.trim()) return true;
		const search = contactSearch.toLowerCase();
		return (
			m.firstName?.toLowerCase().includes(search) ||
			m.lastName?.toLowerCase().includes(search) ||
			m.email?.toLowerCase().includes(search)
		);
	});

	$: filteredRecentAttendants = form.recentAttendants.filter((att: string) => {
		if (!contactSearch.trim()) return true;
		return att.toLowerCase().includes(contactSearch.toLowerCase());
	});

	$: hasDetectedFields = form.isDetected('date') || form.isDetected('startTime') || form.isDetected('location') || form.isDetected('attendants');
	$: if (hasDetectedFields && !showMore && !form.isEditMode) {
		showMore = true;
	}

	$: selectedCal = calendarIds.find(c => c.id === form.selectedCalendarId) || null;
	$: calColor = selectedCal
		? (selectedCal.color ? { bg: selectedCal.color, text: '#ffffff' } : getContactColor(selectedCal.name))
		: { bg: '#F1F5F9', text: '#64748B' };

	onMount(() => {
		try {
			const stored = localStorage.getItem('recent_attendants');
			if (stored) {
				form.recentAttendants = JSON.parse(stored);
			}
		} catch (e) { /* ignore */ }
	});

	function dedupeFamilyMembers(members: typeof familyMembers) {
		const seen = new Set<string>();
		return members.filter(m => {
			if (seen.has(m.userId)) return false;
			seen.add(m.userId);
			return true;
		});
	}

	async function parseNlInput() {
		if (!nlInput.trim()) return;

		parsing = true;
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
				}
			}
		} catch (error) {
			console.error('Parse error:', error);
		} finally {
			parsing = false;
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

	function selectAttendantFromDropdown(value: string) {
		if (!form.attendants.includes(value)) {
			form.toggleAttendant(value);
		}
		contactSearch = '';
		attendantDropdownOpen = false;
	}

	function addCustomAttendant() {
		if (contactSearch.trim() && !form.attendants.includes(contactSearch.trim())) {
			form.toggleAttendant(contactSearch.trim());
			contactSearch = '';
			attendantDropdownOpen = false;
		}
	}

	function close() {
		show = false;
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
				}
			} catch (err) {
				console.error('Update failed:', err);
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
				}
			} catch (err) {
				console.error('Create failed:', err);
			}
		}

		submitting = false;
	}

	function handleDelete() {
		if (!form.eventId) return;

		const attachedCount = eventTasks.length;
		let scope: 'this' | 'all' | null = null;

		if (form.isRecurringOccurrence) {
			scope = confirm(
				'OK = delete just this occurrence\nCancel = delete the whole series'
			)
				? 'this'
				: 'all';
			if (scope === 'this') {
				// Occurrence cancellation keeps the event row, so tasks survive.
				dispatch('delete', { id: form.masterId, scope, occurrenceDate: form.occurrenceDate });
				return;
			}
		}

		const taskWarning = attachedCount > 0 ? `\n\n⚠️ ${attachedCount} attached task(s) will also be deleted.` : '';
		if (!confirm(`Delete this event?${taskWarning}`)) return;

		if (form.isRecurringOccurrence) {
			dispatch('delete', { id: form.masterId, scope: 'all', occurrenceDate: form.occurrenceDate });
		} else {
			dispatch('delete', { id: form.eventId });
		}
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
							<div class="relative">
								<div class="mb-1 text-sm font-medium text-slate-700">
									Attendees
									{#if form.isDetected('attendants')}<span class="text-emerald-600 ml-1">✓</span>{/if}
								</div>

								{#if form.attendants.length > 0}
									<div class="flex flex-wrap gap-2 mb-2">
										{#each form.attendants as att}
											{@const member = familyMembers.find(m => m.userId === att)}
											{@const color = getContactColor(att)}
											{@const initials = member ? getInitials(member.firstName, member.lastName) : getInitials(att)}
											{@const displayName = member ? `${member.firstName} ${member.lastName}` : att}
											<span class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 pr-3 text-sm">
												<span class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold"
													style="background-color: {color.bg}; color: {color.text}">
													{initials}
												</span>
												<span class="text-slate-700">{displayName}</span>
												<button type="button" on:click={() => form.toggleAttendant(att)} class="text-slate-400 hover:text-slate-600" aria-label="Remove {att}">
													<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
														<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
													</svg>
												</button>
											</span>
										{/each}
									</div>
								{/if}

								<div class="relative">
									<input
										type="text"
										bind:value={contactSearch}
										on:focus={() => attendantDropdownOpen = true}
										on:blur={() => setTimeout(() => attendantDropdownOpen = false, 150)}
										placeholder="Search family or type a name..."
										class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
									/>
									{#if attendantDropdownOpen && (filteredFamilyMembers.length > 0 || filteredRecentAttendants.length > 0 || contactSearch.trim())}
										<div class="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-52 overflow-y-auto">
											{#if filteredFamilyMembers.length > 0}
												<div class="p-1">
													{#each filteredFamilyMembers as member}
														{@const color = getContactColor(member.firstName + member.lastName)}
														{@const selected = form.attendants.includes(member.userId)}
														<button
															type="button"
															on:click={() => selectAttendantFromDropdown(member.userId)}
															class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50 {selected ? 'bg-primary-50' : ''}"
														>
															<div class="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
																style="background-color: {color.bg}; color: {color.text}">
																{member.firstName?.charAt(0)}{member.lastName?.charAt(0)}
																{#if selected}
																	<div class="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white">
																		<svg class="h-2 w-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
																			<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
																		</svg>
																	</div>
																{/if}
															</div>
															<div class="flex-1 min-w-0">
																<p class="truncate text-sm font-medium text-slate-700">{member.firstName} {member.lastName}</p>
															</div>
														</button>
													{/each}
												</div>
											{/if}

											{#if filteredRecentAttendants.length > 0}
												<div class="border-t border-slate-100 p-1">
													<div class="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recent</div>
													{#each filteredRecentAttendants as att}
														{@const color = getContactColor(att)}
														{@const selected = form.attendants.includes(att)}
														<button
															type="button"
															on:click={() => selectAttendantFromDropdown(att)}
															class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50 {selected ? 'bg-primary-50' : ''}"
														>
															<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
																style="background-color: {color.bg}; color: {color.text}">
																{att.charAt(0).toUpperCase()}
															</span>
															<span class="truncate text-sm text-slate-700">{att}</span>
														</button>
													{/each}
												</div>
											{/if}

											{#if contactSearch.trim() && !filteredFamilyMembers.length && !filteredRecentAttendants.length}
												<button
													type="button"
													on:click={addCustomAttendant}
													class="w-full rounded-lg border-2 border-dashed border-slate-200 m-1 py-2 text-sm text-slate-500 transition-all hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
												>
													Add "{contactSearch.trim()}"
												</button>
											{/if}
										</div>
									{/if}
								</div>
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
				<!-- Checklist -->
				<div class="border-t border-slate-100 px-5 py-3">
					<div class="mb-1 flex items-center justify-between">
						<h4 class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
							Checklist{#if eventTasks.length > 0} · {eventTasks.filter(t => t.completedAt).length}/{eventTasks.length}{/if}
						</h4>
						{#if !showChecklistInput}
							<button
								type="button"
								class="rounded px-1.5 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary-600"
								on:click={() => (showChecklistInput = true)}
							>
								+ Add task
							</button>
						{/if}
					</div>

					<ul class="space-y-0.5">
						{#each pendingTaskTitles as title, i (i)}
							<li class="flex items-center gap-2 rounded px-1 py-1">
								<span class="h-4 w-4 shrink-0 rounded-full border border-dashed border-slate-300"></span>
								<span class="min-w-0 flex-1 truncate text-sm text-slate-700">{title}</span>
								<button
									type="button"
									class="shrink-0 rounded p-0.5 text-slate-300 hover:text-red-500"
									aria-label="Remove task"
									on:click={() => removePendingItem(i)}
								>
									<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</li>
						{/each}
						{#each eventTasks as task (task.id)}
							<li class="group flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
								<button
									type="button"
									disabled={checklistBusy}
									on:click={() => toggleChecklistItem(task)}
									class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border {task.completedAt
										? 'border-primary-500 bg-primary-500 text-white'
										: 'border-slate-300 hover:border-primary-400'}"
									aria-label={task.completedAt ? 'Mark incomplete' : 'Complete'}
								>
									{#if task.completedAt}
										<svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
									{/if}
								</button>
								<span class="min-w-0 flex-1 truncate text-sm {task.completedAt ? 'text-slate-400 line-through' : 'text-slate-700'}">
									{task.title}
								</span>
								<button
									type="button"
									disabled={checklistBusy}
									on:click={() => deleteChecklistItem(task.id)}
									class="shrink-0 rounded p-0.5 text-slate-300 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100"
									aria-label="Remove task"
								>
									<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</li>
						{/each}
					</ul>

					{#if showChecklistInput}
						<div class="mt-1.5 flex gap-1.5">
							<input
								type="text"
								bind:value={checklistTitle}
								placeholder="Add a task..."
								on:keydown={(e) => e.key === 'Enter' && addChecklistItem()}
								class="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
							/>
							<button
								type="button"
								disabled={checklistBusy || !checklistTitle.trim()}
								on:click={addChecklistItem}
								class="rounded-lg bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
							>
								Add
							</button>
							<button
								type="button"
								class="rounded-lg px-2 text-sm text-slate-400 hover:text-slate-600"
								on:click={() => {
									showChecklistInput = false;
									checklistTitle = '';
								}}
							>
								Done
							</button>
						</div>
					{/if}
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
					disabled={(entryType === 'task' ? !taskTitle.trim() : !form.title || !form.date) || submitting}
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
