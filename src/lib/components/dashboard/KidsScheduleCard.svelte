<script lang="ts">
	import { DateTime } from 'luxon';
	import { avatarColor } from '$lib/utils/avatarColor';

	interface KidsEvent {
		id: string;
		title: string;
		start: string;
		end: string | null;
		allDay: boolean;
		location: string | null;
		/** Child attendees by id — the card groups and colours per child. */
		kids: { id: string; name: string }[];
	}

	export let events: KidsEvent[];
	export let isToday: boolean = true;
	/** Where the empty-state "View family" link points (DayDashboard leaves the default). */
	export let familyHref: string = '/family';

	function timeLabel(e: KidsEvent): string {
		if (e.allDay) return 'All day';
		const start = DateTime.fromISO(e.start);
		if (!start.isValid) return '';
		const end = e.end ? DateTime.fromISO(e.end) : null;
		const endLabel = end && end.isValid ? ` – ${end.toFormat('h:mm a')}` : '';
		return `${start.toFormat('h:mm a')}${endLabel}`;
	}

	function sortByStart(a: KidsEvent, b: KidsEvent): number {
		if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
		return DateTime.fromISO(a.start).toMillis() - DateTime.fromISO(b.start).toMillis();
	}

	/**
	 * One group per child, in the order their first event starts. An event two
	 * children share appears under both — it was one card with two chips, which
	 * made it impossible to read "Mia's Tuesday" as a column.
	 */
	function groupByChild(list: KidsEvent[]) {
		const order: { id: string; name: string }[] = [];
		const byChild = new Map<string, { kid: { id: string; name: string }; events: KidsEvent[] }>();
		for (const event of [...list].sort(sortByStart)) {
			for (const kid of event.kids) {
				let group = byChild.get(kid.id);
				if (!group) {
					group = { kid, events: [] };
					byChild.set(kid.id, group);
					order.push(kid);
				}
				group.events.push(event);
			}
		}
		return order.map((kid) => ({ kid, events: byChild.get(kid.id)!.events }));
	}

	$: groups = groupByChild(events);

	/** Up to two initials, for the child's avatar. */
	function initials(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return '?';
		return parts
			.slice(0, 2)
			.map((p) => p[0].toUpperCase())
			.join('');
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
		<!-- One band per child, coloured by their own id. Flat-by-event before,
		     with every child in the same purple chip: colour carried no
		     information at all (072). -->
		<div class="space-y-3">
			{#each groups as group (group.kid.id)}
				<section
					class="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5"
					aria-label={group.kid.name}
				>
					<div class="mb-1.5 flex items-center gap-2">
						<span
							data-kid={group.kid.id}
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold {avatarColor(
								group.kid.id
							)}"
							aria-hidden="true"
						>
							{initials(group.kid.name)}
						</span>
						<h3 class="truncate text-sm font-semibold text-slate-900">{group.kid.name}</h3>
					</div>
					<ul class="space-y-1">
						{#each group.events as event (event.id)}
							<li class="flex items-baseline gap-2 text-sm text-slate-700">
								<span class="min-w-0 flex-1 truncate font-medium text-slate-900">
									{event.title}
								</span>
								<span class="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
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
