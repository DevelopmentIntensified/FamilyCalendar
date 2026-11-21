<!--
	The toolbar: the view toggle, the one centred date pill (kernel `DayNav` with
	the month label as its leading segment), Add/Select, the Filters trigger with
	its hidden count, the action strip and its sandwich, and the full-width search
	row with a visible `⌘K` hint, the `N of M` status and Clear.

	Layout is Prototype E's, transcribed (#128 gaps 3/7/8, #202): the view toggle
	owns its column (`auto`), the actions take the rest and scroll inside it,
	and below 1150px the date pill gets its own row. The Filters trigger leads
	the strip so a narrow width never scrolls it out of reach.
-->
<script lang="ts">
	import DayNav from '$lib/kernel/ui/DayNav.svelte';
	import type { CalendarPageCalendar } from '../calendarPage.contract';
	import type { CalendarPageState } from '../calendarPage.state.svelte';
	import CalendarFiltersSheet from './CalendarFiltersSheet.svelte';
	import MiniPicker from './MiniPicker.svelte';

	interface Props {
		state: CalendarPageState;
	}

	let { state }: Props = $props();

	const views = [
		{ id: 'month', label: 'Month', icon: 'M3 3h18v18H3V3zm0 7.5h18v6.5H3v-6.5zm0 7.5h18v1.5H3v-1.5z' },
		{
			id: 'week',
			label: 'Week',
			icon: 'M3 3h18v18H3V3zm0 7.5h18v12H3v-12zm2.5 2v8h2v-8h-2zm4 0v8h2v-8h-2zm4 0v8h2v-8h-2z'
		},
		{ id: 'list', label: 'List', icon: 'M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z' }
	] as const;

	let showPicker = $state(false);
	let showActionMenu = $state(false);
	let searchInput = $state<HTMLInputElement | null>(null);

	const months = $derived(
		Array.from({ length: 12 }, (_, index) =>
			state.date.set({ month: index + 1 }).toFormat('MMMM')
		)
	);
	const filterable: readonly CalendarPageCalendar[] = $derived(
		state.shell.calendars.filter((calendar) => calendar.id)
	);
	const hiddenFilterCount = $derived(state.hiddenCalendarIds.length + state.hiddenAssigneeIds.length);
	const monthYear = $derived(state.date.toFormat('MMMM yyyy'));
	const dashboardDate = $derived(state.date.toISODate() ?? '');

	const menuRow =
		'flex min-h-11 w-full items-center rounded-lg px-2 text-left text-base text-slate-700 transition-colors hover:bg-slate-50';
	const menuLinks = $derived<[string, string][]>([
		['/calendar/import', 'Import'],
		['/calendar/print', 'Print'],
		[`/calendar/dashboard?date=${dashboardDate}`, 'Day dashboard'],
		['/account#calendar', 'Calendar settings']
	]);

	function focusSearch() {
		searchInput?.focus();
		searchInput?.select();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			showPicker = false;
			showActionMenu = false;
			state.filtersOpen = false;
			return;
		}
		// The `⌘K` pill on the field is a real shortcut, not decoration.
		if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey) && !event.altKey) {
			event.preventDefault();
			focusSearch();
		}
	}
</script>

<svelte:window onkeydown={onkeydown} />

<div class="relative flex flex-col gap-2 rounded-t-3xl border-b border-slate-200 px-4 py-3">
	<div
		data-testid="toolbar-controls-row"
		class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 min-[1150px]:grid-cols-[1fr_auto_1fr]"
	>
		<!-- The view toggle -->
		<div
			class="col-start-1 row-start-2 flex min-w-0 items-center gap-2 min-[1150px]:row-start-1 min-[1150px]:justify-start"
		>
			<div class="flex min-w-0 items-center gap-1 rounded-xl bg-slate-100 p-1 shadow-sm">
				{#each views as view (view.id)}
					<button
						type="button"
						onclick={() => state.setView(view.id)}
						aria-pressed={state.view === view.id}
						class="flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-all active:scale-[0.97] {state.view ===
						view.id
							? 'bg-white text-slate-900 shadow-sm'
							: 'text-slate-500 hover:text-slate-900'}"
					>
						<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<path d={view.icon} />
						</svg>
						<span class="sr-only sm:not-sr-only">{view.label}</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- The date pill -->
		<div
			data-testid="date-nav"
			class="col-span-2 col-start-1 row-start-1 flex items-center justify-center min-[1150px]:col-span-1 min-[1150px]:col-start-2"
		>
			<DayNav
				period="period"
				isToday={state.onCurrentPeriod}
				onToday={() => state.goToday()}
				onPrevious={() => state.goPrevious()}
				onNext={() => state.goNext()}
			>
				{#snippet leading()}
					<div class="relative min-w-0" data-testid="mini-picker-container">
						<button
							type="button"
							onclick={() => (showPicker = !showPicker)}
							aria-expanded={showPicker}
							class="px-3 py-2.5 text-lg font-bold tracking-tight text-slate-900 transition-colors hover:bg-slate-100 active:bg-slate-200 sm:px-4 sm:text-2xl"
						>
							{monthYear}
						</button>
						<MiniPicker
							open={showPicker}
							month={state.date}
							{months}
							onselectmonth={(month) => state.selectMonth(month)}
							onselectyear={(year) => state.selectYear(year)}
							onclose={() => (showPicker = false)}
						/>
					</div>
					<span class="h-6 w-px shrink-0 bg-slate-200" aria-hidden="true"></span>
				{/snippet}
			</DayNav>
		</div>

		<!-- The modes and the actions -->
		<div
			class="col-start-2 row-start-2 flex min-w-0 items-center gap-2 min-[1150px]:col-start-3 min-[1150px]:row-start-1 min-[1150px]:justify-end"
		>
			<button
				type="button"
				onclick={() => state.setAddMode(!state.addMode)}
				aria-pressed={state.addMode}
				title="Add by dragging a time range"
				class="flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-all active:scale-[0.97] {state.addMode
					? 'border-primary-300 bg-primary-50 text-primary-700'
					: 'border-slate-200 bg-white text-slate-400 hover:text-slate-800'}"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				<span class="sr-only sm:not-sr-only">Add</span>
			</button>

			<button
				type="button"
				onclick={() => state.setSelectionMode(!state.selectionMode)}
				aria-pressed={state.selectionMode}
				title="Select events to edit in bulk"
				class="flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-all active:scale-[0.97] {state.selectionMode
					? 'border-primary-300 bg-primary-50 text-primary-700'
					: 'border-slate-200 bg-white text-slate-400 hover:text-slate-800'}"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
					/>
				</svg>
				<span class="sr-only sm:not-sr-only">Select</span>
			</button>

			<div
				data-testid="action-strip"
				class="hidden min-w-0 max-w-full items-center divide-x divide-slate-200 overflow-x-auto overflow-y-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:flex"
			>
				{#if filterable.length > 0 || state.assigneeRows.length > 0}
					<button
						type="button"
						data-testid="calendar-filter-trigger"
						onclick={() => (state.filtersOpen = !state.filtersOpen)}
						aria-expanded={state.filtersOpen}
						aria-label="Filters"
						title="Choose which calendars and people to show"
						class="relative flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-all active:scale-[0.97] {state.filtersOpen
							? 'border-primary-300 bg-primary-50 text-primary-700'
							: 'border-slate-200 bg-white text-slate-500 hover:text-slate-800'}"
					>
						<svg
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M3 5h18M6 12h12M10 19h4" />
						</svg>
						<span data-testid="filters-label" class="sr-only sm:not-sr-only">Filters</span>
						{#if hiddenFilterCount > 0}
							<span
								data-testid="calendar-filter-badge"
								class="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-slate-700 px-1 text-[10px] font-bold leading-none text-white"
								aria-hidden="true"
							>
								{hiddenFilterCount}
							</span>
						{/if}
					</button>
				{/if}
				{#each menuLinks as [href, label] (href)}
					<a
						{href}
						aria-label={label}
						title={label}
						class="flex h-10 items-center justify-center px-3 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary-600"
					>
						{label}
					</a>
				{/each}
			</div>

			<button
				type="button"
				data-testid="action-menu-trigger"
				onclick={() => (showActionMenu = !showActionMenu)}
				aria-expanded={showActionMenu}
				aria-haspopup="dialog"
				aria-label="Calendar actions"
				class="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 sm:hidden"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
		</div>
	</div>

	<!-- Search: full width, every width, a field rather than a pill -->
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
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
				/>
			</svg>
			<input
				type="search"
				bind:this={searchInput}
				aria-label="Search events"
				placeholder="Search events, places, notes…"
				value={state.search}
				oninput={(event) => state.setSearch(event.currentTarget.value)}
				class="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-16 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
			/>
			<span
				data-testid="search-shortcut-hint"
				aria-hidden="true"
				class="pointer-events-none absolute right-3 hidden select-none rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:block"
			>
				⌘K
			</span>
		</div>
		{#if state.search}
			<span
				data-testid="search-status"
				aria-live="polite"
				class="shrink-0 whitespace-nowrap text-xs tabular-nums text-slate-500"
			>
				{state.searchMatches === 0
					? 'No matches'
					: `${state.searchMatches} of ${state.searchTotal}`}
			</span>
			<button
				type="button"
				onclick={() => state.setSearch('')}
				aria-label="Clear search"
				class="h-10 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
			>
				Clear
			</button>
		{/if}
	</div>

	<!-- The sandwich sheet: the strip's actions as full-width 44px rows -->
	{#if showActionMenu}
		<button
			type="button"
			data-testid="action-menu-backdrop"
			aria-label="Dismiss the calendar actions menu"
			tabindex="-1"
			onclick={() => (showActionMenu = false)}
			class="fixed inset-0 z-[55] cursor-default bg-slate-900/30"
		></button>
		<div
			data-testid="action-menu-panel"
			role="dialog"
			aria-label="Calendar actions"
			class="fixed left-2 right-2 top-2 z-[60] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
		>
			<button
				type="button"
				aria-label="Close calendar actions"
				onclick={() => (showActionMenu = false)}
				class="absolute right-2 top-2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
			<div class="flex flex-col gap-0.5 px-2 pb-3 pt-11">
				{#if filterable.length > 0 || state.assigneeRows.length > 0}
					<button
						type="button"
						data-testid="action-menu-filters"
						onclick={() => {
							showActionMenu = false;
							state.filtersOpen = true;
						}}
						class={menuRow}
					>
						Filters
					</button>
				{/if}
				{#each menuLinks as [href, label] (href)}
					<a {href} class={menuRow}>{label}</a>
				{/each}
			</div>
		</div>
	{/if}
</div>

<!-- The one sheet, at every width -->
<CalendarFiltersSheet
	open={state.filtersOpen}
	calendars={state.shell.calendars}
	hiddenCalendarIds={state.hiddenCalendarIds}
	assignees={state.assigneeRows}
	hiddenAssigneeIds={state.hiddenAssigneeIds}
	onclose={() => (state.filtersOpen = false)}
	ontogglecalendar={(id) => state.toggleCalendar(id)}
	onhideall={(hide) => state.hideAllCalendars(hide)}
	ontoggleassignee={(id) => state.toggleAssignee(id)}
	onshoweveryone={() => state.showEveryone()}
/>
