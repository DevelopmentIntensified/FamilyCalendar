<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type { Event } from '$lib/types';
	import { DateTime } from 'luxon';
	import EventFormModal from './EventFormModal.svelte';

	export let event: Event;
	export let show = false;
	export let attendees: { userId: string; status: string; firstName?: string; lastName?: string }[] = [];
	export let nonUserAttendants: string[] = [];
	export let currentUserRsvpStatus: string = 'undecided';
	export let calendars: { id: string; name: string; color?: string }[] = [];
	export let userSettings: { defaultCalendarId?: string | null } | null = null;
	export let familyMembers: { userId: string; firstName: string; lastName: string; email: string }[] = [];

	const dispatch = createEventDispatcher();

	let showEditForm = false;

	onMount(async () => {
		if (!show || !event?.id) return;
		try {
			const res = await fetch(`/api/events/${event.id}/rsvp`);
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

	// Get calendar name from prop or event
	$: calendarName = event.calendar?.name ||
		(calendars.find(c => c.id === event.calendarId)?.name) ||
		(event.calendarId ? 'Calendar' : '');

	// Extract start/end times from ISO strings if not available as separate fields
	function tryFormat(d: Date | string | undefined | null): string | undefined {
		if (!d) return undefined;
		if (d instanceof Date) {
			const dt = DateTime.fromJSDate(d);
			return dt.isValid ? dt.toFormat('HH:mm') : undefined;
		}
		const dt = DateTime.fromISO(d);
		return dt.isValid ? dt.toFormat('HH:mm') : undefined;
	}
	$: startTime = event.startTime || tryFormat(event.start);
	$: endTime = event.endTime || tryFormat(event.end);
	$: eventDate = event.date || (event.start ? (event.start instanceof Date ? event.start : new Date(event.start)) : undefined);

	function close() {
		show = false;
		showEditForm = false;
		dispatch('close');
	}

	async function handleDelete(scope?: 'this' | 'all') {
		const isOccurrence = !!(event.recurrenceFrequency && event.occurrenceDate);
		let url = `/api/events/${event.masterId || event.id}`;
		const options: RequestInit = { method: 'DELETE' };

		if (isOccurrence) {
			if (!scope) {
				scope = confirm(
					'OK = delete just this occurrence\nCancel = delete the whole series'
				)
					? 'this'
					: 'all';
			}
			options.headers = { 'Content-Type': 'application/json' };
			options.body = JSON.stringify({ scope, occurrenceDate: event.occurrenceDate });
		} else if (!confirm('Delete this event?')) {
			return;
		}

		try {
			const response = await fetch(url, options);
			if (response.ok) {
				dispatch('delete', { id: event.masterId || event.id });
				show = false;
			} else {
				console.error('Failed to delete event');
			}
		} catch (error) {
			console.error('Delete error:', error);
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

	async function handleRsvp(status: string) {
		try {
			const response = await fetch(`/api/events/${event.id}/rsvp`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status })
			});
			if (response.ok) {
				const data = await response.json();
				currentUserRsvpStatus = status;
				attendees = data.attendance.filter(a => a.userId);
				nonUserAttendants = data.attendance.filter(a => !a.userId && a.name).map(a => a.name);
				dispatch('rsvp', { id: event.id, status });
			}
		} catch (error) {
			console.error('RSVP error:', error);
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
			on:delete={() => handleDelete()}
		/>
	{:else}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-x-hidden">
			<button class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={close} aria-label="Close modal"></button>
			
			<div class="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl overflow-x-hidden">
				<!-- Header -->
				<div class="flex items-center justify-between border-b border-slate-100 p-6">
					<div class="flex items-center gap-3 min-w-0 flex-1">
						<div class="h-3 w-3 rounded-full shrink-0" style="background-color: {event.color || '#94a3b8'}"></div>
						<div class="min-w-0">
							<h2 class="text-xl font-bold text-slate-900 truncate" title={event.title}>{event.title}</h2>
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
					<button type="button" onclick={close} class="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0" aria-label="Close">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<!-- Content -->
				<div class="space-y-4 p-6">
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

				<!-- RSVP Summary Section -->
				{#if goingList.length > 0 || maybeList.length > 0 || notGoingList.length > 0 || nonUserAttendants.length > 0}
					<div class="border-t border-slate-100 px-6 py-4">
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

				<!-- Your RSVP Section -->
				<div class="border-t border-slate-100 px-6 py-4">
					<h3 class="mb-3 text-sm font-semibold text-slate-700">Your RSVP</h3>
					<div class="flex gap-2">
						<button
							type="button"
							onclick={() => handleRsvp('going')}
							class="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all {
								currentUserRsvpStatus === 'going'
									? 'bg-green-600 text-white shadow-md shadow-green-600/30'
									: 'bg-green-50 text-green-700 hover:bg-green-100'
							}">
							<div class="flex items-center justify-center gap-1.5">
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
								</svg>
								Going
							</div>
						</button>
						<button
							type="button"
							onclick={() => handleRsvp('maybe')}
							class="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all {
								currentUserRsvpStatus === 'maybe'
									? 'bg-yellow-500 text-white shadow-md shadow-yellow-500/30'
									: 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
							}">
							<div class="flex items-center justify-center gap-1.5">
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								Maybe
							</div>
						</button>
						<button
							type="button"
							onclick={() => handleRsvp('declined')}
							class="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all {
								currentUserRsvpStatus === 'declined'
									? 'bg-red-600 text-white shadow-md shadow-red-600/30'
									: 'bg-red-50 text-red-700 hover:bg-red-100'
							}">
							<div class="flex items-center justify-center gap-1.5">
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
								Not Going
							</div>
						</button>
					</div>
				</div>

				<!-- Actions -->
				<div class="flex items-center justify-between border-t border-slate-100 p-6">
					<button
						type="button"
						onclick={() => handleDelete()}
						class="rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
						<div class="flex items-center gap-1.5">
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
							</svg>
							Delete
						</div>
					</button>
					<button
						type="button"
						onclick={handleEdit}
						class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
						<div class="flex items-center gap-1.5">
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
							</svg>
							Edit Event
						</div>
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}
