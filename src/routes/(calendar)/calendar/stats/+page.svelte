<script lang="ts">
	import { DateTime } from 'luxon';
	import type { PageData } from './$types';

	export let data: PageData;

	$: stats = data.stats;
</script>

<div class="min-h-screen bg-slate-50 px-4 py-8 pt-20">
	<div class="mx-auto max-w-4xl">
		<h1 class="mb-1 text-2xl font-bold text-slate-900">Task Stats</h1>
		<p class="mb-6 text-sm text-slate-500">Your completions, recurring load and assignment partners.</p>

		<div class="mb-8 grid gap-4 sm:grid-cols-3">
			<div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
				<p class="text-3xl font-bold text-primary-600">{stats.completedOnce}</p>
				<p class="text-sm text-slate-500">Completed tasks</p>
			</div>
			<div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
				<p class="text-3xl font-bold text-purple-600">{stats.recurringTasks}</p>
				<p class="text-sm text-slate-500">Recurring tasks</p>
			</div>
			<div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
				<p class="text-3xl font-bold text-emerald-600">{stats.recurringCompletions}</p>
				<p class="text-sm text-slate-500">Recurring check-offs</p>
			</div>
		</div>

		<div class="mb-8 grid gap-4 sm:grid-cols-2">
			<section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
					Assigned you the most
				</h2>
				<ul class="space-y-2">
					{#each stats.topAssigners as person (person.name)}
						<li class="flex items-center justify-between text-sm">
							<span class="text-slate-800">{person.name}</span>
							<span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
								{person.total} task{person.total === 1 ? '' : 's'}
							</span>
						</li>
					{:else}
						<li class="text-sm text-slate-400">No one yet</li>
					{/each}
				</ul>
			</section>

			<section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
					You assign the most
				</h2>
				<ul class="space-y-2">
					{#each stats.topAssignees as person (person.name)}
						<li class="flex items-center justify-between text-sm">
							<span class="text-slate-800">{person.name}</span>
							<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
								{person.total} task{person.total === 1 ? '' : 's'}
							</span>
						</li>
					{:else}
						<li class="text-sm text-slate-400">No one yet</li>
					{/each}
				</ul>
			</section>
		</div>

		<section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
			<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
				Recently completed
			</h2>
			<ul class="divide-y divide-slate-100">
				{#each stats.recentlyCompleted as t (t.title + t.completedAt)}
					<li class="flex items-center justify-between py-2 text-sm">
						<span class="truncate text-slate-800">
							{t.title}
							{#if t.recurring}
								<span class="ml-1 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700"
									>recurring</span
								>
							{/if}
						</span>
						<span class="shrink-0 text-xs text-slate-400">
							{t.completedAt ? DateTime.fromISO(t.completedAt).toFormat('MMM d') : ''}
						</span>
					</li>
				{:else}
					<li class="py-2 text-sm text-slate-400">Nothing completed yet</li>
				{/each}
			</ul>
		</section>
	</div>
</div>
