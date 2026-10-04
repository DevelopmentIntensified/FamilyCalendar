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
	/** Guests with their own status; names-only callers fall back to one row each. */
	export let guestStatuses: { name: string; status: string; inviteType?: string | null }[] | null =
		null;
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
	/** Issue 015: a DELETE in flight. Re-entry here used to fire it twice. */
	let deleting = false;
	let showDeleteConfirm = false;
	let showDuplicateConfirm = false;
	let actionError = '';
	/** An invite POST in flight; re-entry would add the same guest twice. */
	let invitingGuest = false;

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
	/** Attendees are client-fetched; the region shows a skeleton until they land. */
	let attendanceLoading = false;

	onMount(async () => {
		if (!show || !event?.id) return;
		attendanceLoading = true;
		try {
			const loaded = await fetchAttendance(serverId);
			if (rsvpTouched) return;
			if (loaded.attendees) attendees = loaded.attendees;
			if (loaded.nonUserAttendants) nonUserAttendants = loaded.nonUserAttendants;
			if (loaded.guestRows) guestStatuses = loaded.guestRows;
			if (loaded.userRsvpStatus) currentUserRsvpStatus = loaded.userRsvpStatus;
		} finally {
			attendanceLoading = false;
		}
	});

	$: attendanceSplit = splitAttendance(attendees);
	$: goingList = attendanceSplit.going;
	$: maybeList = attendanceSplit.maybe;
	$: notGoingList = attendanceSplit.notGoing;
	// Invited members who haven't answered yet (incl. required invitations).
	$: undecidedList = attendanceSplit.undecided;
	// True once anything to show exists — server-passed props or a landed fetch.
	// The skeleton only fills a genuinely empty region, never one that already
	// has content the refresh is about to replace.
	$: hasAttendance =
		goingList.length > 0 ||
		maybeList.length > 0 ||
		notGoingList.length > 0 ||
		nonUserAttendants.length > 0;

	/**
	 * Guests as the attendance region draws them: one row each, still carrying
	 * their own status. A caller that only knows the names falls back to one
	 * row per name, which is what the region rendered before.
	 */
	$: guestRows = guestStatuses
		? guestStatuses.map((g) => ({ name: g.name, status: g.status, inviteType: g.inviteType }))
		: nonUserAttendants.map((name) => ({ name, status: 'invited', inviteType: null }));

	/** Invite a named guest: a POST, then the same refresh every other RSVP does. */
	async function inviteGuest(name: string) {
		if (invitingGuest || !name.trim()) return;
		invitingGuest = true;
		actionError = '';
		try {
			const res = await fetch(`/api/events/${serverId}/rsvp`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ guest: name.trim() })
			});
			if (res.ok) {
				const loaded = await fetchAttendance(serverId);
				if (loaded.attendees) attendees = loaded.attendees;
				if (loaded.nonUserAttendants) nonUserAttendants = loaded.nonUserAttendants;
				if (loaded.guestRows) guestStatuses = loaded.guestRows;
				await invalidateAll();
			} else {
				const j = await res.json().catch(() => ({}));
				actionError = j.error || "Couldn't invite them. Try again.";
			}
		} catch (e) {
			console.error('Invite failed:', e);
			actionError = 'Network error. Check your connection and try again.';
		} finally {
			invitingGuest = false;
		}
	}

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
		deleting = false;
		swipe = createSwipeState();
		dispatch('close');
		onClose();
	}

	function beginDelete() {
		if (deleting) return;
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
		// A double tap must not fire two DELETEs — the second is a 404 behind
		// a modal that has already closed, so the user never sees it.
		if (deleting) return;
		deleting = true;
		actionError = '';
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
		} finally {
			deleting = false;
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
			{deleting}
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
					{#if attendanceLoading && !hasAttendance}
						<div
							class="border-t border-slate-100 px-4 py-4 sm:px-6"
							data-testid="attendee-skeleton"
							role="status"
							aria-label="Loading attendees"
						>
							<div class="mb-4 h-4 w-24 animate-pulse rounded bg-slate-100"></div>
							<div class="mb-3 flex flex-wrap gap-1.5">
								{#each Array.from({ length: 3 }, (_, i) => i) as i (i)}
									<div class="h-7 w-24 animate-pulse rounded-full bg-slate-100"></div>
								{/each}
							</div>
							<div class="flex flex-wrap gap-1.5">
								{#each Array.from({ length: 2 }, (_, i) => i) as i (i)}
									<div class="h-7 w-20 animate-pulse rounded-full bg-slate-100"></div>
								{/each}
							</div>
						</div>
					{:else if hasAttendance}
						<EventAttendeeGroups
							going={goingList}
							maybe={maybeList}
							notGoing={notGoingList}
							undecided={undecidedList}
							guests={guestRows}
							onInvite={inviteGuest}
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
					{deleting}
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
