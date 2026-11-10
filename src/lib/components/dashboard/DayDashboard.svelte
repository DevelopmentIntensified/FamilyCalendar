<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { Event } from '$lib/types';
	import { showsModule } from '$lib/dashboardModules';
	import DashboardInfoBand from './DashboardInfoBand.svelte';
	import TodayGlanceCard, { type GlanceEvent } from './TodayGlanceCard.svelte';
	import TopPrioritiesCard from './TopPrioritiesCard.svelte';
	import CompletedTodayCard from './CompletedTodayCard.svelte';
	import FamilyTaskBoardCard from './FamilyTaskBoardCard.svelte';
	import KidsScheduleCard from './KidsScheduleCard.svelte';
	import GroceriesCard, { type GroceryCardItem } from './GroceriesCard.svelte';
	import EventModal from '$lib/components/calendar/EventModal.svelte';
	import { toEventRoster } from '$lib/utils/eventRoster';

	export let dateLabel: string;
	export let isToday: boolean = true;
	/** The viewed day, `YYYY-MM-DD` (240) — the glance card's day-view link opens it. */
	export let dayDate: string | null = null;
	export let meId: string;
	export let familyId: string | null;
	/** The Daily Verse, already gated server-side by `dashboardVisibility` (080).
	 * It renders in the quiet info band above the cards, not as a band card. */
	export let dailyVerse: { reference: string; text: string; attribution?: string } | null = null;
	export let glance: { doneToday: number; openToday: number; weekStreak: number };
	export let dayEvents: GlanceEvent[];
	export let top3: {
		id: string;
		title: string;
		dueDate: string | null;
		priority: string;
		userId: string;
		assignedTo: string | null;
		assignmentStatus: string | null;
		assigneeFirstName?: string | null;
		assigneeLastName?: string | null;
	}[];
	export let familyTasks: {
		id: string;
		title: string;
		dueDate: string | null;
		completedAt: string | null;
		priority: string;
		assignedTo: string | null;
		assignmentStatus: string | null;
		userId: string;
		assigneeFirstName?: string | null;
		assigneeLastName?: string | null;
		creatorFirstName?: string | null;
	}[];
	export let familyMembers: {
		userId: string;
		firstName: string;
		lastName: string;
		email?: string | null;
	}[];
	/** #283: the viewer's task categories, for the board's quick-add. */
	export let taskCategories: { id: string; name: string }[] = [];
	export let kidsSchedule: {
		id: string;
		title: string;
		start: string;
		end: string | null;
		allDay: boolean;
		location: string | null;
		kids: { id: string; name: string }[];
	}[];
	/** Tasks completed within the viewed day (for the Completed Today card). */
	export let completedToday: { id: string; title: string; completedAt: string | null }[] = [];
	/** Open Grocery Items, per scope (081). Absent = nothing open. */
	export let familyGroceries: GroceryCardItem[] = [];
	export let mineGroceries: GroceryCardItem[] = [];
	/** Section labels whose model failed to load — shown as a banner, not a 500. */
	export let loadWarnings: string[] = [];
	// Per-module visibility (family master switch AND per-user hides), composed
	// server-side by `dashboardVisibility` (109). An absent key is visible —
	// `showsModule` is the module's stated default, not a guess about what was
	// passed in.
	export let modules: Record<string, boolean> = {};

	let selectedEvent: Event | null = null;

	function openEvent(e: GlanceEvent) {
		// SAFETY: glance rows are projected from full Event records (the
		// GlanceEvent prop type is a deliberate subset of `Event`), so the
		// runtime shape is a valid Event for the detail modal. The chained cast
		// only bridges the subset prop type, never untrusted input.
		// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- GlanceEvent and Event are mutually non-assignable (required string fields vs optional), so a single assertion cannot typecheck; the invariant is guaranteed by the projection above.
		selectedEvent = e as unknown as Event;
	}
</script>

<div class="mx-auto w-full max-w-5xl space-y-4">
	{#if loadWarnings.length > 0}
		<div
			class="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
			role="alert"
		>
			Couldn't load {loadWarnings.join(', ')} just now — everything else is up to date.
		</div>
	{/if}
	<!-- Info band (080): readings, above the cards and out of the module band.
	     Still gated on the verse's own saved switch, so a user who hid it
	     before the move is still hidden. -->
	{#if showsModule(modules, 'verse')}
		<DashboardInfoBand {dailyVerse} />
	{/if}

	<!-- 316: on desktop the band is ONE two-column grid, not two three-up rows.
	     Above 1024px both row groups go `display: contents`, so their cards
	     become items of this grid and flow two-up: glance | top-3,
	     completed | board, kids | groceries. Every row is full — hiding a card
	     closes the gap instead of leaving a dead lane — and `items-stretch`
	     makes the two cards of a row share one height. Below 1024px the band
	     is the same single-column stack it has always been. -->
	<div
		data-testid="dashboard-card-band"
		class="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch"
	>
		<!-- Row 1 — the day's own reading (118). `md:grid-cols-2` is 103's
		     pinned glance/top-3 pairing, still intact at the 768–1023px tier;
		     at ≥1024px the group hands its cards to the band's two-column grid. -->
		{#if showsModule(modules, 'glance') || showsModule(modules, 'top3') || showsModule(modules, 'completed')}
			<div
				data-testid="dashboard-day-band"
				class="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:contents"
			>
				{#if showsModule(modules, 'glance')}
					<TodayGlanceCard
						{dateLabel}
						{isToday}
						{dayDate}
						events={dayEvents}
						onEventClick={openEvent}
					/>
				{/if}
				{#if showsModule(modules, 'top3')}
					<TopPrioritiesCard tasks={top3} {meId} />
				{/if}
				{#if showsModule(modules, 'completed')}
					<CompletedTodayCard tasks={completedToday} {isToday} />
				{/if}
			</div>
		{/if}

		<!-- Row 2 — the small family cards (118). "This doesn't need to be as
		     wide": the board was one 876px card that read as the page. Their
		     internal grouping is 101's business and is untouched. Below
		     1024px this is the single-column stack it always was; above it the
		     group is `display: contents`, so the board shares a row with
		     Completed Today and kids/groceries close the grid — no half-empty
		     lane, and the band's `items-stretch` reconciles their heights. -->
		{#if (familyId && showsModule(modules, 'board')) || (familyId && showsModule(modules, 'kids')) || showsModule(modules, 'groceries')}
			<div data-testid="dashboard-family-row" class="grid grid-cols-1 items-start gap-4 lg:contents">
				{#if familyId && showsModule(modules, 'board')}
					<FamilyTaskBoardCard
						tasks={familyTasks}
						members={familyMembers}
						{meId}
						{familyId}
						weekStreak={glance.weekStreak}
						categories={taskCategories.map((c) => c.name)}
					/>
				{/if}
				{#if familyId && showsModule(modules, 'kids')}
					<KidsScheduleCard events={kidsSchedule} {isToday} />
				{/if}
				<!-- Groceries (081): family-scoped, but shown to a solo user too —
				     their own list is the whole list. -->
				{#if showsModule(modules, 'groceries')}
					<GroceriesCard
						familyItems={familyGroceries}
						mineItems={mineGroceries}
						hasFamily={!!familyId}
					/>
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if selectedEvent}
	<EventModal
		event={selectedEvent}
		show={true}
		calendars={[]}
		familyMembers={toEventRoster(familyMembers)}
		on:close={() => (selectedEvent = null)}
		on:update={() => invalidateAll()}
	/>
{/if}
