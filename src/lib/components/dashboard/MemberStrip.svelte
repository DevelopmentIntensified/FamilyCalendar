<script lang="ts">
	import { avatarColor } from '$lib/utils/avatarColor';

	export let members: {
		userId: string;
		firstName: string;
		lastName: string;
		openTasksToday: number;
		attendingToday: boolean;
	}[];
</script>

<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
	<h2 class="text-sm font-semibold text-slate-900">Today in the Family</h2>
	<p class="mb-3 text-xs text-slate-400">Open tasks &amp; events by member</p>
	<div class="flex flex-wrap gap-2">
		{#each members as m (m.userId)}
			<div
				class="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/60 py-1 pl-1 pr-3"
				title="{m.firstName} — {m.openTasksToday} open task{m.openTasksToday === 1 ? '' : 's'}{m.attendingToday
					? ', has an event today'
					: ''}"
			>
				<span
					class="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold {avatarColor(
						m.userId
					)}"
				>
					{m.firstName?.[0]?.toUpperCase() ?? '?'}
					{#if m.attendingToday}
						<span
							class="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500"
							aria-label="Has an event today"
						></span>
					{/if}
				</span>
				<span class="text-sm font-medium text-slate-700">{m.firstName}</span>
				<span
					class="rounded-full px-1.5 py-0.5 text-[11px] font-semibold {m.openTasksToday > 0
						? 'bg-primary-100 text-primary-700'
						: 'bg-slate-100 text-slate-400'}"
				>
					{m.openTasksToday} open
				</span>
				{#if m.attendingToday}
					<span
						class="flex items-center gap-1 rounded-full bg-primary-50 px-1.5 py-0.5 text-[11px] font-semibold text-primary-700"
						title="Has an event today"
					>
						<span class="h-1.5 w-1.5 rounded-full bg-primary-500"></span>
						event
					</span>
				{/if}
			</div>
		{/each}
	</div>
</div>