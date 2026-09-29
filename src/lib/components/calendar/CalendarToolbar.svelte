<script lang="ts">
	import type { CalendarView } from './calendarView';
	import type { CalendarRef } from '$lib/utils/calendarVisibility';
	import { allCalendarIds } from '$lib/utils/calendarVisibility';

	interface Props {
		currentMonthYear: string;
		currentYear: number;
		currentMonth: number;
		months: string[];
		view: CalendarView;
		selectionMode: boolean;
		addMode: boolean;
		/** YYYY-MM-DD for the dashboard deep link. */
		dashboardDate: string;
		/** #069: calendars the view filter can switch off. */
		calendars?: CalendarRef[];
		hiddenCalendarIds?: string[];
		onToday: () => void;
		onPrevious: () => void;
		onNext: () => void;
		onMonthSelect: (month: number) => void;
		onYearSelect: (year: number) => void;
		onViewChange: (view: CalendarView) => void;
		onToggleSelectionMode: (on: boolean) => void;
		onToggleAddMode: (on: boolean) => void;
		onToggleCalendar: (id: string) => void;
		/** Hide every calendar, or show every one — one tap either way. */
		onSetAllHidden: (hide: boolean) => void;
	}

	let {
		currentMonthYear,
		currentYear,
		currentMonth,
		months,
		view,
		selectionMode,
		addMode,
		dashboardDate,
		calendars = [],
		hiddenCalendarIds = [],
		onToday,
		onPrevious,
		onNext,
		onMonthSelect,
		onYearSelect,
		onViewChange,
		onToggleSelectionMode,
		onToggleAddMode,
		onToggleCalendar,
		onSetAllHidden
	}: Props = $props();

	const views = [
		{
			id: 'month',
			label: 'Month',
			icon: 'M3 3h18v18H3V3zm0 7.5h18v6.5H3v-6.5zm0 7.5h18v1.5H3v-1.5z'
		},
		{
			id: 'week',
			label: 'Week',
			icon: 'M3 3h18v18H3V3zm0 7.5h18v12H3v-12zm2.5 2v8h2v-8h-2zm4 0v8h2v-8h-2zm4 0v8h2v-8h-2z'
		},
		{ id: 'list', label: 'List', icon: 'M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z' }
	] as const;

	let showMiniPicker = $state(false);
	// #069: the popover hangs off the toolbar root, not off the horizontally
	// scrolling action strip, so a scrolled strip can never clip it.
	let showCalendarFilter = $state(false);

	const filterableCalendars = $derived(calendars.filter((c) => c.id));
	const allHidden = $derived(
		filterableCalendars.length > 0 &&
			allCalendarIds(filterableCalendars).every((id) => hiddenCalendarIds.includes(id))
	);

	function closeMiniPicker() {
		showMiniPicker = false;
	}

	function closeCalendarFilter() {
		showCalendarFilter = false;
	}

	function handlePickerOutsideClick(e: MouseEvent) {
		const target = e.target instanceof Element ? e.target : null;
		if (showMiniPicker && !target?.closest('[data-testid="mini-picker-container"]')) {
			closeMiniPicker();
		}
		if (
			showCalendarFilter &&
			!target?.closest('[data-testid="calendar-filter-trigger"]') &&
			!target?.closest('[data-testid="calendar-filter-panel"]')
		) {
			closeCalendarFilter();
		}
	}
</script>

<svelte:window
	on:click={handlePickerOutsideClick}
	on:keydown={(e) => {
		if (e.key !== 'Escape') return;
		closeMiniPicker();
		closeCalendarFilter();
	}}
/>

<div
	class="relative mb-6 flex flex-col items-center gap-3 px-4 sm:flex-row sm:flex-wrap sm:justify-between sm:gap-x-4 sm:gap-y-2"
>
	<div class="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
		<!-- Nav cluster: Today / prev / next as one joined control -->
		<div class="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<button
				type="button"
				onclick={onToday}
				class="px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200"
			>
				Today
			</button>
			<button
				type="button"
				onclick={onPrevious}
				class="flex h-10 w-11 items-center justify-center text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 active:bg-slate-200"
				aria-label="Previous"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
				</svg>
			</button>
			<button
				type="button"
				onclick={onNext}
				class="flex h-10 w-11 items-center justify-center text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 active:bg-slate-200"
				aria-label="Next"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
				</svg>
			</button>
		</div>

		<!-- Mini Month Picker -->
		<div class="relative" data-testid="mini-picker-container">
			<button
				type="button"
				onclick={() => (showMiniPicker = !showMiniPicker)}
				class="text-lg font-bold tracking-tight text-slate-900 transition-colors hover:text-primary-600 sm:text-2xl"
			>
				{currentMonthYear}
			</button>
			{#if showMiniPicker}
				<div class="absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
					<div class="mb-4 flex items-center justify-between">
						<button
							type="button"
							onclick={() => onYearSelect(currentYear - 1)}
							class="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
							aria-label="Previous year"
						>
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
							</svg>
						</button>
						<span class="font-semibold text-slate-900">{currentYear}</span>
						<button
							type="button"
							onclick={() => onYearSelect(currentYear + 1)}
							class="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
							aria-label="Next year"
						>
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
							</svg>
						</button>
					</div>
					<div class="grid grid-cols-3 gap-2">
						{#each months as monthName, i}
							<button
								type="button"
								onclick={() => {
									onMonthSelect(i + 1);
									closeMiniPicker();
								}}
								class="rounded-lg py-2 text-sm font-medium transition-colors {currentMonth === i + 1
									? 'bg-primary-600 text-white'
									: 'text-slate-700 hover:bg-slate-100'}"
							>
								{monthName.slice(0, 3)}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Right cluster: views + actions, one cohesive control row -->
	<div class="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto sm:flex-wrap sm:justify-end">
		<!-- View Toggle -->
		<div class="flex min-w-0 items-center gap-1 rounded-xl bg-slate-100 p-1 shadow-sm">
			{#each views as v}
				<button
					type="button"
					onclick={() => onViewChange(v.id)}
					class="flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-all active:scale-[0.97] {view === v.id
						? 'bg-white text-slate-900 shadow-sm'
						: 'text-slate-500 hover:text-slate-900'}"
				>
					<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
						<path d={v.icon} />
					</svg>
					<span class="sr-only sm:not-sr-only">{v.label}</span>
				</button>
			{/each}
		</div>

		<!-- Add mode toggle (#047): explicit mobile range-select -->
		<button
			type="button"
			onclick={() => onToggleAddMode(!addMode)}
			aria-pressed={addMode}
			title="Add by dragging a time range"
			class="flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-all active:scale-[0.97] {addMode
				? 'border-primary-300 bg-primary-50 text-primary-700'
				: 'border-slate-200 bg-white text-slate-400 hover:text-slate-800'}"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 4v16m8-8H4"
				/>
			</svg>
			<span class="sr-only sm:not-sr-only">Add</span>
		</button>

		<!-- Selection mode toggle -->
		<button
			type="button"
			onclick={() => onToggleSelectionMode(!selectionMode)}
			aria-pressed={selectionMode}
			title="Select events to edit in bulk"
			class="flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-all active:scale-[0.97] {selectionMode
				? 'border-primary-300 bg-primary-50 text-primary-700'
				: 'border-slate-200 bg-white text-slate-400 hover:text-slate-800'}"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 002-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
				/>
			</svg>
			<span class="sr-only sm:not-sr-only">Select</span>
		</button>

		<!-- Actions: calendars · import · print · dashboard · settings -->
		<div class="flex min-w-0 max-w-full items-center divide-x divide-slate-200 overflow-x-auto overflow-y-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<!-- #069: the calendar filter. Leads the strip so it survives the
				narrow-width scroll, and carries a count when calendars are off
				— otherwise a filter that hides half the week is invisible. -->
			{#if filterableCalendars.length > 0}
				<button
					type="button"
					data-testid="calendar-filter-trigger"
					onclick={() => (showCalendarFilter = !showCalendarFilter)}
					aria-expanded={showCalendarFilter}
					aria-label="Calendars"
					title="Choose which calendars to show"
					class="flex h-10 w-11 items-center justify-center text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3 5h18M6 12h12M10 19h4"
						/>
					</svg>
					{#if hiddenCalendarIds.length > 0}
						<span
							class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-700 px-1 text-[10px] font-bold leading-none text-white"
							aria-hidden="true"
						>
							{hiddenCalendarIds.length}
						</span>
					{/if}
				</button>
			{/if}
			<a
				href="/calendar/import"
				class="flex h-10 w-11 items-center justify-center text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary-600"
				aria-label="Import events from a file"
				title="Import from Google / Apple / Outlook (.ics)"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
				</svg>
			</a>
			<a
				href="/calendar/print"
				class="flex h-10 w-11 items-center justify-center text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
				aria-label="Print month for the fridge"
				title="Print for the fridge"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
					/>
				</svg>
			</a>
			<a
				href="/calendar/dashboard?date={dashboardDate}"
				class="flex h-10 w-11 items-center justify-center text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary-600"
				aria-label="Day dashboard"
				title="Day dashboard"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
				</svg>
			</a>
			<a
				href="/account#calendar"
				class="flex h-10 w-11 items-center justify-center text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
				aria-label="Calendar Settings"
				title="Calendar settings"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
					/>
					<path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
			</a>
		</div>
	</div>

	<!-- #069: the popover is a child of the toolbar ROOT, not of the scrolling
		action strip, so `overflow-x-auto` can never clip it. Anchored right and
		width-capped so it fits 320px (px-4 root padding + 0.5rem gutter). -->
	{#if showCalendarFilter && filterableCalendars.length > 0}
		<div
			data-testid="calendar-filter-panel"
			class="absolute right-4 top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
		>
			<div class="flex items-center justify-between gap-2 px-1 pb-1">
				<span class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
					Calendars
				</span>
				<button
					type="button"
					data-testid="calendar-filter-all"
					onclick={() => onSetAllHidden(!allHidden)}
					class="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-semibold text-primary-700 transition-colors hover:bg-primary-50"
				>
					{allHidden ? 'Show all' : 'Hide all'}
				</button>
			</div>
			{#each filterableCalendars as cal (cal.id)}
				{@const on = !hiddenCalendarIds.includes(cal.id)}
				<button
					type="button"
					role="switch"
					aria-checked={on}
					aria-label={on
						? `Hide ${cal.name ?? cal.id}`
						: `Show ${cal.name ?? cal.id}`}
					onclick={() => onToggleCalendar(cal.id)}
					class="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50 {on
						? ''
						: 'bg-slate-50'}"
				>
					<!-- The dot is the calendar's own colour: colour means
						"which calendar", so the key must wear it. State is carried
						by the row's mute and the switch's fill, never by hue. -->
					<span
						class="h-3 w-3 shrink-0 rounded-full {on ? '' : 'opacity-30 grayscale'}"
						style="background-color: {cal.color || '#94a3b8'};"
						aria-hidden="true"
					></span>
					<span
						class="min-w-0 flex-1 truncate text-sm {on
							? 'text-slate-700'
							: 'text-slate-400 line-through'}"
					>
						{cal.name ?? cal.id}
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
			<p class="px-2 pt-1.5 text-[11px] leading-snug text-slate-400">
				Hidden calendars drop their events and their due tasks from every view. This is a
				reading filter — new events still go to your default calendar.
			</p>
		</div>
	{/if}
</div>
