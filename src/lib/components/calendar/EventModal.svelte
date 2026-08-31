<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { Event } from '$lib/types';
	import { toDate } from '$lib/utils/eventTime';
	import { trapFocusAction } from '$lib/utils/focusTrap';
	import { DateTime } from 'luxon';
	import EventFormModal from './EventFormModal.svelte';

	export let event: Event;
	export let show = false;
	export let attendees: {
		userId: string | null;
		status: string;
		firstName?: string | null;
		lastName?: string | null;
		inviteType?: string | null;
	}[] = [];
	export let nonUserAttendants: string[] = [];
	export let currentUserRsvpStatus: string = 'undecided';
	export let calendars: { id: string; name: string; color?: string }[] = [];
	export let userSettings: { defaultCalendarId?: string | null } | null = null;
	export let familyMembers: { userId: string; firstName: string; lastName: string; email: string }[] = [];

	const dispatch = createEventDispatcher();

	let showEditForm = false;
	let duplicating = false;
	let showDeleteConfirm = false;
	let actionError = '';

	// Mobile bottom-sheet swipe state.
	let dragging = false;
	let dragStartY = 0;
	let dragOffset = 0;
	let dragTransition = false;

	// Occurrences share the series master's API identity.
	$: serverId = event.masterId || event.id;

	onMount(async () => {
		if (!show || !event?.id) return;
		loadEventTasks();
		try {
			const res = await fetch(`/api/events/${serverId}/rsvp`);
			if (res.ok) {
				const data = await res.json();
				if (data.attendance) {
					attendees = data.attendance.filter((a: any) => a.userId);
					nonUserAttendants = data.attendance.filter((a: any) => !a.userId && a.name).map((a: any) => a.name);
				}
				if (data.userRsvpStatus) {
					currentUserRsvpStatus = data.userRsvpStatus;
				}
			}
		} catch (e) {
			console.error('Failed to load attendance:', e);
		}
	});

	$: goingList = attendees.filter(a => a.status === 'going');
	$: maybeList = attendees.filter(a => a.status === 'maybe');
	$: notGoingList = attendees.filter(a => a.status === 'declined' || a.status === 'not_going');
	// Invited members who haven't answered yet (incl. required invitations).
	$: undecidedList = attendees.filter(a => a.status === 'undecided');

	// Get calendar name from prop or event
	$: calendarName = event.calendar?.name ||
		(calendars.find(c => c.id === event.calendarId)?.name) ||
		(event.calendarId ? 'Calendar' : '');

	// Extract start/end times from ISO strings if not available as separate fields
	function tryFormat(d: Date | string | undefined | null): string | undefined {
		if (!d) return undefined;
		const dt = DateTime.fromJSDate(toDate(d));
		return dt.isValid ? dt.toFormat('HH:mm') : undefined;
	}

	function toIsoString(v: unknown): string {
		return toDate(v).toISOString();
	}
	$: startTime = event.startTime || tryFormat(event.start);
	$: endTime = event.endTime || tryFormat(event.end);
	$: eventDate = event.date || (event.start ? toDate(event.start) : undefined);

	function close() {
		show = false;
		showEditForm = false;
		showDeleteConfirm = false;
		actionError = '';
		dragOffset = 0;
		dragTransition = false;
		dispatch('close');
	}

	function onDragStart(e: TouchEvent) {
		if (e.touches.length !== 1 || !show || showEditForm) return;
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

	function beginDelete() {
		actionError = '';
		showDeleteConfirm = true;
	}

	async function performDelete(scope?: 'this' | 'all') {
		const url = `/api/events/${event.masterId || event.id}`;
		const options: RequestInit = { method: 'DELETE' };

		if (scope !== undefined && event.occurrenceDate) {
			options.headers = { 'Content-Type': 'application/json' };
			options.body = JSON.stringify({ scope, occurrenceDate: event.occurrenceDate });
		}

		try {
			const response = await fetch(url, options);
			if (response.ok) {
				dispatch('delete', { id: event.masterId || event.id });
				show = false;
			} else {
				const j = await response.json().catch(() => ({}));
				actionError = j.error || 'Something went wrong. Try again.';
			}
		} catch (error) {
			console.error('Delete error:', error);
			actionError = 'Network error. Check your connection and try again.';
		}
	}

	function handleEdit() {
		showEditForm = true;
	}

	function handleFormClose() {
		showEditForm = false;
	}

	function handleUpdate(e: CustomEvent) {
		dispatch('update', e.detail);
		showEditForm = false;
	}

	let rsvpPending = false;

	async function handleRsvp(status: string) {
		if (rsvpPending) return;
		// Clicking the active choice again = "no answer yet".
		const next = currentUserRsvpStatus === status ? 'undecided' : status;
		const previous = currentUserRsvpStatus;
		currentUserRsvpStatus = next; // optimistic
		rsvpPending = true;
		try {
			const response = await fetch(`/api/events/${serverId}/rsvp`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: next })
			});
			if (response.ok) {
				const data = await response.json();
				attendees = data.attendance.filter((a: any) => a.userId);
				nonUserAttendants = data.attendance.filter((a: any) => !a.userId && a.name).map((a: any) => a.name);
				currentUserRsvpStatus = data.rsvpStatus || next;
				dispatch('rsvp', { id: serverId, status: next });
			} else {
				currentUserRsvpStatus = previous;
			}
		} catch (error) {
			console.error('RSVP error:', error);
			currentUserRsvpStatus = previous;
		} finally {
			rsvpPending = false;
		}
	}

	const RSVP_OPTIONS = [
		{ status: 'going', label: 'Going' },
		{ status: 'maybe', label: 'Maybe' },
		{ status: 'declined', label: "Can't go" }
	];
	$: rsvpCounts = {
		going: goingList.length,
		maybe: maybeList.length,
		declined: notGoingList.length
	} as Record<string, number>;

	// Event checklist — hidden until it has content.
	let eventTasks: any[] = [];
	let showTaskInput = false;
	let newTaskTitle = '';
	let taskBusy = false;

	async function loadEventTasks() {
		if (event.isAd || !event?.id) return;
		try {
			const res = await fetch(`/api/tasks?eventId=${serverId}`);
			if (res.ok) {
				eventTasks = (await res.json()).tasks ?? [];
			}
		} catch (e) {
			console.error('Failed to load event tasks:', e);
		}
	}

	async function addEventTask() {
		const title = newTaskTitle.trim();
		if (!title || taskBusy) return;
		taskBusy = true;
		try {
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title, eventId: serverId })
			});
			if (res.ok) {
				const json = await res.json();
				eventTasks = [...eventTasks, json.task];
				newTaskTitle = '';
			}
		} finally {
			taskBusy = false;
		}
	}

	async function toggleEventTask(task: any) {
		if (taskBusy) return;
		taskBusy = true;
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
			taskBusy = false;
		}
	}

	async function deleteEventTask(taskId: string) {
		if (taskBusy) return;
		taskBusy = true;
		try {
			const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
			if (res.ok) {
				eventTasks = eventTasks.filter(t => t.id !== taskId);
			}
		} finally {
			taskBusy = false;
		}
	}

	async function duplicateEvent() {
		if (duplicating) return;
		actionError = '';
		duplicating = true;
		try {
			const payload = {
				title: `${event.title} (copy)`,
				start: toIsoString(event.start),
				end: event.end ? toIsoString(event.end) : null,
				description: event.description || null,
				location: event.location || null,
				allDay: !!event.allDay,
				calendarId: event.calendarId || null,
				recurrenceFrequency: null,
				recurrenceInterval: null
			};
			const res = await fetch('/api/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (res.ok) {
				await invalidateAll();
				close();
			} else {
				const j = await res.json().catch(() => ({}));
				actionError = j.error || 'Something went wrong. Try again.';
			}
		} catch (e) {
			console.error('Duplicate failed:', e);
			actionError = 'Network error. Check your connection and try again.';
		} finally {
			duplicating = false;
		}
	}

	function formatTime(time: string | undefined): string {
		if (!time) return '';
		const [h, m] = time.split(':').map(Number);
		const ampm = h >= 12 ? 'PM' : 'AM';
		const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
		return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
	}

	function getInitials(firstName: string, lastName: string): string {
		return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
	}
</script>

<svelte:window on:keydown={(e) => show && !showEditForm && e.key === 'Escape' && close()} />

{#if show}
	{#if showEditForm}
		<EventFormModal
			show={true}
			event={event}
			calendarIds={calendars}
			{userSettings}
			{familyMembers}
			on:close={handleFormClose}
			on:update={handleUpdate}
			on:delete={(e) => performDelete(e.detail?.scope)}
		/>
	{:else}
		<div class="fixed inset-0 z-[60] flex items-end justify-center overflow-hidden sm:items-center sm:p-4">
			<div
				class="absolute inset-0 bg-black/40 backdrop-blur-sm"
				onclick={close}
				role="presentation"
			></div>

			<div
				class="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl"
				style="transform: translateY({dragOffset}px); transition: transform {dragTransition ? '150ms ease-out' : '0ms'}; touch-action: pan-y;"
				role="dialog"
				aria-modal="true"
				use:trapFocusAction
			>
				<!-- Grab handle (mobile): bottom-sheet affordance + swipe-down-to-close zone -->
				<div
					class="flex shrink-0 touch-none cursor-grab justify-center pb-1 pt-2 active:cursor-grabbing sm:hidden"
					data-drag-handle
					ontouchstart={onDragStart}
					ontouchmove={onDragMove}
					ontouchend={onDragEnd}
					aria-hidden="true"
				>
					<span class="h-1.5 w-10 rounded-full bg-slate-200"></span>
				</div>

				<!-- Header -->
				<div class="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
					<div class="flex items-center gap-3 min-w-0 flex-1">
						<div class="h-3 w-3 rounded-full shrink-0" style="background-color: {event.color || '#94a3b8'}"></div>
						<div class="min-w-0">
							<h2 class="truncate text-lg font-bold text-slate-900 sm:text-xl" title={event.title}>{event.title}</h2>
							{#if event.recurrenceFrequency}
								{@const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[event.recurrenceFrequency] || ''}
								<p class="text-xs font-medium text-purple-600">
									🔁 Repeats
									{(event.recurrenceInterval ?? 1) > 1
										? `every ${event.recurrenceInterval} ${unit}s`
										: unit ? `${unit}ly` : ''}
								</p>
							{/if}
						</div>
					</div>
					<button type="button" onclick={close} class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<!-- Scrollable body -->
				<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
					<!-- Content -->
					<div class="space-y-4 p-4 sm:p-6">
						<!-- Date & Time -->
						{#if eventDate}
							{@const parsedDate = eventDate instanceof Date ? DateTime.fromJSDate(eventDate) : DateTime.fromISO(String(eventDate))}
							<div class="flex items-start gap-3 text-slate-700">
								<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 shrink-0">
									<svg class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
									</svg>
								</div>
								<div class="min-w-0 flex-1">
									<div class="font-medium">{parsedDate.toFormat('EEEE, MMMM d, yyyy')}</div>
									{#if event.allDay}
										<span class="inline-block mt-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">All day</span>
									{:else if startTime}
										<div class="mt-1 text-sm text-slate-600">
											{formatTime(startTime)}
											{#if endTime}
												<span class="text-slate-400"> - {formatTime(endTime)}</span>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						{/if}

						<!-- Calendar -->
						{#if calendarName}
							<div class="flex items-center gap-3 text-slate-700">
								<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 shrink-0">
									<svg class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
									</svg>
								</div>
								<span class="text-sm font-medium text-slate-600">{calendarName}</span>
							</div>
						{/if}

						<!-- Location -->
						{#if event.location}
							<div class="flex items-start gap-3 text-slate-700">
								<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 shrink-0">
									<svg class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
									</svg>
								</div>
								<span class="text-sm break-words">{event.location}</span>
							</div>
						{/if}

						<!-- Description -->
						{#if event.description}
							<div class="rounded-xl bg-slate-50 p-4">
								<p class="text-sm text-slate-600 whitespace-pre-wrap">{event.description}</p>
							</div>
						{/if}
					</div>

					<!-- Your RSVP (sits above Attendees so the action is in the thumb fold) -->
					<div class="border-t border-slate-100 px-4 py-4 sm:px-6">
						<div class="mb-2 flex items-center justify-between">
							<h3 class="text-sm font-semibold text-slate-700">Your RSVP</h3>
							{#if currentUserRsvpStatus !== 'undecided'}
								<span class="text-[11px] text-slate-400">tap again to clear</span>
							{/if}
						</div>
						<div
							role="group"
							aria-label="Your RSVP"
							class="flex overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1"
						>
							{#each RSVP_OPTIONS as option (option.status)}
								{@const active = currentUserRsvpStatus === option.status}
								<button
									type="button"
									onclick={() => handleRsvp(option.status)}
									disabled={rsvpPending}
									aria-pressed={active}
									class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-3 text-sm font-medium transition-all disabled:opacity-60 {
										option.status === 'going'
											? active
												? 'bg-green-600 text-white shadow-md shadow-green-600/30'
												: 'text-green-700 hover:bg-green-100/70'
											: option.status === 'maybe'
												? active
													? 'bg-yellow-500 text-white shadow-md shadow-yellow-500/30'
													: 'text-yellow-700 hover:bg-yellow-100/70'
												: active
													? 'bg-red-600 text-white shadow-md shadow-red-600/30'
													: 'text-red-700 hover:bg-red-100/70'
									}"
								>
									{#if option.status === 'going'}
										<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
										</svg>
									{:else if option.status === 'maybe'}
										<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
										</svg>
									{:else}
										<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
										</svg>
									{/if}
									{option.label}
									{#if rsvpCounts[option.status] > 0}
										<span class="rounded-full px-1.5 py-0.5 text-[10px] font-bold {active ? 'bg-white/25' : 'bg-slate-200 text-slate-600'}">
											{rsvpCounts[option.status]}
										</span>
									{/if}
								</button>
							{/each}
						</div>
					</div>

					<!-- RSVP Summary Section / Attendees -->
					{#if goingList.length > 0 || maybeList.length > 0 || notGoingList.length > 0 || nonUserAttendants.length > 0}
						<div class="border-t border-slate-100 px-4 py-4 sm:px-6">
							<h3 class="mb-4 text-sm font-semibold text-slate-700">Attendees</h3>

							<!-- Going -->
							{#if goingList.length > 0}
								<div class="mb-3">
									<div class="mb-1.5 flex items-center gap-2">
										<div class="h-2 w-2 rounded-full bg-green-500"></div>
										<span class="text-xs font-medium text-green-700">Going ({goingList.length})</span>
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each goingList as rsvp}
											<div class="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1">
												<div class="flex h-5 w-5 items-center justify-center rounded-full bg-green-200 text-xs font-medium text-green-800">
													{getInitials(rsvp.firstName || '', rsvp.lastName || '')}
												</div>
												<span class="text-xs text-green-700">{rsvp.firstName || rsvp.userId}</span>
												{#if rsvp.inviteType === 'required'}
													<span class="rounded bg-amber-200 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-amber-800">Req</span>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Maybe -->
							{#if maybeList.length > 0}
								<div class="mb-3">
									<div class="mb-1.5 flex items-center gap-2">
										<div class="h-2 w-2 rounded-full bg-yellow-500"></div>
										<span class="text-xs font-medium text-yellow-700">Maybe ({maybeList.length})</span>
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each maybeList as rsvp}
											<div class="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-2.5 py-1">
												<div class="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-200 text-xs font-medium text-yellow-800">
													{getInitials(rsvp.firstName || '', rsvp.lastName || '')}
												</div>
												<span class="text-xs text-yellow-700">{rsvp.firstName || rsvp.userId}</span>
												{#if rsvp.inviteType === 'required'}
													<span class="rounded bg-amber-200 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-amber-800">Req</span>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Not Going -->
							{#if notGoingList.length > 0}
								<div class="mb-3">
									<div class="mb-1.5 flex items-center gap-2">
										<div class="h-2 w-2 rounded-full bg-red-500"></div>
										<span class="text-xs font-medium text-red-700">Not Going ({notGoingList.length})</span>
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each notGoingList as rsvp}
											<div class="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1">
												<div class="flex h-5 w-5 items-center justify-center rounded-full bg-red-200 text-xs font-medium text-red-800">
													{getInitials(rsvp.firstName || '', rsvp.lastName || '')}
												</div>
												<span class="text-xs text-red-700">{rsvp.firstName || rsvp.userId}</span>
												{#if rsvp.inviteType === 'required'}
													<span class="rounded bg-amber-200 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-amber-800">Req</span>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Awaiting response (invited, hasn't answered) -->
							{#if undecidedList.length > 0}
								<div class="mb-3">
									<div class="mb-1.5 flex items-center gap-2">
										<div class="h-2 w-2 rounded-full bg-slate-400"></div>
										<span class="text-xs font-medium text-slate-600">Awaiting response ({undecidedList.length})</span>
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each undecidedList as rsvp}
											{@const isRequired = rsvp.inviteType === 'required'}
											<div class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 {isRequired ? 'bg-amber-50 ring-1 ring-inset ring-amber-300' : 'bg-slate-100'}">
												<div class="flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium {isRequired ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-700'}">
													{getInitials(rsvp.firstName || '', rsvp.lastName || '')}
												</div>
												<span class="text-xs {isRequired ? 'text-amber-800' : 'text-slate-700'}">
													{rsvp.firstName || rsvp.userId}
													{#if isRequired}
														<span class="ml-1 rounded bg-amber-200 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-amber-800">Required</span>
													{/if}
												</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Non-user Attendants -->
							{#if nonUserAttendants.length > 0}
								<div>
									<div class="mb-1.5 flex items-center gap-2">
										<div class="h-2 w-2 rounded-full bg-slate-400"></div>
										<span class="text-xs font-medium text-slate-600">Guests ({nonUserAttendants.length})</span>
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#each nonUserAttendants as att}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
												<svg class="h-3 w-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
												</svg>
												{att}
											</span>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Event Checklist (hidden until it has content) -->
					{#if !event.isAd && (eventTasks.length > 0 || showTaskInput)}
						<div class="border-t border-slate-100 px-4 py-3 sm:px-6">
							<div class="mb-1 flex items-center justify-between">
								<h4 class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
									Checklist{#if eventTasks.length > 0} · {eventTasks.filter(t => t.completedAt).length}/{eventTasks.length}{/if}
								</h4>
								{#if !showTaskInput}
									<button
										type="button"
										class="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary-600"
										onclick={() => (showTaskInput = true)}
									>
										+ Add task
									</button>
								{/if}
							</div>

							<ul class="space-y-0.5">
								{#each eventTasks as task (task.id)}
									<li class="group flex items-center gap-2 rounded px-1.5 py-1.5 hover:bg-slate-50">
										<button
											type="button"
											disabled={taskBusy}
											onclick={() => toggleEventTask(task)}
											class="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border {task.completedAt
												? 'border-primary-500 bg-primary-500 text-white'
												: 'border-slate-300 hover:border-primary-400'}"
											aria-label={task.completedAt ? 'Mark incomplete' : 'Complete'}
										>
											<span class="absolute -inset-2" aria-hidden="true"></span>
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
											disabled={taskBusy}
											onclick={() => deleteEventTask(task.id)}
											class="shrink-0 rounded-lg p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
											aria-label="Remove task"
										>
											<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
											</svg>
										</button>
									</li>
								{/each}
							</ul>

							{#if showTaskInput}
								<form
									class="mt-2 flex gap-1.5"
									onsubmit={(e) => {
										e.preventDefault();
										addEventTask();
									}}
								>
									<input
										type="text"
										bind:value={newTaskTitle}
										placeholder="Add a task..."
										class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
									/>
									<button
										type="submit"
										disabled={taskBusy || !newTaskTitle.trim()}
										class="rounded-lg bg-primary-600 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
									>
										Add
									</button>
									<button
										type="button"
										class="rounded-lg px-2.5 py-2.5 text-sm text-slate-400 hover:text-slate-600"
										onclick={() => {
											showTaskInput = false;
											newTaskTitle = '';
										}}
									>
										Done
									</button>
								</form>
							{/if}
						</div>
					{/if}

					<!-- Delete confirmation -->
					{#if showDeleteConfirm}
						<div class="border-t border-slate-100 px-4 py-4 sm:px-6">
							<div class="rounded-xl border border-red-200 bg-red-50 p-4">
								<p class="text-sm font-medium text-red-700">Delete this event?</p>
								{#if eventTasks.length > 0}
									<p class="mt-1 text-xs text-red-600">⚠️ {eventTasks.length} attached task(s) will also be deleted.</p>
								{/if}
								<div class="mt-3 flex flex-wrap items-center gap-2">
									{#if event.recurrenceFrequency}
										<button
											type="button"
											onclick={() => performDelete('this')}
											class="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
										>
											This occurrence
										</button>
										<button
											type="button"
											onclick={() => performDelete('all')}
											class="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
										>
											Whole series
										</button>
									{:else}
										<button
											type="button"
											onclick={() => performDelete()}
											class="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
										>
											Delete
										</button>
									{/if}
									<button
										type="button"
										onclick={() => (showDeleteConfirm = false)}
										class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
									>
										Cancel
									</button>
								</div>
							</div>
						</div>
					{/if}

					{#if actionError}
						<div class="px-4 pb-3 sm:px-6">
							<p role="alert" class="text-sm text-red-600">{actionError}</p>
						</div>
					{/if}
				</div>

				<!-- Sticky action bar -->
				<div
					class="flex shrink-0 items-center gap-2 border-t border-slate-100 px-2.5 py-2 sm:px-6 sm:py-3.5"
					style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 0.5rem)"
				>
					<button
						type="button"
						onclick={beginDelete}
						class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50 sm:w-auto sm:gap-1.5 sm:px-4 sm:text-sm sm:font-medium"
						aria-label="Delete event"
					>
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
						<span class="hidden sm:inline">Delete</span>
					</button>
					<button
						type="button"
						onclick={() => duplicateEvent()}
						disabled={duplicating}
						class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:gap-1.5 sm:px-4 sm:text-sm sm:font-medium"
						aria-label="Duplicate event"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
						</svg>
						<span class="hidden sm:inline">{duplicating ? 'Copying...' : 'Duplicate'}</span>
					</button>
					<button
						type="button"
						onclick={handleEdit}
						class="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-700"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
						</svg>
						Edit Event
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}