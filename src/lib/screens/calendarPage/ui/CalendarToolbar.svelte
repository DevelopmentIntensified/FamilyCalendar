<!--
	The toolbar: the view toggle, the one centred date pill (kernel `DayNav` with
	the month label as its leading segment), Add/Select, the Filters trigger with
	its hidden count, the action strip and its sandwich, and the full-width search
	row with a visible `⌘K` hint, the `N of M` status and Clear.

	Layout is Prototype E's, transcribed (#128 gaps 3/7/8, #202), made one bar by
	#326/#327: the view toggle owns its column (`auto`), the actions take the
	rest, and below 1150px the date pill gets its own row. Every control is 40px
	tall. The Filters/Import/Print/Day dashboard/Settings strip is icon-only
	(aria-label + title), so it is a fixed width and never scrolls; below md it
	collapses into one ⋯ button that opens the same actions as rows.
-->
<script lang="ts">
	import DayNav from '$lib/kernel/ui/DayNav.svelte';
	import type { CalendarPageCalendar } from '../calendarPage.contract';
	import type { CalendarPageState } from '../calendarPage.state.svelte';

	interface Props {
		state: CalendarPageState;
	}

	// Aliased off the prop name: a local called `state` would turn the `$state`
	// runes below into store subscriptions for the language tools.
	let { state: page }: Props = $props();

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

	const filterable: readonly CalendarPageCalendar[] = $derived(
		page.shell.calendars.filter((calendar) => calendar.id)
	);
	const hiddenFilterCount = $derived(page.hiddenCalendarIds.length + page.hiddenAssigneeIds.length);
	const monthYear = $derived(page.date.toFormat('MMMM yyyy'));
	const dashboardDate = $derived(page.date.toISODate() ?? '');

	const menuRow =
		'flex min-h-11 w-full items-center rounded-lg px-2 text-left text-base text-slate-700 transition-colors hover:bg-slate-50';
	// 32px inside a 40px group (p-1): the view toggle's construction, so the
	// strip is the same height as every other control and has nothing to scroll.
	const stripIcon =
		'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800';
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
			page.filtersOpen = false;
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
			<div class="flex h-10 min-w-0 items-center gap-1 rounded-xl bg-slate-100 p-1 shadow-sm">
				{#each views as view (view.id)}
					<button
						type="button"
						onclick={() => page.setView(view.id)}
						aria-pressed={page.view === view.id}
						class="flex h-full items-center gap-2 rounded-lg px-2.5 text-sm font-medium transition-all active:scale-[0.97] sm:px-3 {page.view ===
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
				isToday={page.onCurrentPeriod}
				onToday={() => page.goToday()}
				onPrevious={() => page.goPrevious()}
				onNext={() => page.goNext()}
			>
				{#snippet leading()}
					<div class="relative min-w-0" data-testid="mini-picker-container">
						<button
							type="button"
							onclick={() => (showPicker = !showPicker)}
							aria-expanded={showPicker}
							class="flex h-10 items-center px-3 text-lg font-bold tracking-tight text-slate-900 transition-colors hover:bg-slate-100 active:bg-slate-200 sm:px-4 sm:text-2xl"
						>
							{monthYear}
						</button>
						{#if showPicker}
							{#await import('./MiniPicker.svelte')}
								<!-- Absolutely positioned under the date pill: no space to reserve. -->
							{:then { default: MiniPicker }}
								<MiniPicker
									open={true}
									month={page.date}
									onselectmonth={(month) => page.selectMonth(month)}
									onselectyear={(year) => page.selectYear(year)}
									onclose={() => (showPicker = false)}
								/>
							{/await}
						{/if}
					</div>
					<span class="h-6 w-px shrink-0 bg-slate-200" aria-hidden="true"></span>
				{/snippet}
			</DayNav>
		</div>

		<!-- The modes and the actions -->
		<div
			class="col-start-2 row-start-2 flex min-w-0 items-center gap-1 sm:gap-2 min-[1150px]:col-start-3 min-[1150px]:row-start-1 min-[1150px]:justify-end"
		>
			<button
				type="button"
				onclick={() => page.setAddMode(!page.addMode)}
				aria-pressed={page.addMode}
				title="Add by dragging a time range"
				class="flex h-10 items-center gap-1.5 rounded-xl border px-2.5 text-sm font-medium transition-all active:scale-[0.97] sm:px-3 {page.addMode
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
				onclick={() => page.setSelectionMode(!page.selectionMode)}
				aria-pressed={page.selectionMode}
				title="Select events to edit in bulk"
				class="flex h-10 items-center gap-1.5 rounded-xl border px-2.5 text-sm font-medium transition-all active:scale-[0.97] sm:px-3 {page.selectionMode
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

			<!-- Icon-only strip (#326): names are aria-label + title, never a
			     visible word, so the strip is fixed-width and cannot overflow. -->
			<div
				data-testid="action-strip"
				class="hidden h-10 shrink-0 items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-sm md:flex"
			>
				{#if filterable.length > 0 || page.assigneeRows.length > 0}
					<button
						type="button"
						data-testid="calendar-filter-trigger"
						onclick={() => (page.filtersOpen = !page.filtersOpen)}
						aria-expanded={page.filtersOpen}
						aria-label="Filters"
						title="Choose which calendars and people to show"
						class="relative flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 transition-colors {page.filtersOpen
							? 'bg-primary-50 text-primary-700'
							: 'text-slate-400 hover:bg-slate-100 hover:text-slate-800'}"
					>
						<svg
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M3 5h18M6 12h12M10 19h4" />
						</svg>
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
				<a
					href="/calendar/import"
					aria-label="Import"
					title="Import from Google / Apple / Outlook (.ics)"
					class={stripIcon}
				>
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4"
						/>
					</svg>
				</a>
				<a href="/calendar/print" aria-label="Print" title="Print for the fridge" class={stripIcon}>
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
						/>
					</svg>
				</a>
				<a
					href="/calendar/dashboard?date={dashboardDate}"
					aria-label="Day dashboard"
					title="Day dashboard"
					class={stripIcon}
				>
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"
						/>
					</svg>
				</a>
				<a
					href="/account#calendar"
					aria-label="Calendar settings"
					title="Calendar settings"
					class={stripIcon}
				>
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path
							d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
						/>
						<path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
				</a>
			</div>

			<!-- Below md the strip collapses into one ⋯ button, the same height
			     as every other control on the bar (#327). -->
			<button
				type="button"
				data-testid="action-menu-trigger"
				onclick={() => (showActionMenu = !showActionMenu)}
				aria-expanded={showActionMenu}
				aria-haspopup="dialog"
				aria-label="Calendar actions"
				title="More actions"
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 md:hidden"
			>
				<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="5" cy="12" r="1.75" />
					<circle cx="12" cy="12" r="1.75" />
					<circle cx="19" cy="12" r="1.75" />
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
				value={page.search}
				oninput={(event) => page.setSearch(event.currentTarget.value)}
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
		{#if page.search}
			<span
				data-testid="search-status"
				aria-live="polite"
				class="shrink-0 whitespace-nowrap text-xs tabular-nums text-slate-500"
			>
				{page.searchMatches === 0
					? 'No matches'
					: `${page.searchMatches} of ${page.searchTotal}`}
			</span>
			<button
				type="button"
				onclick={() => page.setSearch('')}
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
				{#if filterable.length > 0 || page.assigneeRows.length > 0}
					<button
						type="button"
						data-testid="action-menu-filters"
						onclick={() => {
							showActionMenu = false;
							page.filtersOpen = true;
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
{#if page.filtersOpen}
	{#await import('./CalendarFiltersSheet.svelte')}
		<!-- Fixed overlay: nothing to reserve. -->
	{:then { default: CalendarFiltersSheet }}
		<CalendarFiltersSheet
			open={true}
			calendars={page.shell.calendars}
			hiddenCalendarIds={page.hiddenCalendarIds}
			assignees={page.assigneeRows}
			hiddenAssigneeIds={page.hiddenAssigneeIds}
			onclose={() => (page.filtersOpen = false)}
			ontogglecalendar={(id) => page.toggleCalendar(id)}
			onhideall={(hide) => page.hideAllCalendars(hide)}
			ontoggleassignee={(id) => page.toggleAssignee(id)}
			onshoweveryone={() => page.showEveryone()}
		/>
	{/await}
{/if}
