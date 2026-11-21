<!--
	The event form body: Quick Add (create only), Title/Description, and — after
	Show More, in edit mode, or when the parser detected a date/time/location/
	attendee — the date/time, location, attendee and calendar fields. Edit mode
	adds the read-only RSVP list; a caller may pass a checklist snippet (tasks
	owns that region, so it arrives from the screen).

	All values live in `CalendarEventFormState`; this component owns only which
	sections are open.

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { CalendarApi } from '../calendar.api';
	import type {
		CalendarEventFormState,
		CalendarSaveOutcome
	} from '../calendar.eventForm.state.svelte';
	import CalendarEventActionBar from './CalendarEventActionBar.svelte';
	import CalendarEventDateTimeFields from './CalendarEventDateTimeFields.svelte';
	import CalendarEventDeleteConfirm from './CalendarEventDeleteConfirm.svelte';
	import CalendarEventMetaFields from './CalendarEventMetaFields.svelte';
	import CalendarEventQuickAdd from './CalendarEventQuickAdd.svelte';
	import CalendarEventRsvpList from './CalendarEventRsvpList.svelte';
	import CalendarEventTitleFields from './CalendarEventTitleFields.svelte';

	interface Props {
		state: CalendarEventFormState;
		api: CalendarApi;
		/** A DELETE is in flight (the modal's state owns the flag). */
		deleting?: boolean;
		attachedTaskCount?: number;
		onclose: () => void;
		onsave: (outcome: CalendarSaveOutcome) => void;
		ondeletescope: (scope: 'this' | 'all') => void;
		oncreateall: () => void;
		onreportphrase?: () => void;
		/** The tasks checklist for this event, composed by the screen. */
		checklist?: Snippet<[{ eventId: string | null }]>;
	}

	let {
		state,
		api,
		deleting = false,
		attachedTaskCount = 0,
		onclose,
		onsave,
		ondeletescope,
		oncreateall,
		onreportphrase,
		checklist
	}: Props = $props();

	let showMore = $state(!!state.fields.date);
	/** "Show Less" hides parser-detected fields until a fresh parse re-detects. */
	let nlpCollapsed = $state(false);
	let showDeleteConfirm = $state(false);
	/** Which half of a series an edit saves to (this occurrence is the default). */
	let editScope = $state<'this' | 'all'>('this');

	const isEdit = $derived(state.isEdit);
	const showDetected = $derived(
		!nlpCollapsed &&
			(state.isDetected('date') ||
				state.isDetected('startTime') ||
				state.isDetected('location') ||
				state.isDetected('attendants'))
	);
	const showDetails = $derived(isEdit || showMore || showDetected);

	// The parse site reveals what it found: detected fields must be visible for
	// the user to correct them (MODALS_SPEC: "Show More" on detection).
	$effect(() => {
		if (!isEdit && !showMore && state.lastParse && showDetected) showMore = true;
	});

	const submitBlockedReason = $derived(
		state.endBeforeStart || state.endDateBeforeStart ? 'End must be after start' : undefined
	);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const outcome = await state.save(editScope);
		if (outcome) onsave(outcome);
	}
</script>

<form
	id="event-form"
	onsubmit={submit}
	class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
	data-testid="event-form"
>
	<div class="space-y-3 p-5">
		{#if !isEdit}
			<CalendarEventQuickAdd {state} {oncreateall} {onreportphrase} />
		{/if}

		<CalendarEventTitleFields
			fields={state.fields}
			{isEdit}
			{showMore}
			detected={state.isDetected.bind(state)}
			onpatch={state.patch.bind(state)}
			onshowmore={() => {
				showMore = true;
				nlpCollapsed = false;
			}}
		/>

		{#if showDetails}
			{#if showMore || isEdit}
				<CalendarEventDateTimeFields
					fields={state.fields}
					detected={state.isDetected.bind(state)}
					isRecurringOccurrence={state.isRecurringOccurrence}
					{editScope}
					onpatch={state.patch.bind(state)}
					onscopeselect={(scope) => (editScope = scope)}
				/>
			{/if}
			<CalendarEventMetaFields
				fields={state.fields}
				detected={state.isDetected.bind(state)}
				{isEdit}
				{showMore}
				showAttendees={isEdit || showMore || state.isDetected('attendants')}
				members={[...state.invitedUsers, ...state.members]}
				recent={state.recentAttendants}
				calendars={state.calendars}
				{api}
				onpatch={state.patch.bind(state)}
				ontoggleattendee={state.toggleAttendant.bind(state)}
				oninvitetype={state.setInviteType.bind(state)}
			/>
		{/if}
	</div>

	{#if !isEdit && showMore}
		<div class="px-5 pb-3">
			<button
				type="button"
				onclick={() => {
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

	{#if isEdit}
		<CalendarEventRsvpList rows={state.attendees} />
	{/if}

	{#if checklist}
		{@render checklist({ eventId: isEdit ? state.masterId : null })}
	{/if}

	{#if showDeleteConfirm}
		<CalendarEventDeleteConfirm
			isRecurringOccurrence={state.isRecurringOccurrence}
			{attachedTaskCount}
			deleting={deleting}
			ondeleteoccurrence={() => ondeletescope('this')}
			ondeleteseries={() => ondeletescope('all')}
			ondeletesingle={() => ondeletescope('all')}
			oncancel={() => (showDeleteConfirm = false)}
		/>
	{/if}

	{#if state.error}
		<div class="px-5 pb-3">
			<p role="alert" class="text-sm text-red-600">{state.error}</p>
		</div>
	{/if}
</form>

<CalendarEventActionBar
	{isEdit}
	submitting={state.saving}
	canSubmit={state.canSubmit}
	{submitBlockedReason}
	ondelete={() => (showDeleteConfirm = true)}
	onclose={() => {
		showDeleteConfirm = false;
		onclose();
	}}
	onclear={() => state.reset()}
/>
