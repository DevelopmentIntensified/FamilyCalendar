<!--
	Kids' Schedule: one band per child, coloured from the child's id, each row
	showing title, `All day` or start–end, and location. A shared event repeats
	under every child attending it.

	Legacy reference: `components/dashboard/KidsScheduleCard.svelte` (072).
-->
<script lang="ts">
	import type { DashboardKidsEventRow } from '../dayDashboard.contract';
	import { groupKidsSchedule, initialsFromName } from '../dayDashboard.cards.rules';
	import { idColor } from '$lib/kernel/ui/colorHash';

	interface Props {
		events: readonly DashboardKidsEventRow[];
		isToday: boolean;
		/** Where the empty state's "View family" link points. */
		familyHref?: string;
	}

	let { events, isToday, familyHref = '/family' }: Props = $props();

	const groups = $derived(groupKidsSchedule(events));

	function clock(iso: string): string {
		const at = new Date(iso);
		if (Number.isNaN(at.getTime())) return '';
		return at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	}

	function timeLabel(event: DashboardKidsEventRow): string {
		if (event.allDay) return 'All day';
		const start = clock(event.start);
		if (!start) return '';
		const end = event.end ? clock(event.end) : '';
		return `${start}${end ? ` – ${end}` : ''}`;
	}
</script>

<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
	<h2 class="mb-3 text-sm font-semibold text-slate-900">Kids' Schedule</h2>

	{#if events.length === 0}
		<div
			class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400"
		>
			<p>{isToday ? "No kids' events today — free afternoon!" : "No kids' events this day"}</p>
			<a
				href={familyHref}
				class="mt-1 inline-block text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline"
			>
				View family →
			</a>
		</div>
	{:else}
		<div class="space-y-3">
			{#each groups as group (group.kid.id)}
				<section
					class="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5"
					aria-label={group.kid.name}
				>
					<div class="mb-1.5 flex items-center gap-2">
						<span
							data-kid={group.kid.id}
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold {idColor(
								group.kid.id
							)}"
							aria-hidden="true"
						>
							{initialsFromName(group.kid.name)}
						</span>
						<h3 class="truncate text-sm font-semibold text-slate-900">{group.kid.name}</h3>
					</div>
					<ul class="space-y-1">
						{#each group.events as event (event.id)}
							<li class="flex items-baseline gap-2 text-sm text-slate-700">
								<span class="min-w-0 flex-1 truncate font-medium text-slate-900">{event.title}</span>
								<span
									class="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
								>
									{timeLabel(event)}
								</span>
								{#if event.location}
									<span class="hidden shrink-0 truncate text-xs text-slate-500 sm:inline">
										· {event.location}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}
</div>
