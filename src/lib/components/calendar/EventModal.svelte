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
	import EventModalHeader from './EventModalHeader.svelte';
	import EventRsvpRow from './EventRsvpRow.svelte';
	import { buildDuplicateEventPayload } from '$lib/utils/eventDuplicate';
	import { fetchAttendance, splitAttendance } from '$lib/utils/attendance';
	import { createSwipeState, createSwipeHandlers } from './bottomSheetSwipe';
	import BottomSheetHandle from './BottomSheetHandle.svelte';

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

	// Two-way from the shared checklist: warns before deleting an event with tasks.
	let attachedTaskCount = 0;

	let showEditForm = false;
	let duplicating = false;
	let showDeleteConfirm = false;
	let showDuplicateConfirm = false;
	let actionError = '';

	// Mobile bottom-sheet swipe state (shared with EventFormModal).
	let swipe = createSwipeState();
	const { onDragStart, onDragMove, onDragEnd } = createSwipeHandlers({
		getState: () => swipe,
		setState: (s) => (swipe = s),
		canStart: () => show && !showEditForm,
		onClose: close
	});

	// Occurrences share the series master's API identity.
	$: serverId = event.masterId || event.id;

	// Set once the viewer RSVPs: a slow initial load resolving afterwards is
	// stale and must not clobber the fresher optimistic + POST state.
	let rsvpTouched = false;

	onMount(async () => {
		if (!show || !event?.id) return;
		const loaded = await fetchAttendance(serverId);
		if (rsvpTouched) return;
		if (loaded.attendees) attendees = loaded.attendees;
		if (loaded.nonUserAttendants) nonUserAttendants = loaded.nonUserAttendants;
		if (loaded.userRsvpStatus) currentUserRsvpStatus = loaded.userRsvpStatus;
	});

	$: attendanceSplit = splitAttendance(attendees);
	$: goingList = attendanceSplit.going;
	$: maybeList = attendanceSplit.maybe;
	$: notGoingList = attendanceSplit.notGoing;
	// Invited members who haven't answered yet (incl. required invitations).
	$: undecidedList = attendanceSplit.undecided;

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
			const payload = buildDuplicateEventPayload(event, attendees, nonUserAttendants);
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
				<BottomSheetHandle {onDragStart} {onDragMove} {onDragEnd} />

				<EventModalHeader {event} onClose={close} />

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
							rsvpTouched = true;
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
