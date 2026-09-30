<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { Event } from '$lib/types';
	import DashboardInfoBand from './DashboardInfoBand.svelte';
	import TodayGlanceCard, { type GlanceEvent } from './TodayGlanceCard.svelte';
	import TopPrioritiesCard from './TopPrioritiesCard.svelte';
	import CompletedTodayCard from './CompletedTodayCard.svelte';
	import FamilyTaskBoardCard from './FamilyTaskBoardCard.svelte';
	import MemberStrip from './MemberStrip.svelte';
	import KidsScheduleCard from './KidsScheduleCard.svelte';
	import GroceriesCard, { type GroceryCardItem } from './GroceriesCard.svelte';
	import EventModal from '$lib/components/calendar/EventModal.svelte';

	export let dateLabel: string;
	export let isToday: boolean = true;
	export let meId: string;
	export let familyId: string | null;
	/** The Daily Verse, already gated server-side by `verseIsVisible` (080).
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
	export let memberStatus: {
		userId: string;
		firstName: string;
		lastName: string;
		openTasksToday: number;
		attendingToday: boolean;
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
	// Per-module visibility (family master switch AND per-user hides). Absent
	// keys default to visible so the component stays safe when not supplied.
	export let modules: Record<string, boolean> = {};

	const visible = (id: string) => modules[id] ?? true;

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
		{#if visible('glance') || visible('top3')}
			<div class="grid gap-4 md:grid-cols-2">
				{#if visible('glance')}
					<TodayGlanceCard {dateLabel} {isToday} events={dayEvents} onEventClick={openEvent} />
				{/if}
				<div class="space-y-4">
					{#if visible('top3')}
						<TopPrioritiesCard tasks={top3} {meId} />
					{/if}
					{#if visible('completed')}
						<CompletedTodayCard tasks={completedToday} {isToday} />
					{/if}
				</div>
			</div>
		{:else if visible('completed')}
			<CompletedTodayCard tasks={completedToday} {isToday} />
		{/if}

		{#if familyId && (visible('memberStrip') || visible('board'))}
			<div class="grid gap-4 md:grid-cols-2">
				{#if familyId && visible('memberStrip')}
					<MemberStrip members={memberStatus} {isToday} />
				{/if}
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
			</div>
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
