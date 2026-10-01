<script lang="ts">
	import type { CalendarView } from './calendarView';
	import DayNav from '$lib/components/DayNav.svelte';
	import type { CalendarRef } from '$lib/utils/calendarVisibility';
	import { allCalendarIds } from '$lib/utils/calendarVisibility';
	import type { AssigneeRef } from '$lib/utils/calendarAssignees';
	import { avatarColor } from '$lib/utils/avatarColor';

	/** One row of the person filter: who, and what they would keep. */
	export type AssigneeRow = AssigneeRef & { count: number };

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
		/** #127 mark 1.11: the people whose plans are on this calendar. The
		 *  counts are read from the ALREADY-filtered rows, so a 0 is the reason
		 *  the grid is empty. Owned above, exactly like the calendars. */
		assignees?: AssigneeRow[];
		hiddenAssigneeIds?: string[];
		onToggleAssignee: (id: string) => void;
		/** Show every person again — one tap out of a person filter. */
		onShowAllAssignees: () => void;
		/** #120: the query the page is filtering by. Owned above, like the
		 *  hidden-calendar list — this control never owns a filter. */
		searchQuery: string;
		onSearch: (query: string) => void;
		/** What the query kept, and what it kept it out of. Null when the
		 *  caller has no count to give (tests, print). */
		searchMatches?: number | null;
		searchTotal?: number | null;
		/** #119: is the period on screen the current one? The page knows (it
		 *  owns the date store and the view); the toolbar does not. Passed so the
		 *  shared DayNav can say so, which the hand-built copy never could. */
		isCurrentPeriod?: boolean;
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
		onSetAllHidden,
		assignees = [],
		hiddenAssigneeIds = [],
		onToggleAssignee,
		onShowAllAssignees,
		searchQuery = '',
		onSearch,
		searchMatches = null,
		searchTotal = null,
		isCurrentPeriod = false
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
	// #120: the field is on the second row at every width, so the shortcut
	// still has to find it — ⌘K on a Mac, Ctrl+K everywhere else.
	let searchInput = $state<HTMLInputElement | null>(null);

	function focusSearch() {
		searchInput?.focus();
		searchInput?.select();
	}

	const filterableCalendars = $derived(calendars.filter((c) => c.id));
	const allHidden = $derived(
		filterableCalendars.length > 0 &&
			allCalendarIds(filterableCalendars).every((id) => hiddenCalendarIds.includes(id))
	);
	// #127: one filter button for BOTH axes, and one number on it. A filter that
	// hides half your week must not be invisible whichever axis did it, and a
	// second trigger would be the "new surface" mark 1.11 did not ask for.
	const hasFilters = $derived(filterableCalendars.length > 0 || assignees.length > 0);
	const hiddenFilterCount = $derived(hiddenCalendarIds.length + hiddenAssigneeIds.length);

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
		if (e.key === 'Escape') {
			closeMiniPicker();
			closeCalendarFilter();
			return;
		}
		// Keyboard parity: the shortcut the prototype's `⌘K` pill implied is
		// real here. Never steal the key from the field it opens.
		if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey) && !e.altKey) {
			e.preventDefault();
			focusSearch();
		}
	}}
/>

<div class="relative mb-4 flex flex-col gap-2 px-4">
	<!-- ROW 1 — the controls. `1fr auto 1fr` is what makes "centred" true rather
	     than hoped for: the middle column is the centre of the toolbar whatever
	     the view toggle and the action strip weigh. Below `sm` it collapses to
	     one column and the date control — the thing you came here to move —
	     is first, because `order` decides the stack, not the DOM. -->
	<div data-testid="toolbar-controls-row" class="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
		<!-- ROW 1 · left: the view toggle -->
		<div class="order-2 flex min-w-0 items-center gap-2 sm:order-1 sm:justify-start">
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
		</div>

		<!-- ROW 1 · middle: THE DATE CONTROL.
		     #120 marks 1.16 and 1.17 are one complaint — the month label, the
		     arrow pair and Today were three loose pieces, and the label was not
		     even in the toolbar's centre. They are one object now.

		     #119 then closed the loop: the arrows and Today are not built here
		     either. They are `DayNav` — the control #118 extracted so this header
		     and the dashboard header cannot drift apart, and which this toolbar
		     was still hand-rolling beside. The label goes in as the pill's LEADING
		     segment, so the whole thing stays ONE control with ONE ring and there
		     is no second "Today" left to drift. -->
		<div
			data-testid="date-nav"
			class="order-1 flex items-center justify-center sm:order-2"
		>
			<DayNav period="period" isToday={isCurrentPeriod} {onToday} {onPrevious} {onNext}>
				{#snippet leading()}
					<!-- Mini Month Picker: the label is the control that names the period -->
					<div class="relative min-w-0" data-testid="mini-picker-container">
				<button
					type="button"
					onclick={() => (showMiniPicker = !showMiniPicker)}
					aria-expanded={showMiniPicker}
					class="px-3 py-2.5 text-lg font-bold tracking-tight text-slate-900 transition-colors hover:bg-slate-100 active:bg-slate-200 sm:px-4 sm:text-2xl"
				>
					{currentMonthYear}
				</button>
				{#if showMiniPicker}
					<div class="absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
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

					<!-- The rule between the label and the pager. Inside the pill,
					     so the label reads as a segment of the control rather than a
					     button that happens to sit near one. -->
					<span class="h-6 w-px shrink-0 bg-slate-200" aria-hidden="true"></span>
				{/snippet}
			</DayNav>
		</div>

		<!-- ROW 1 · right: the modes and the actions -->
		<div
			class="order-3 flex min-w-0 items-center gap-2 sm:justify-end"
		>

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
			{#if hasFilters}
				<button
					type="button"
					data-testid="calendar-filter-trigger"
					onclick={() => (showCalendarFilter = !showCalendarFilter)}
					aria-expanded={showCalendarFilter}
					aria-label="Filters"
					title="Choose which calendars and people to show"
					class="flex h-10 w-11 items-center justify-center text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M3 5h18M6 12h12M10 19h4"
						/>
					</svg>
					{#if hiddenFilterCount > 0}
						<span
							class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-700 px-1 text-[10px] font-bold leading-none text-white"
							aria-hidden="true"
						>
							{hiddenFilterCount}
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
	</div>

	<!-- ROW 2 — search, full width, on EVERY screen size.
	     #120 mark 1.15: "move this to the line below this". A 240px pill that
	     shows only `⌘K` is a shortcut dressed as a control — it means nothing to
	     anybody who has not already read the docs. Under the controls it is a
	     field, it is the width of the toolbar, and it says what it searches. -->
	<div data-testid="toolbar-search-row" class="flex w-full items-center gap-2">
		<div class="relative flex min-w-0 flex-1 items-center">
			<svg
				class="pointer-events-none absolute left-3 h-4 w-4 text-slate-400"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
			</svg>
			<input
				type="search"
				bind:this={searchInput}
				aria-label="Search events"
				placeholder="Search events, places, notes…"
				value={searchQuery}
				oninput={(e) => onSearch(e.currentTarget.value)}
				class="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-16 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
			/>
			<!-- The shortcut is ON the field, not in a doc: discoverable means
			     visible before you have pressed anything. -->
			<span
				data-testid="search-shortcut-hint"
				aria-hidden="true"
				class="pointer-events-none absolute right-3 hidden select-none rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:block"
			>
				⌘K
			</span>
		</div>
		{#if searchQuery}
			<!-- The ack: what the query kept, and the one tap back. A filter with
			     no way out is a dead end. -->
			<span
				data-testid="search-status"
				aria-live="polite"
				class="shrink-0 whitespace-nowrap text-xs tabular-nums text-slate-500"
			>
				{searchMatches === null ? 'No matches' : `${searchMatches} of ${searchTotal ?? 0}`}
			</span>
			<button
				type="button"
				onclick={() => onSearch('')}
				aria-label="Clear search"
				class="h-10 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
			>
				Clear
			</button>
		{/if}
	</div>

	<!-- #069: the popover is a child of the toolbar ROOT, not of the scrolling
		action strip, so `overflow-x-auto` can never clip it. Anchored right and
		width-capped so it fits 320px (px-4 root padding + 0.5rem gutter). -->
	{#if showCalendarFilter && hasFilters}
		<button
			type="button"
			data-testid="calendar-filter-backdrop"
			aria-label="Dismiss the calendar filter sheet"
			tabindex="-1"
			onclick={closeCalendarFilter}
			class="fixed inset-0 z-[55] cursor-default bg-slate-900/30 md:hidden"
		></button>
		<div
			data-testid="calendar-filter-panel"
			role="dialog"
			aria-label="Filters"
			class="fixed inset-x-0 bottom-0 z-[60] max-h-[75vh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl md:absolute md:inset-x-auto md:bottom-auto md:right-4 md:top-full md:z-30 md:mt-2 md:max-h-[min(70vh,26rem)] md:w-64 md:overflow-y-auto md:rounded-xl md:p-2 md:shadow-xl"
		>
			{#if filterableCalendars.length > 0}
			<div class="flex items-center justify-between gap-2 px-1 pb-1">
				<span class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
					Calendars
				</span>
				<button
					type="button"
					aria-label="Close calendar filter"
					onclick={closeCalendarFilter}
					class="-mr-0.5 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 md:hidden"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
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
			{/if}

			<!-- #127 mark 1.11. "By person" was a rail card: a list of names and
			     counts you could read and not act on. It is a filter now, in the
			     SAME sheet as Calendars — "same question, two axes" — and the
			     mark's own complaint was the shape: a card is the wrong thing on
			     a 320px phone, so this is one full-width column of 44px rows with
			     a truncating name, not a grid of avatars. -->
			<div
				data-testid="assignee-filter"
				class="mt-1 flex flex-col gap-0.5 border-t border-slate-200 pt-1.5 {filterableCalendars.length >
				0
					? ''
					: 'border-t-0 pt-0'}"
			>
				<div class="flex items-center justify-between gap-2 px-1 pb-1">
					<span class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
						Assignee
					</span>
					{#if hiddenAssigneeIds.length > 0}
						<button
							type="button"
							data-testid="assignee-filter-all"
							onclick={onShowAllAssignees}
							class="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-semibold text-primary-700 transition-colors hover:bg-primary-50"
						>
							Show everyone
						</button>
					{/if}
				</div>
				{#if assignees.length === 0}
					<p data-testid="assignee-nobody" class="px-2 text-[11px] leading-snug text-slate-400">
						Nobody has anything on this calendar yet, so there is nobody to filter by. The
						people who put something here will show up.
					</p>
				{:else}
					{#each assignees as person (person.id)}
						{@const on = !hiddenAssigneeIds.includes(person.id)}
						<button
							type="button"
							data-testid="assignee-row"
							aria-pressed={on}
							aria-label={`${person.name}, ${on ? `${person.count} ${person.count === 1 ? 'item' : 'items'}` : 'switched off'}`}
							onclick={() => onToggleAssignee(person.id)}
							class="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50 {on
								? ''
								: 'bg-slate-50'}"
						>
							<!-- The avatar is the one place a hue may ride a person:
							     it is identification, not state. State is the row's
							     mute and the strike, never the colour. -->
							<span
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold {avatarColor(
									person.id
								)} {on ? '' : 'opacity-40 grayscale'}"
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
					<p class="px-2 pt-1.5 text-[11px] leading-snug text-slate-400">
						Switched-off people drop their events and their due tasks from every view. The
						number is what is left on the calendar now, so a 0 is why the grid is empty.
					</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
