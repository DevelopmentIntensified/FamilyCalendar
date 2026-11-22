<!--
	The screen: the ONE 80rem card that welds the toolbar to the grid with the
	Key strip under it (legacy `+page.svelte` layout half + `Calendar.svelte`
	shell half), the skeleton that wears the same card, the warnings, the
	first-run card, the Quick Add FAB, the bulk bar, "create event from
	selection", the share ack and the lazy modals.

	It builds the state class from the load data and passes framework functions
	in (the route owns `invalidateAll` and the URL rewrite), so nothing here
	touches `$app/*`.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Ticker } from '$lib/kernel/time/ticker.svelte';
	import { systemClock } from '$lib/kernel/time/clock';
	import { createApiClient } from '$lib/kernel/client/apiClient';
	import { createToasts } from '$lib/kernel/client/toasts.svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import { createCalendarApi, type CalendarEventView } from '$lib/domains/calendar/index';
	import type { CalendarParseEvent } from '$lib/domains/calendar/ui';
	import type { CalendarPageModel } from '../calendarPage.contract';
	import { CALENDAR_EDIT_NOT_FOUND } from '../calendarPage.url.rules';
	import { calendarQuickAddSettings } from '../calendarPage.quickAdd.rules';
	import { CalendarPageState } from '../calendarPage.state.svelte';
	import CalendarKeyStrip from './CalendarKeyStrip.svelte';
	import CalendarToolbar from './CalendarToolbar.svelte';
	import FilterEmpty from './FilterEmpty.svelte';
	import FirstRunCard from './FirstRunCard.svelte';
	import MonthView from './MonthView.svelte';

	interface Props {
		model: CalendarPageModel;
		/** The route's `invalidateAll`. */
		oninvalidate: () => Promise<void>;
		/** The route's `history.replaceState` for a consumed deep link. */
		onstripquery?: () => void;
	}

	let { model, oninvalidate, onstripquery }: Props = $props();

	const client = createApiClient();
	const api = createCalendarApi(client);
	const toasts = createToasts();

	/**
	 * The event parser is `parsing`'s wire; the form takes it as a prop. The
	 * route's field is `input` (`parsing.contract.ts`), and `useCloud` is the
	 * person's own switch (`calendarQuickAddSettings`).
	 */
	const quickAdd = calendarQuickAddSettings(model.shell.settings);
	const parseEvent: CalendarParseEvent = async (text) => {
		const result = await client.request<Awaited<ReturnType<CalendarParseEvent>>>(
			'POST',
			'/api/parse-event',
			{ input: text, useCloud: quickAdd.useCloud }
		);
		return result.ok ? result.data : null;
	};

	// Not `state`: a local by that name turns every `$state(…)` below into a
	// store subscription for the language tools. `page` is the page state.
	const page = new CalendarPageState({
		model,
		api,
		toasts,
		clock: systemClock,
		width: typeof window === 'undefined' ? null : window.innerWidth,
		onrefresh: oninvalidate,
		onstripquery,
		onreportphrase: async ({ phrase, matched }) => {
			const result = await client.request('POST', '/api/report-phrase', {
				phrase,
				source: 'bulk_edit',
				matched
			});
			return result.ok;
		}
	});

	const ticker = new Ticker(systemClock, 60_000);

	$effect(() => {
		void page.load(model);
	});
	$effect(() => {
		page.tick(ticker.now);
	});

	/**
	 * Resolves once the window's `load` event has fired and the browser has a quiet
	 * moment. ADR 0010 counts the JS transferred up to `load`; a deep link opens
	 * the create modal during hydration, so a plain `import()` there would bill
	 * the modal's chunk (calendar's event form, zod) to the first paint. Legacy
	 * fetched its form modal on browser idle for the same reason.
	 * (Executor form on purpose: `Promise.withResolvers` is newer than the
	 * browsers this page still serves.)
	 */
	function afterLoad(): Promise<void> {
		return new Promise((resolve) => {
			const idle = () => {
				if ('requestIdleCallback' in window) {
					window.requestIdleCallback(() => resolve(), { timeout: 300 });
				} else {
					setTimeout(resolve, 0);
				}
			};
			if (document.readyState === 'complete') idle();
			else window.addEventListener('load', idle, { once: true });
		});
	}

	/**
	 * The create modal's chunk is fetched once, after `load` (see `afterLoad`).
	 * The FAB warms it on hover/focus, as legacy's idle prefetch did.
	 */
	let createModal: Promise<typeof import('./CreateAnythingModal.svelte')> | null = null;
	function loadCreateModal() {
		createModal ??= afterLoad().then(() => import('./CreateAnythingModal.svelte'));
		return createModal;
	}

	let sliceText = $state('');
	let sliceVisible = $state(false);

	onMount(() => {
		ticker.start();
		const updateSlice = () => {
			const selection = window.getSelection();
			const text = selection?.toString().trim() || '';
			if (!text || selection?.isCollapsed || page.createOpen || page.editRowId) {
				sliceVisible = false;
				sliceText = '';
				return;
			}
			sliceText = text;
			sliceVisible = true;
		};
		document.addEventListener('selectionchange', updateSlice);
		window.addEventListener('mouseup', updateSlice);
		window.addEventListener('keyup', updateSlice);
		return () => {
			ticker.stop();
			document.removeEventListener('selectionchange', updateSlice);
			window.removeEventListener('mouseup', updateSlice);
			window.removeEventListener('keyup', updateSlice);
		};
	});

	let touchX = 0;
	let touchY = 0;

	function touchStart(event: TouchEvent) {
		touchX = event.touches[0]?.clientX ?? 0;
		touchY = event.touches[0]?.clientY ?? 0;
	}

	function touchEnd(event: TouchEvent) {
		const touch = event.changedTouches[0];
		if (!touch) return;
		page.swipe(touch.clientX - touchX, touch.clientY - touchY);
	}

	function createFromSelection() {
		page.openCreateFromText(sliceText);
		sliceVisible = false;
		sliceText = '';
		window.getSelection()?.removeAllRanges();
	}

	/** The edit sheet's roster (calendar's shape) from the screen's roster. */
	const familyMembers = $derived(
		page.shell.roster.map((member) => ({
			userId: member.userId,
			firstName: member.firstName,
			lastName: member.lastName ?? ''
		}))
	);

	const editView = $derived.by<CalendarEventView | null>(() => {
		const row = page.editRow;
		if (!row) return null;
		const view: CalendarEventView = {
			id: row.id,
			masterId: row.masterId,
			occurrenceDate: row.occurrenceDate,
			title: row.title ?? '',
			start: row.start ?? row.date,
			end: row.end,
			date: row.date,
			description: row.description,
			location: row.location,
			allDay: row.allDay,
			calendarId: row.calendarId,
			ownerId: row.ownerId,
			creatorName: row.creatorName,
			recurrenceFrequency: row.recurrenceFrequency,
			rsvpStatus: row.rsvpStatus
		};
		return view;
	});

	const warnings = $derived([...page.shell.warnings, ...(page.grid?.warnings ?? [])]);
</script>

<svelte:window onkeydown={() => page.handleEscape()} />

<div class="pb-24" ontouchstart={touchStart} ontouchend={touchEnd}>
	{#if page.grid === null && !page.gridFailed}
		<!-- The skeleton wears the SAME card and the same cell heights. -->
		<div class="w-full px-3 pb-2 pt-2 sm:px-6" aria-hidden="true">
			<div class="mx-auto w-full max-w-[80rem] rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
				<div class="mb-3 h-10 w-64 max-w-full animate-pulse rounded-xl bg-slate-100"></div>
				<div class="grid grid-cols-7 gap-1.5">
					{#each Array(35) as _, index (index)}
						<div class="h-[72px] animate-pulse rounded-[14px] bg-slate-100 md:h-[92px] lg:h-[104px]"></div>
					{/each}
				</div>
			</div>
		</div>
	{:else if page.gridFailed}
		<div class="mx-auto max-w-xl px-4 pt-4" role="alert">
			<div class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
				Couldn't load your events.
				<button type="button" onclick={() => void page.refresh()} class="font-semibold underline">
					Retry
				</button>
			</div>
		</div>
	{:else}
		{#if warnings.length > 0}
			<div class="mx-auto max-w-xl px-4 pt-4" role="alert">
				<div class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
					Couldn't load {warnings.join(', ')} just now — everything else is up to date.
				</div>
			</div>
		{/if}
		{#if page.editNotFound}
			<div class="mx-auto max-w-xl px-4 pt-4" role="alert">
				<div class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
					{CALENDAR_EDIT_NOT_FOUND}
				</div>
			</div>
		{/if}
		{#if page.showFirstRun}
			<FirstRunCard ondismiss={() => page.dismissFirstRun()} />
		{/if}

		<div class="w-full px-3 pb-2 sm:px-6">
			<div
				data-testid="calendar-card"
				class="mx-auto w-full max-w-[80rem] rounded-3xl border border-slate-200 bg-white shadow-sm"
			>
				<CalendarToolbar state={page} />
				<div class="group/cal relative w-full p-3">
					{#if page.ranges.isBusy(page.monthOnScreen)}
						<p
							class="mb-2 text-center text-sm text-slate-500"
							role="status"
							data-testid="calendar-range-pending"
						>
							Downloading this month…
						</p>
					{/if}
					<button
						onclick={() => page.goPrevious()}
						aria-label="Previous period"
						class="absolute -left-1 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 opacity-0 shadow-md transition-opacity hover:bg-slate-50 focus-visible:opacity-100 group-hover/cal:opacity-100 md:flex"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
						</svg>
					</button>
					<button
						onclick={() => page.goNext()}
						aria-label="Next period"
						class="absolute -right-1 top-1/2 z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 opacity-0 shadow-md transition-opacity hover:bg-slate-50 focus-visible:opacity-100 group-hover/cal:opacity-100 md:flex"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
						</svg>
					</button>

					{#if page.showFilterEmpty}
						<FilterEmpty
							kind="calendars"
							labels={page.hiddenCalendarLabels}
							onexit={() => page.hideAllCalendars(false)}
						/>
					{:else if page.showSearchEmpty}
						<FilterEmpty
							kind="search"
							labels={[]}
							query={page.search}
							onexit={() => page.setSearch('')}
						/>
					{:else if page.showAssigneeEmpty}
						<FilterEmpty
							kind="people"
							labels={page.hiddenAssigneeLabels}
							onexit={() => page.showEveryone()}
						/>
					{:else if page.view === 'month'}
						<MonthView state={page} />
					{:else if page.view === 'week'}
						{#await import('./WeekView.svelte')}
							<!-- Reserved grid height: the card never collapses while the chunk lands. -->
							<div class="min-h-[420px] animate-pulse rounded-xl bg-slate-50" aria-hidden="true"></div>
						{:then { default: WeekView }}
							<WeekView state={page} />
						{/await}
					{:else if page.view === 'day'}
						{#await import('./DayView.svelte')}
							<div class="min-h-[420px] animate-pulse rounded-xl bg-slate-50" aria-hidden="true"></div>
						{:then { default: DayView }}
							<DayView state={page} />
						{/await}
					{:else}
						{#await import('./ListView.svelte')}
							<div class="min-h-[420px] animate-pulse rounded-xl bg-slate-50" aria-hidden="true"></div>
						{:then { default: ListView }}
							<ListView state={page} />
						{/await}
					{/if}

					{#if !page.showFilterEmpty && !page.showSearchEmpty && !page.showAssigneeEmpty}
						<CalendarKeyStrip sampleColor={page.shell.calendars[0]?.color} />
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

{#if page.shareNote}
	<div
		class="fixed left-1/2 top-3 z-[70] w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 rounded-lg border border-primary-200 bg-white/95 px-3 py-2 text-center text-sm text-slate-700 shadow-lg"
		role="status"
	>
		{page.shareNote}
	</div>
{/if}

{#if !page.selectionMode}
	<button
		onclick={() => page.openCreate()}
		onpointerenter={() => void loadCreateModal()}
		onfocus={() => void loadCreateModal()}
		class="fixed bottom-24 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-primary-600 shadow-xl shadow-primary-400/50 transition-all hover:scale-105 hover:bg-primary-700 active:scale-95"
		aria-label="Quick Add Event"
	>
		<svg class="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
		</svg>
	</button>
{/if}

{#if page.selectionMode}
	{#await import('./BulkEditBar.svelte')}
		<!-- The bar is fixed-position: nothing to reserve, so the grid cannot shift. -->
	{:then { default: BulkEditBar }}
		<BulkEditBar state={page} />
	{/await}
{/if}

{#if sliceVisible && !page.createOpen && !page.editRowId && !page.selectionMode}
	<button
		type="button"
		onclick={createFromSelection}
		class="fixed bottom-6 left-1/2 z-30 max-w-[90vw] -translate-x-1/2 truncate rounded-full bg-slate-900/90 px-4 py-2.5 text-sm font-medium text-white shadow-xl backdrop-blur-sm transition-colors hover:bg-slate-900"
		aria-label="Create event from selection"
	>
		Create event from selection
	</button>
{/if}

{#if page.exitAsk}
	{#await import('./SelectionExitAsk.svelte')}
		<!-- Fixed overlay: nothing to reserve. -->
	{:then { default: SelectionExitAsk }}
		<SelectionExitAsk
			open={true}
			onexit={() => page.confirmExitSelection()}
			onstay={() => page.stayInSelection()}
		/>
	{/await}
{/if}

{#if page.daySheetDate}
	{#await import('./DayActionSheet.svelte')}
		<!-- Bottom sheet: fixed overlay, so the month grid keeps its place. -->
	{:then { default: DayActionSheet }}
		<DayActionSheet
			state={page}
			open={true}
			day={page.daySheetDate}
			onclose={() => (page.daySheetDate = null)}
			onviewevents={(target) => page.openDayList(target)}
		/>
	{/await}
{/if}

{#if page.dayListDate}
	{#await import('./DayEventsModal.svelte')}
		<!-- Fixed overlay: nothing to reserve. -->
	{:then { default: DayEventsModal }}
		<DayEventsModal
			state={page}
			open={true}
			day={page.dayListDate}
			onclose={() => (page.dayListDate = null)}
		/>
	{/await}
{/if}

{#if page.taskDetail}
	{#key page.taskDetail.id}
		{#await import('$lib/domains/tasks/ui')}
			<!-- Fixed overlay: nothing to reserve. -->
		{:then { TaskDetailModal }}
			<TaskDetailModal
				task={page.taskDetail}
				now={page.now}
				onclose={() => page.closeTaskDetail()}
				onchanged={() => void page.refresh()}
			/>
		{/await}
	{/key}
{/if}

{#if page.createOpen}
	{#key `${page.createSeed?.quickAdd ?? ''}|${page.createStart?.toISO() ?? ''}`}
		{#await loadCreateModal()}
			<!-- Fixed bottom sheet: the grid does not move while it lands. -->
		{:then { default: CreateAnythingModal }}
			<CreateAnythingModal
				state={page}
				seed={page.createSeed}
				start={page.createStart}
				{parseEvent}
				autoParse={quickAdd.autoParse}
				onclose={() => page.closeCreate()}
			/>
		{/await}
	{/key}
{/if}

{#if page.editRowId && editView}
	{#key page.editRowId}
		{#await import('./EventEditSheet.svelte')}
			<!-- Fixed overlay: nothing to reserve. -->
		{:then { default: EventEditSheet }}
			<EventEditSheet
				event={editView}
				{api}
				toasts={page.toasts}
				calendars={page.shell.calendars}
				{familyMembers}
				defaultCalendarId={page.shell.settings.defaultCalendarId}
				viewerId={page.shell.viewerId}
				now={page.now}
				onclose={() => page.closeEdit()}
				onchanged={() => void page.refresh()}
			/>
		{/await}
	{/key}
{/if}

<Toaster items={toasts.items} ondismiss={toasts.dismiss} />
