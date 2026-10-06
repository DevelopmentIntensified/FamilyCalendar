<script lang="ts">
	import { DateTime } from 'luxon';
	import type { PageData } from './$types';
	import {
		assignmentBars,
		monthCompletionLabel,
		recentWeekCells
	} from './statsPageModel';

	export let data: PageData;

	$: stats = data.stats;
	$: streak = data.streak;
	// The hero's squares and the number above them are drawn from one list of
	// instants, so the grid can never disagree with the streak it illustrates.
	$: weeks = recentWeekCells(data.completionIso ?? [], data.todayIso);
	$: monthLabel = monthCompletionLabel(data.todayIso);
	$: landOn = assignmentBars(stats.topAssignees);
	$: comeFrom = assignmentBars(stats.topAssigners);
</script>

<svelte:head>
	<title>Task Stats - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8 pt-20">
	<div class="mx-auto max-w-5xl">
		<h1 class="mb-1 text-2xl font-bold text-slate-900">Task stats</h1>
		<p class="mb-6 text-sm text-slate-500">
			Everything here is a read of the completion history - the one record that survives the
			recurring-task cursor overwriting itself.
		</p>

		<!-- 093 rerun: the hero takes columns 2-3 and the recent list takes
		     column 1, so the list sits DIRECTLY ABOVE "This month" at every
		     width. Grid flow, not a hardcoded row number. -->
		<div class="mb-6 grid gap-4 lg:grid-cols-3">
			<section
				data-testid="streak-hero"
				class="rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-6 shadow-sm lg:col-span-2"
			>
				<div class="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p
							class="text-[10px] font-bold uppercase tracking-widest text-slate-400"
						>
							Current streak
						</p>
						<p class="mt-1 flex items-baseline gap-1.5" data-testid="streak-weeks">
							<span class="text-5xl font-extrabold tracking-tight text-slate-900"
								>{streak.current}</span
							>
							<span class="text-base font-bold text-slate-700">weeks</span>
						</p>
						<p class="mt-1.5 text-xs text-slate-400">
							Best: {streak.best} weeks{streak.freezeUsedInCurrentGap ? ' · one frozen' : ''}
						</p>
					</div>
					<div class="grid min-w-[13rem] flex-1 grid-cols-7 gap-2">
						{#each weeks as week (week.key)}
							<span class="flex flex-col items-center gap-1.5" data-testid="streak-week">
								<i
									class="block h-9 w-full rounded-lg {week.hit
										? 'bg-mint-200'
										: 'bg-slate-100'} {week.isCurrent
										? 'ring-2 ring-primary-500 ring-offset-1'
										: ''}"
									aria-hidden="true"
								></i>
								<b class="text-[9px] font-bold uppercase text-slate-400">{week.label}</b>
							</span>
						{/each}
					</div>
				</div>
				<p class="mt-4 text-xs leading-relaxed text-slate-500">
					Weeks of "at least one task completed". A week is the smallest unit that survives a
					normal family week, and it is the unit a missed Sunday does not erase.
				</p>
			</section>

			<section
				data-testid="recently-completed"
				class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
			>
				<h2 class="mb-3 text-sm font-semibold text-slate-900">Recently completed</h2>
				<ul class="divide-y divide-slate-100">
					{#each stats.recentlyCompleted as t (t.title + t.completedAt)}
						<li class="flex items-center gap-2 py-2 text-sm">
							<span class="truncate text-slate-800">{t.title}</span>
							{#if t.recurring}
								<span
									class="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700"
									>↻ repeating</span
								>
							{/if}
							<span class="ml-auto shrink-0 text-xs tabular-nums text-slate-400">
								{t.completedAt ? DateTime.fromISO(t.completedAt).toFormat('MMM d') : ''}
							</span>
						</li>
					{:else}
						<li class="py-2 text-sm text-slate-400">
							Nothing checked off yet — your first win awaits.
						</li>
					{/each}
				</ul>
				<p class="mt-2.5 text-xs leading-relaxed text-slate-500">
					The repeating tag is not a flag on the task — it is a recurrence on the same row,
					shown next to a timestamp that lives in a different table.
				</p>
			</section>
		</div>

		<!-- 093: one row, one height. The monthly box shares a row with the two
		     bar charts, so it stretches to their height by layout rather than
		     reading as a fraction of its neighbour. `items-stretch` is the grid
		     default; it is stated here so a future `items-start` cannot
		     reintroduce the mark. e2e/calendar/StatsPage.test.ts measures the
		     three rendered heights and fails if they ever diverge. -->
		<div
			data-testid="stats-equal-row"
			class="mb-6 grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3"
		>
			<section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 class="text-sm font-semibold text-slate-900">This month</h2>
				{#if monthLabel}
					<p class="mt-0.5 text-xs text-slate-500">{monthLabel}</p>
				{/if}
				<div class="mt-2 flex flex-wrap gap-x-8 gap-y-4">
					<div>
						<p
							class="text-3xl font-extrabold tracking-tight text-slate-900"
							data-testid="month-completed"
						>
							{data.month?.completed ?? 0}
						</p>
						<p class="text-sm text-slate-500">completed</p>
					</div>
					<div>
						<p
							class="text-3xl font-extrabold tracking-tight text-slate-900"
							data-testid="month-recurring"
						>
							{data.month?.recurring ?? 0}
						</p>
						<p class="text-sm text-slate-500">of them recurring</p>
					</div>
				</div>
			</section>

			{#snippet bars(title: string, rows: typeof landOn, empty: string, testid: string)}
				<section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 class="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
					{#if rows.length === 0}
						<p class="text-sm text-slate-400">{empty}</p>
					{:else}
						{#each rows as row (row.name)}
							<div class="flex items-center gap-2.5 py-1.5">
								<span class="w-20 shrink-0 truncate text-sm font-semibold text-slate-700"
									>{row.name}</span
								>
								<span class="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
									<i
										class="block h-full rounded-full bg-primary-500"
										style="width:{row.pct}%"
										data-testid={testid}
									></i>
								</span>
								<span
									class="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-slate-500"
									>{row.total}</span
								>
							</div>
						{/each}
					{/if}
				</section>
			{/snippet}
			{@render bars('Tasks land on', landOn, 'No assignments out yet.', 'bar-fill')}
			{@render bars('Tasks come from', comeFrom, 'Nobody has assigned you anything yet.', 'bar-fill')}
		</div>
	</div>
</div>