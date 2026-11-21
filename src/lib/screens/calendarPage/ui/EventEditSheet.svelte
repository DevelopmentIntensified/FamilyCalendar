<!--
	The event edit sheet, in its own lazily imported chunk: calendar's
	`CalendarEventModal` brings its form/modal state, the attendee and RSVP
	regions and luxon, and tasks' checklist brings tasks' screens — none of
	which the month grid's first paint needs. `CalendarPage` `{#await import(…)}`s
	this file when `?edit=`/a chip opens the sheet and keeps the overlay empty
	until it lands (fixed-position: nothing to reserve, so the grid cannot shift).

	Behaviour stays the domains' own: this file only composes the checklist
	snippet the sheet asks its screen for (tasks owns it, calendar renders it).
-->
<script lang="ts">
	import { CalendarEventModal } from '$lib/domains/calendar/ui';
	import { EventTaskChecklist } from '$lib/domains/tasks/ui';
	import type { CalendarApi, CalendarEventView } from '$lib/domains/calendar/index';
	import type { CalendarFamilyMember } from '$lib/domains/calendar/ui';
	import type { Toasts } from '$lib/kernel/client/toasts.svelte';

	interface Props {
		event: CalendarEventView;
		api: CalendarApi;
		toasts: Toasts;
		calendars: readonly { id: string; name: string; color?: string | null }[];
		familyMembers: readonly CalendarFamilyMember[];
		defaultCalendarId: string | null;
		viewerId: string | null;
		now: Date;
		onclose: () => void;
		onchanged: () => void;
	}

	let {
		event,
		api,
		toasts,
		calendars,
		familyMembers,
		defaultCalendarId,
		viewerId,
		now,
		onclose,
		onchanged
	}: Props = $props();
</script>

<CalendarEventModal
	open={true}
	{event}
	{api}
	{toasts}
	{calendars}
	{familyMembers}
	{defaultCalendarId}
	{viewerId}
	{now}
	{onclose}
	{onchanged}
>
	{#snippet checklist({ eventId })}
		<EventTaskChecklist {eventId} />
	{/snippet}
</CalendarEventModal>
