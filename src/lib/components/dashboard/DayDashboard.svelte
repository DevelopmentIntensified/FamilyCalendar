<script lang="ts">
	import DailyVerseCard from '$lib/components/calendar/DailyVerseCard.svelte';
	import TodayGlanceCard from './TodayGlanceCard.svelte';
	import TopPrioritiesCard from './TopPrioritiesCard.svelte';
	import FamilyTaskBoardCard from './FamilyTaskBoardCard.svelte';
	import MemberStrip from './MemberStrip.svelte';

	export let dateLabel: string;
	export let isToday: boolean = true;
	export let meId: string;
	export let familyId: string | null;
	export let dailyVerse: { reference: string; text: string; attribution?: string } | null;
	export let glance: { doneToday: number; openToday: number; weekStreak: number };
	export let dayEvents: {
		id: string;
		title: string;
		start: Date | string;
		end: Date | string | null;
		allDay: boolean;
		color: string;
		source: 'own' | 'family';
		location: string | null;
	}[];
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
	// Per-module visibility (family master switch AND per-user hides). Absent
	// keys default to visible so the component stays safe when not supplied.
	export let modules: Record<string, boolean> = {};

	const visible = (id: string) => modules[id] ?? true;
</script>

<div class="mx-auto w-full max-w-5xl space-y-4">
	{#if dailyVerse && visible('verse')}
		<DailyVerseCard reference={dailyVerse.reference} text={dailyVerse.text} attribution={dailyVerse.attribution} />
	{/if}

	{#if visible('glance') || visible('top3')}
		<div class="grid gap-4 lg:grid-cols-2">
			{#if visible('glance')}
				<TodayGlanceCard
					{dateLabel}
					{isToday}
					events={dayEvents}
					openToday={glance.openToday}
					doneToday={glance.doneToday}
					weekStreak={glance.weekStreak}
				/>
			{/if}
			{#if visible('top3')}
				<TopPrioritiesCard tasks={top3} meId={meId} />
			{/if}
		</div>
	{/if}

	{#if familyId && (visible('memberStrip') || visible('board'))}
		<div class="grid gap-4 lg:grid-cols-2">
			{#if familyId && visible('memberStrip')}
				<MemberStrip members={memberStatus} />
			{/if}
			{#if familyId && visible('board')}
				<FamilyTaskBoardCard tasks={familyTasks} members={familyMembers} meId={meId} />
			{/if}
		</div>
	{/if}
</div>