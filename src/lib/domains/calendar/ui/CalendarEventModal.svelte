<!--
	The event sheet: the detail region (facts, series, your RSVP, who is going,
	guests note, action bar) or — after Edit, and always from a create call — the
	event form. One `Session`, built on kernel `Sheet`, folds the legacy
	EventModalShell + BottomSheetHandle + header/close (#039).

	The screen passes the api, toasts, parser and roster in; the sheet owns the
	two state classes (`CalendarEventModalState` for the detail region,
	`CalendarEventFormState` per edit session) and reports `onchanged` after
	every successful write so the page can refresh.

	The state classes are built once per mount from the props they receive, so a
	screen that opens different events from one component must key it per open
	(`{#key openEvent?.id}…{/key}`) — that also resets the edit form.

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { DateTime } from 'luxon';
	import Sheet from '$lib/kernel/ui/Sheet.svelte';
	import type { Toasts } from '$lib/kernel/client/toasts.svelte';
	import type { CalendarApi } from '../calendar.api';
	import {
		calendarSeriesFacts,
		calendarNameForEvent,
		type CalendarAttendanceRow,
		type CalendarEventView,
		type CalendarGuestRow
	} from '../calendar.eventView.rules';
	import {
		CalendarEventFormState,
		calendarSavedToast,
		type CalendarFamilyMember,
		type CalendarParseEvent,
		type CalendarSaveOutcome
	} from '../calendar.eventForm.state.svelte';
	import { CalendarEventModalState } from '../calendar.eventModal.state.svelte';
	import CalendarEventAttendeeGroups from './CalendarEventAttendeeGroups.svelte';
	import CalendarEventDetail from './CalendarEventDetail.svelte';
	import CalendarEventExportMenu from './CalendarEventExportMenu.svelte';
	import CalendarEventForm from './CalendarEventForm.svelte';
	import CalendarEventGuestNote from './CalendarEventGuestNote.svelte';
	import CalendarEventModalBar from './CalendarEventModalBar.svelte';
	import CalendarEventRsvpRow from './CalendarEventRsvpRow.svelte';
	import CalendarEventSeriesCard from './CalendarEventSeriesCard.svelte';

	interface Props {
		open: boolean;
		/** Absent opens a create form (`initialDate`/`initialTitle` may seed it). */
		event?: CalendarEventView | null;
		api: CalendarApi;
		toasts: Toasts;
		calendars: readonly { id: string; name: string; color?: string | null }[];
		familyMembers?: readonly CalendarFamilyMember[];
		defaultCalendarId?: string | null;
		initialDate?: string;
		initialTitle?: string;
		viewerId?: string | null;
		attendees?: readonly CalendarAttendanceRow[];
		guests?: readonly CalendarGuestRow[] | null;
		userRsvpStatus?: string;
		parseEvent?: CalendarParseEvent | null;
		autoParse?: boolean;
		/** The viewer's clock, passed in by the screen (R5). */
		now: Date;
		attachedTaskCount?: number;
		onclose: () => void;
		onchanged?: () => void;
		onreportphrase?: () => void;
		/** The tasks checklist, composed by the screen (tasks owns it). */
		checklist?: Snippet<[{ eventId: string | null }]>;
	}

	let {
		open,
		event = null,
		api,
		toasts,
		calendars,
		familyMembers = [],
		defaultCalendarId = null,
		initialDate,
		initialTitle,
		viewerId = null,
		attendees = [],
		guests = null,
		userRsvpStatus = 'undecided',
		parseEvent = null,
		autoParse = true,
		now,
		attachedTaskCount = 0,
		onclose,
		onchanged,
		onreportphrase,
		checklist
	}: Props = $props();

	let showEditForm = $state(false);
	let form = $state<CalendarEventFormState | null>(null);
	let deleteScope = $state<'this' | 'all'>('this');
	/** A create session (no event) starts in the form. */
	let creating = $state(false);

	const modal = event
		? new CalendarEventModalState(api, toasts, viewerId, {
				event,
				attendees,
				guests,
				userRsvpStatus
			})
		: null;

	const clock = DateTime.fromJSDate(now);
	const series = $derived(event ? calendarSeriesFacts(event, clock) : null);
	const calendarName = $derived(event ? calendarNameForEvent(event, calendars) : '');
	const title = $derived(
		showEditForm || creating ? (event ? 'Edit Event' : 'Create New Event') : (event?.title ?? '')
	);
	const subtitle = $derived(
		showEditForm || creating
			? !event
				? "Type naturally, we'll fill in the rest"
				: undefined
			: series
				? `🔁 Repeats — ${series.rule}`
				: undefined
	);

	function beginCreate() {
		creating = true;
		showEditForm = true;
		form = new CalendarEventFormState(api, parseEvent, {
			event: null,
			calendars,
			familyMembers,
			defaultCalendarId,
			initialDate,
			initialTitle,
			autoParse
		});
	}

	// Absent an event the sheet is a create form from the first open.
	$effect(() => {
		if (open && !event && !form) beginCreate();
	});

	function beginEdit() {
		if (!event || !modal) return;
		showEditForm = true;
		form = new CalendarEventFormState(api, parseEvent, {
			event,
			calendars,
			familyMembers,
			defaultCalendarId,
			autoParse
		});
		// Invites already on the event are known: sending them back is safe.
		form.prefillInvites([
			...modal.attendees,
			...modal.guests.map((guest) => ({
				userId: null,
				status: guest.status,
				name: guest.name,
				inviteType: guest.inviteType ?? null
			}))
		]);
	}

	$effect(() => {
		if (open && modal && !showEditForm && !modal.attendeesLoaded) void modal.refreshAttendance();
	});

	function close() {
		showEditForm = false;
		creating = false;
		form = null;
		onclose();
	}

	async function remove(scope?: 'this' | 'all') {
		if (!modal) return;
		if (await modal.remove(scope)) {
			onchanged?.();
			close();
		}
	}

	async function duplicate() {
		if (!modal) return;
		if (await modal.duplicate()) {
			onchanged?.();
			close();
		}
	}

	function saved(outcome: CalendarSaveOutcome) {
		// #223: the `event` prop is stale after a save, so an edit closes and
		// names its result instead of returning to the old detail view.
		if (event) toasts.success(calendarSavedToast(outcome.body.title));
		onchanged?.();
		close();
	}

	async function createAll() {
		const outcomes = (await form?.createAllParsed()) ?? [];
		if (outcomes.length > 0) {
			onchanged?.();
			close();
		}
	}
</script>

<Sheet
	{open}
	onclose={close}
	{title}
	{subtitle}
	variant="bottom"
	swipeToClose={!showEditForm}
	testid="event-modal"
>
	{#if showEditForm && form}
		<CalendarEventForm
			state={form}
			{api}
			deleting={modal?.deleting ?? false}
			{attachedTaskCount}
			onclose={close}
			onsave={saved}
			ondeletescope={(scope) => void remove(scope)}
			oncreateall={() => void createAll()}
			{onreportphrase}
			{checklist}
		/>
	{:else if event && modal}
		<div class="flex items-center justify-end gap-2 border-b border-slate-100 px-4 py-1.5 sm:px-6">
			{#if !event.isAd}
				<CalendarEventExportMenu {event} />
			{/if}
		</div>

		<CalendarEventDetail {event} {calendarName} />

		<CalendarEventSeriesCard
			{event}
			{deleteScope}
			now={clock}
			scopes={modal.scopes}
			onscope={(scope) => {
				deleteScope = scope;
			}}
		/>

		<CalendarEventRsvpRow state={modal} />

		{#if modal.attendanceLoading && !modal.hasAttendance}
			<div
				class="border-t border-slate-100 px-4 py-4 sm:px-6"
				data-testid="attendee-skeleton"
				role="status"
				aria-label="Loading attendees"
			>
				<div class="mb-4 h-4 w-24 animate-pulse rounded bg-slate-100"></div>
				<div class="mb-3 flex flex-wrap gap-1.5">
					{#each Array.from({ length: 3 }, (_, index) => index) as index (index)}
						<div class="h-7 w-24 animate-pulse rounded-full bg-slate-100"></div>
					{/each}
				</div>
			</div>
		{:else if modal.hasAttendance}
			<CalendarEventAttendeeGroups state={modal} />
		{/if}

		{#if !event.isAd && checklist}
			{@render checklist({ eventId: event.masterId || event.id })}
		{/if}

		<CalendarEventGuestNote guestCount={modal.guests.length} />

		{#if modal.actionError}
			<div class="px-4 pb-3 sm:px-6">
				<p role="alert" class="text-sm text-red-600">{modal.actionError}</p>
			</div>
		{/if}

		<CalendarEventModalBar
			isRecurring={!!event.recurrenceFrequency}
			{deleteScope}
			{attachedTaskCount}
			eventTitle={event.title}
			duplicating={modal.duplicating}
			deleting={modal.deleting}
			ondelete={(scope) => void remove(scope)}
			onduplicate={() => void duplicate()}
			onedit={beginEdit}
		/>
	{/if}
</Sheet>
