<!--
	ONE Filters sheet at every width (#128 gap 8): a bottom sheet on a phone and
	the SAME sheet, centred at 26rem, from 640px. It carries both reading axes —
	calendars and people — because "what do I see" is one question with two
	answers, and one trigger with one count says so.

	The footer copy says it is a reading filter: hiding never writes the
	default-calendar setting, and a switched-off person's count reads `–` (they
	are not drawn, so there is nothing left to count).
-->
<script lang="ts">
	import type { CalendarPageCalendar } from '../calendarPage.contract';
	import type { CalendarAssigneeRef } from '../calendarPage.people.rules';

	interface Props {
		open: boolean;
		calendars: readonly CalendarPageCalendar[];
		hiddenCalendarIds: readonly string[];
		assignees: readonly (CalendarAssigneeRef & { count: number })[];
		hiddenAssigneeIds: readonly string[];
		onclose: () => void;
		ontogglecalendar: (id: string) => void;
		onhideall: (hide: boolean) => void;
		ontoggleassignee: (id: string) => void;
		onshoweveryone: () => void;
	}

	let {
		open,
		calendars,
		hiddenCalendarIds,
		assignees,
		hiddenAssigneeIds,
		onclose,
		ontogglecalendar,
		onhideall,
		ontoggleassignee,
		onshoweveryone
	}: Props = $props();

	const filterable = $derived(calendars.filter((calendar) => calendar.id));
	const allHidden = $derived(
		filterable.length > 0 && filterable.every((calendar) => hiddenCalendarIds.includes(calendar.id))
	);
</script>

{#if open}
	<button
		type="button"
		data-testid="calendar-filter-backdrop"
		aria-label="Dismiss the calendar filter sheet"
		tabindex="-1"
		onclick={onclose}
		class="fixed inset-0 z-[55] cursor-default bg-slate-900/30"
	></button>
	<div
		data-testid="calendar-filter-panel"
		role="dialog"
		aria-label="Filters"
		class="fixed inset-x-0 bottom-0 z-[60] flex max-h-[88vh] flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-[26rem] sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
	>
		<div
			data-testid="calendar-filter-grab"
			class="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden"
			aria-hidden="true"
		></div>
		<div class="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-3">
			<h2 class="m-0 text-base font-bold text-slate-900">Filters</h2>
			<button
				type="button"
				aria-label="Close calendar filter"
				onclick={onclose}
				class="-mr-0.5 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
			{#if filterable.length > 0}
				<div class="flex items-center justify-between gap-2 pb-1">
					<span class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
						Calendars
					</span>
					<button
						type="button"
						data-testid="calendar-filter-all"
						onclick={() => onhideall(!allHidden)}
						class="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-semibold text-primary-700 transition-colors hover:bg-primary-50"
					>
						{allHidden ? 'Show all' : 'Hide all'}
					</button>
				</div>
				{#each filterable as calendar (calendar.id)}
					{@const on = !hiddenCalendarIds.includes(calendar.id)}
					<button
						type="button"
						role="switch"
						aria-checked={on}
						aria-label={on ? `Hide ${calendar.name}` : `Show ${calendar.name}`}
						onclick={() => ontogglecalendar(calendar.id)}
						class="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50 {on
							? ''
							: 'bg-slate-50'}"
					>
						<span
							class="h-3 w-3 shrink-0 rounded-full {on ? '' : 'opacity-30 grayscale'}"
							style="background-color: {calendar.color || '#94a3b8'};"
							aria-hidden="true"
						></span>
						<span
							class="min-w-0 flex-1 truncate text-sm {on
								? 'text-slate-700'
								: 'text-slate-400 line-through'}"
						>
							{calendar.name}
						</span>
						<span
							class="flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors {on
								? 'bg-primary-600'
								: 'border border-slate-300 bg-white'}"
							aria-hidden="true"
						>
							<span
								class="h-3 w-3 rounded-full bg-white shadow-sm transition-transform {on
									? 'translate-x-3'
									: 'translate-x-0'}"
							></span>
						</span>
					</button>
				{/each}
				<p class="pt-1.5 text-[11px] leading-snug text-slate-400">
					Hidden calendars drop their events and their due tasks from every view. This is a reading
					filter — new events still go to your default calendar.
				</p>
			{/if}

			<div
				data-testid="assignee-filter"
				class="mt-1 flex flex-col gap-0.5 border-t border-slate-200 pt-1.5 {filterable.length > 0
					? ''
					: 'border-t-0 pt-0'}"
			>
				<div class="flex items-center justify-between gap-2 pb-1">
					<span class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
						Assignee
					</span>
					{#if hiddenAssigneeIds.length > 0}
						<button
							type="button"
							data-testid="assignee-filter-all"
							onclick={onshoweveryone}
							class="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-semibold text-primary-700 transition-colors hover:bg-primary-50"
						>
							Show everyone
						</button>
					{/if}
				</div>
				{#if assignees.length === 0}
					<p data-testid="assignee-nobody" class="text-[11px] leading-snug text-slate-400">
						Nobody has anything on this calendar yet, so there is nobody to filter by. The people
						who put something here will show up.
					</p>
				{:else}
					{#each assignees as person (person.id)}
						{@const on = !hiddenAssigneeIds.includes(person.id)}
						<button
							type="button"
							data-testid="assignee-row"
							aria-pressed={on}
							aria-label={`${person.name}, ${on ? `${person.count} ${person.count === 1 ? 'item' : 'items'}` : 'switched off'}`}
							onclick={() => ontoggleassignee(person.id)}
							class="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50 {on
								? ''
								: 'bg-slate-50'}"
						>
							<span
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700 {on
									? ''
									: 'opacity-40 grayscale'}"
								aria-hidden="true"
							>
								{person.name.slice(0, 1).toUpperCase()}
							</span>
							<span
								class="min-w-0 flex-1 truncate text-sm {on
									? 'text-slate-700'
									: 'text-slate-400 line-through'}"
							>
								{person.name}
							</span>
							<span class="shrink-0 text-xs font-semibold tabular-nums text-slate-400">
								{on ? person.count : '–'}
							</span>
						</button>
					{/each}
					<p class="pt-1.5 text-[11px] leading-snug text-slate-400">
						Switched-off people drop their events and their due tasks from every view. The number is
						what is left on the calendar now, so a 0 is why the grid is empty.
					</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
