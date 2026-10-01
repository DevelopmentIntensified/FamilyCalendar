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

	export let dateLabel: string;
	export let isToday: boolean = true;
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
	export let familyMembers: { userId: string; firstName: string; lastName: string }[];
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

	const visible = (id: string) => showsModule(modules, id);

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
	{#if visible('verse')}
		<DashboardInfoBand {dailyVerse} />
	{/if}

	<div data-testid="dashboard-card-band" class="space-y-4">
		<!-- Row 1 — the day's own reading, across the full width (118). This is
		     the band the Member Strip vacated, and it now says what it is for:
		     three cards side by side instead of one card and a half-empty column.
		     `md:grid-cols-2` is 103's pinned glance/top-3 pairing, still intact. -->
		{#if visible('glance') || visible('top3') || visible('completed')}
			<div
				data-testid="dashboard-day-band"
				class="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-3"
			>
				{#if visible('glance')}
					<TodayGlanceCard {dateLabel} {isToday} events={dayEvents} onEventClick={openEvent} />
				{/if}
				{#if visible('top3')}
					<TopPrioritiesCard tasks={top3} {meId} />
				{/if}
				{#if visible('completed')}
					<CompletedTodayCard tasks={completedToday} {isToday} />
				{/if}
			</div>
		{/if}

		<!-- Row 2 — the small family cards, three-up (118). "This doesn't need to
		     be as wide": the board was one 876px card that read as the page. It is
		     one column of a row now, and the two cells the Member Strip's row gave
		     up hold Kids' Schedule and Groceries, which are day-scoped and small.
		     Their internal grouping is 101's business and is untouched.
		     `items-start` so a short card is not stretched into a tall empty one. -->
		{#if (familyId && visible('board')) || (familyId && visible('kids')) || visible('groceries')}
			<div data-testid="dashboard-family-row" class="grid items-start gap-4 lg:grid-cols-3">
				{#if familyId && visible('board')}
					<FamilyTaskBoardCard
						tasks={familyTasks}
						members={familyMembers}
						{meId}
						{familyId}
						openToday={glance.openToday}
						weekStreak={glance.weekStreak}
					/>
				{/if}
				{#if familyId && visible('kids')}
					<KidsScheduleCard events={kidsSchedule} {isToday} />
				{/if}
				<!-- Groceries (081): family-scoped, but shown to a solo user too —
				     their own list is the whole list. -->
				{#if visible('groceries')}
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
		on:close={() => (selectedEvent = null)}
		on:update={() => invalidateAll()}
	/>
{/if}
