<!--
	The calendar event sheet the glance rows open, in its own lazily imported
	chunk: the sheet brings calendar's form/modal state, its contract schemas
	and luxon, none of which the dashboard's first paint needs. The page
	`{#await import(…)}`s this file on the first row click and keeps the overlay
	empty until it lands, so the band never shifts.

	Behaviour stays calendar's: this component only builds the api client, reads
	the calendar list once and forwards the roster.
-->
<script lang="ts">
	import { createApiClient } from '$lib/kernel/client/apiClient';
	import type { Toasts } from '$lib/kernel/client/toasts.svelte';
	import { createCalendarApi } from '$lib/domains/calendar';
	import { CalendarEventModal } from '$lib/domains/calendar/ui';
	import type { DashboardDayEventRow, DashboardRosterRow } from '../dayDashboard.contract';

	interface Props {
		event: DashboardDayEventRow;
		roster: readonly DashboardRosterRow[];
		meId: string;
		now: Date;
		toasts: Toasts;
		refresh: () => Promise<void>;
		onclose: () => void;
	}

	let { event, roster, meId, now, toasts, refresh, onclose }: Props = $props();

	const api = createCalendarApi(createApiClient());
	let calendars = $state<{ id: string; name: string; color: string }[]>([]);

	// One read per open; a second open reuses the list (the sheet is keyed by event).
	$effect(() => {
		let live = true;
		void api.listCalendars().then((result) => {
			if (!live || !result.ok) return;
			calendars = result.data.calendars.map((calendar) => ({
				id: calendar.id,
				name: calendar.name,
				color: calendar.color
			}));
		});
		return () => {
			live = false;
		};
	});
</script>

<CalendarEventModal
	open={true}
	event={event}
	{api}
	{toasts}
	{calendars}
	familyMembers={roster.map((member) => ({
		userId: member.userId,
		firstName: member.firstName,
		lastName: member.lastName,
		email: member.email ?? undefined
	}))}
	viewerId={meId}
	{now}
	{onclose}
	onchanged={() => void refresh()}
/>
