<script lang="ts">
	import DailyVerseCard from '$lib/components/calendar/DailyVerseCard.svelte';
	import TodayGlanceCard from './TodayGlanceCard.svelte';
	import TopPrioritiesCard from './TopPrioritiesCard.svelte';
	import FamilyTaskBoardCard from './FamilyTaskBoardCard.svelte';
	import MemberStrip from './MemberStrip.svelte';

	export let dateLabel: string;
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
</script>

<div class="mx-auto w-full max-w-5xl space-y-4">
	{#if dailyVerse}
		<DailyVerseCard reference={dailyVerse.reference} text={dailyVerse.text} attribution={dailyVerse.attribution} />
	{/if}

	<div class="grid gap-4 lg:grid-cols-2">
		<TodayGlanceCard
			{dateLabel}
			events={dayEvents}
			openToday={glance.openToday}
			doneToday={glance.doneToday}
			weekStreak={glance.weekStreak}
		/>
		<TopPrioritiesCard tasks={top3} meId={meId} />
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		{#if familyId}
			<MemberStrip members={memberStatus} />
		{/if}
		{#if familyId}
			<FamilyTaskBoardCard tasks={familyTasks} members={familyMembers} meId={meId} />
		{/if}
	</div>
</div>