<!--
	The event form body: Quick Add (create only), Title/Description, and — after
	Show More, in edit mode, or when the parser detected a date/time/location/
	attendee — the date/time, location, attendee and calendar fields. Edit mode
	adds the read-only RSVP list; a caller may pass a checklist snippet (tasks
	owns that region, so it arrives from the screen).

	The draft lives in `CalendarEventFormState`; the RSVP rows arrive as a prop
	(the modal's state owns them). This component owns only which sections are
	open.

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { CalendarApi } from '../calendar.api';
	import type { CalendarAttendanceRow } from '../calendar.eventView.rules';
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
		/** The event's attendance rows: the edit form's read-only RSVP list. */
		attendees?: readonly CalendarAttendanceRow[];
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
		state: form,
		api,
		attendees = [],
		deleting = false,
		attachedTaskCount = 0,
		onclose,
		onsave,
		ondeletescope,
		oncreateall,
		onreportphrase,
		checklist
	}: Props = $props();

	let showMore = $state(!!form.fields.date);
	/** "Show Less" hides parser-detected fields until a fresh parse re-detects. */
	let nlpCollapsed = $state(false);
	let showDeleteConfirm = $state(false);
	/** Which half of a series an edit saves to (this occurrence is the default). */
	let editScope = $state<'this' | 'all'>('this');

	const isEdit = $derived(form.isEdit);
	const showDetected = $derived(
		!nlpCollapsed &&
			(form.isDetected('date') ||
				form.isDetected('startTime') ||
				form.isDetected('location') ||
				form.isDetected('attendants'))
	);
	const showDetails = $derived(isEdit || showMore || showDetected);

	// The parse site reveals what it found: detected fields must be visible for
	// the user to correct them (MODALS_SPEC: "Show More" on detection).
	$effect(() => {
		if (!isEdit && !showMore && form.lastParse && showDetected) showMore = true;
	});

	const submitBlockedReason = $derived(
		form.endBeforeStart || form.endDateBeforeStart ? 'End must be after start' : undefined
	);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const outcome = await form.save(editScope);
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
			<CalendarEventQuickAdd state={form} {oncreateall} {onreportphrase} />
		{/if}

		<CalendarEventTitleFields
			fields={form.fields}
			{isEdit}
			{showMore}
			detected={form.isDetected.bind(form)}
			onpatch={form.patch.bind(form)}
			onshowmore={() => {
				showMore = true;
				nlpCollapsed = false;
			}}
		/>

		{#if showDetails}
			{#if showMore || isEdit}
				<CalendarEventDateTimeFields
					fields={form.fields}
					detected={form.isDetected.bind(form)}
					isRecurringOccurrence={form.isRecurringOccurrence}
					{editScope}
					onpatch={form.patch.bind(form)}
					onscopeselect={(scope) => (editScope = scope)}
				/>
			{/if}
			<CalendarEventMetaFields
				fields={form.fields}
				detected={form.isDetected.bind(form)}
				{isEdit}
				{showMore}
				showAttendees={isEdit || showMore || form.isDetected('attendants')}
				members={[...form.invitedUsers, ...form.members]}
				recent={form.recentAttendants}
				calendars={form.calendars}
				{api}
				onpatch={form.patch.bind(form)}
				ontoggleattendee={form.toggleAttendant.bind(form)}
				oninvitetype={form.setInviteType.bind(form)}
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
		<CalendarEventRsvpList rows={attendees} />
	{/if}

	{#if checklist}
		{@render checklist({ eventId: isEdit ? form.masterId : null })}
	{/if}

	{#if showDeleteConfirm}
		<CalendarEventDeleteConfirm
			isRecurringOccurrence={form.isRecurringOccurrence}
			{attachedTaskCount}
			deleting={deleting}
			ondeleteoccurrence={() => ondeletescope('this')}
			ondeleteseries={() => ondeletescope('all')}
			ondeletesingle={() => ondeletescope('all')}
			oncancel={() => (showDeleteConfirm = false)}
		/>
	{/if}

	{#if form.error}
		<div class="px-5 pb-3">
			<p role="alert" class="text-sm text-red-600">{form.error}</p>
		</div>
	{/if}
</form>

<CalendarEventActionBar
	{isEdit}
	submitting={form.saving}
	canSubmit={form.canSubmit}
	{submitBlockedReason}
	ondelete={() => (showDeleteConfirm = true)}
	onclose={() => {
		showDeleteConfirm = false;
		onclose();
	}}
	onclear={() => form.reset()}
/>
