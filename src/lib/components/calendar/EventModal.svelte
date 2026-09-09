<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { Event } from '$lib/types';
	import { toDate } from '$lib/utils/eventTime';
	import { trapFocusAction } from '$lib/utils/focusTrap';
	import { DateTime } from 'luxon';
	import EventFormModal from './EventFormModal.svelte';
	import ChecklistSection from './ChecklistSection.svelte';
	import EventAttendeeGroups from './EventAttendeeGroups.svelte';
	import EventDetailList from './EventDetailList.svelte';
	import EventModalBar from './EventModalBar.svelte';
	import EventRsvpRow from './EventRsvpRow.svelte';
	import { createSwipeState, startSwipe, moveSwipe, endSwipe } from './bottomSheetSwipe';

	export let event: Event;
	export let show = false;
	export let onClose: () => void = () => {};
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
	export let familyMembers: {
		userId: string;
		firstName: string;
		lastName: string;
		email: string;
	}[] = [];

	const dispatch = createEventDispatcher();

	/** Shape returned by GET/POST /api/events/[id]/rsvp. */
	type RsvpApiResponse = {
		attendance?: {
			userId: string | null;
			status: string;
			firstName?: string | null;
			lastName?: string | null;
			name?: string | null;
			inviteType?: string | null;
		}[];
		userRsvpStatus?: string;
		rsvpStatus?: string;
	};

	// Two-way from the shared checklist: warns before deleting an event with tasks.
	let attachedTaskCount = 0;

	let showEditForm = false;
	let duplicating = false;
	let showDeleteConfirm = false;
	let showDuplicateConfirm = false;
	let actionError = '';

	// Mobile bottom-sheet swipe state (shared with EventFormModal).
	let swipe = createSwipeState();

	// Occurrences share the series master's API identity.
	$: serverId = event.masterId || event.id;

	onMount(async () => {
		if (!show || !event?.id) return;
		try {
			const res = await fetch(`/api/events/${serverId}/rsvp`);
			if (res.ok) {
				const data: RsvpApiResponse = await res.json();
				if (data.attendance) {
					attendees = data.attendance.filter((a) => a.userId);
					nonUserAttendants = data.attendance
						.filter((a) => !a.userId && a.name)
						.map((a) => a.name ?? '');
				}
				if (data.userRsvpStatus) {
					currentUserRsvpStatus = data.userRsvpStatus;
				}
			}
		} catch (e) {
			console.error('Failed to load attendance:', e);
		}
	});

	$: goingList = attendees.filter((a) => a.status === 'going');
	$: maybeList = attendees.filter((a) => a.status === 'maybe');
	$: notGoingList = attendees.filter((a) => a.status === 'declined' || a.status === 'not_going');
	// Invited members who haven't answered yet (incl. required invitations).
	$: undecidedList = attendees.filter((a) => a.status === 'undecided');

	// Get calendar name from prop or event
	$: calendarName =
		event.calendar?.name ||
		calendars.find((c) => c.id === event.calendarId)?.name ||
		(event.calendarId ? 'Calendar' : '');

	function toIsoString(v: Date | string): string {
		return toDate(v).toISOString();
	}

	function close() {
		show = false;
		showEditForm = false;
		showDeleteConfirm = false;
		showDuplicateConfirm = false;
		actionError = '';
		swipe = createSwipeState();
		dispatch('close');
		onClose();
	}

	function onDragStart(e: TouchEvent) {
		if (e.touches.length !== 1 || !show || showEditForm) return;
		swipe = startSwipe(swipe, e.touches[0].clientY);
	}

	function onDragMove(e: TouchEvent) {
		swipe = moveSwipe(swipe, e.touches[0].clientY);
	}

	function onDragEnd() {
		const result = endSwipe(swipe);
		swipe = result.state;
		if (result.closed) close();
	}

	function beginDelete() {
		actionError = '';
		showDeleteConfirm = true;
	}

	function beginDuplicate() {
		actionError = '';
		showDuplicateConfirm = true;
	}

	/** Fetch init for the delete call - only what this component needs. */
	interface DeleteRequestInit {
		method: 'DELETE';
		headers?: Record<string, string>;
		body?: string;
	}

	async function performDelete(scope?: 'this' | 'all') {
		const url = `/api/events/${event.masterId || event.id}`;
		let options: DeleteRequestInit = {
			method: 'DELETE'
		};

		if (scope !== undefined && event.occurrenceDate) {
			options = {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ scope, occurrenceDate: event.occurrenceDate })
			};
		}

		try {
			const response = await fetch(url, options);
			if (response.ok) {
				dispatch('delete', { id: event.masterId || event.id });
				close();
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

	async function duplicateEvent() {
		if (duplicating) return;
		actionError = '';
		duplicating = true;
		try {
			// Copy the loaded invitation rows too: members with their required/
			// optional type, guests by name (server always stores guests optional).
			const attendeePayload = [
				...attendees.flatMap((a) =>
					a.userId
						? [
								{
									value: a.userId,
									isUser: true,
									inviteType: a.inviteType === 'required' ? 'required' : 'optional'
								}
							]
						: []
				),
				...nonUserAttendants.map((name) => ({
					value: name,
					isUser: false,
					inviteType: 'optional'
				}))
			];
			const payload = {
				title: `${event.title} (copy)`,
				start: toIsoString(event.start),
				end: event.end ? toIsoString(event.end) : null,
				description: event.description || null,
				location: event.location || null,
				allDay: !!event.allDay,
				calendarId: event.calendarId || null,
				recurrenceFrequency: event.recurrenceFrequency,
				recurrenceInterval: event.recurrenceInterval,
				recurrenceByDay: event.recurrenceByDay,
				recurrenceCount: event.recurrenceCount,
				recurrenceUntil: event.recurrenceUntil,
				reminderMinutes: event.reminderMinutes ?? null,
				attendees: attendeePayload
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
</script>

<svelte:window on:keydown={(e) => show && !showEditForm && e.key === 'Escape' && close()} />

{#if show}
	{#if showEditForm}
		<EventFormModal
			show={true}
			{event}
			calendarIds={calendars}
			{userSettings}
			{familyMembers}
			onClose={handleFormClose}
			on:update={handleUpdate}
			on:delete={(e) => performDelete(e.detail?.scope)}
		/>
	{:else}
		<div
			class="fixed inset-0 z-[60] flex items-end justify-center overflow-hidden sm:items-center sm:p-4"
		>
			<div
				class="absolute inset-0 bg-black/40 backdrop-blur-sm"
				onclick={close}
				role="presentation"
			></div>

			<div
				class="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl"
				style="transform: translateY({swipe.dragOffset}px); transition: transform {swipe.dragTransition
					? '150ms ease-out'
					: '0ms'}; touch-action: pan-y;"
				role="dialog"
				aria-modal="true"
				use:trapFocusAction
			>
				<!-- Grab handle (mobile): bottom-sheet affordance + swipe-down-to-close zone -->
				<div
					class="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2 active:cursor-grabbing sm:hidden"
					data-drag-handle
					ontouchstart={onDragStart}
					ontouchmove={onDragMove}
					ontouchend={onDragEnd}
					aria-hidden="true"
				>
					<span class="h-1.5 w-10 rounded-full bg-slate-200"></span>
				</div>

				<!-- Header -->
				<div
					class="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4"
				>
					<div class="flex min-w-0 flex-1 items-center gap-3">
						<div
							class="h-3 w-3 shrink-0 rounded-full"
							style="background-color: {event.color || '#94a3b8'}"
						></div>
						<div class="min-w-0">
							<h2 class="truncate text-lg font-bold text-slate-900 sm:text-xl" title={event.title}>
								{event.title}
							</h2>
							{#if event.recurrenceFrequency}
								{@const unit =
									{ daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[
										event.recurrenceFrequency
									] || ''}
								<p class="text-xs font-medium text-purple-600">
									🔁 Repeats
									{(event.recurrenceInterval ?? 1) > 1
										? `every ${event.recurrenceInterval} ${unit}s`
										: unit === 'day'
											? 'daily'
											: unit
												? `${unit}ly`
												: ''}
								</p>
							{/if}
						</div>
					</div>
					<button
						type="button"
						onclick={close}
						class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
						aria-label="Close"
					>
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				<!-- Scrollable body -->
				<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
					<!-- Content -->
					<EventDetailList {event} {calendarName} />

					<!-- Your RSVP (sits above Attendees so the action is in the thumb fold) -->
					<EventRsvpRow
						{serverId}
						bind:currentUserRsvpStatus
						bind:attendees
						bind:nonUserAttendants
						onResponded={async (status) => {
							dispatch('rsvp', { id: serverId, status });
							await invalidateAll();
						}}
					/>

					<!-- RSVP Summary Section / Attendees -->
					{#if goingList.length > 0 || maybeList.length > 0 || notGoingList.length > 0 || nonUserAttendants.length > 0}
						<EventAttendeeGroups
							going={goingList}
							maybe={maybeList}
							notGoing={notGoingList}
							undecided={undecidedList}
							guests={nonUserAttendants}
						/>
					{/if}

					<!-- Event checklist (shared section; hidden until it has content) -->
					{#if !event.isAd}
						<ChecklistSection eventId={serverId} bind:attachedCount={attachedTaskCount} />
					{/if}

					{#if actionError}
						<div class="px-4 pb-3 sm:px-6">
							<p role="alert" class="text-sm text-red-600">{actionError}</p>
						</div>
					{/if}
				</div>

				<EventModalBar
					{showDeleteConfirm}
					{showDuplicateConfirm}
					{attachedTaskCount}
					isRecurring={!!event.recurrenceFrequency}
					eventTitle={event.title}
					{duplicating}
					onDeleteScope={(scope) => performDelete(scope)}
					onCancelDelete={() => (showDeleteConfirm = false)}
					onConfirmDuplicate={() => {
						showDuplicateConfirm = false;
						duplicateEvent();
					}}
					onCancelDuplicate={() => (showDuplicateConfirm = false)}
					onBeginDelete={beginDelete}
					onBeginDuplicate={beginDuplicate}
					onEdit={handleEdit}
				/>
			</div>
		</div>
	{/if}
{/if}
