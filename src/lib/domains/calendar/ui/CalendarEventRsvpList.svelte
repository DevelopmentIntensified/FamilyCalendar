<!--
	The edit form's read-only RSVP region: Going / Maybe / Not Going, one line
	per group. It answers "who already answered" while the form is open, without
	the interactive buttons the detail region owns.

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	import { calendarAttendanceSplit, calendarPersonName, type CalendarAttendanceRow } from '../calendar.eventView.rules';

	interface Props {
		rows: readonly CalendarAttendanceRow[];
	}

	let { rows }: Props = $props();

	const split = $derived(calendarAttendanceSplit(rows));
	const groups = $derived([
		{ key: 'going', label: 'Going', rows: split.going, chip: 'bg-emerald-100 text-emerald-700' },
		{
			key: 'maybe',
			label: 'Maybe',
			rows: split.maybe,
			chip: 'bg-amber-100 text-amber-700'
		},
		{
			key: 'declined',
			label: 'Not Going',
			rows: split.notGoing,
			chip: 'bg-red-100 text-red-700'
		}
	]);
</script>

{#if rows.length > 0}
	<div class="border-t border-slate-100 p-5" data-testid="rsvp-list">
		<h3 class="mb-2 text-sm font-semibold text-slate-700">RSVP Status</h3>
		{#each groups as group (group.key)}
			{#if group.rows.length > 0}
				<div class="mb-2">
					<span class="text-xs font-medium text-slate-600">{group.label} ({group.rows.length}):</span>
					<div class="mt-1 flex flex-wrap gap-1">
						{#each group.rows as row (row.userId ?? row.name ?? calendarPersonName(row))}
							<span
								class="inline-flex items-center rounded-full px-2 py-0.5 text-xs {group.chip}"
							>
								{row.firstName || row.name || row.userId}
							</span>
						{/each}
					</div>
				</div>
			{/if}
		{/each}
	</div>
{/if}
