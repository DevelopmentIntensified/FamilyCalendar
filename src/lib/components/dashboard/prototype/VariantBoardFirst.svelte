<script lang="ts">
	/** PROTOTYPE (issue 208, round 3) — Variant C "Rhythm, Integrated": the
	 *  round-2 arrangement (KPI bar + 3+3 equal-height rows) with the card
	 *  INTERNALS unified into one visual system:
	 *  - one shell: rounded-2xl border-slate-200 bg-white p-4 (no shadow)
	 *  - one header: title left, count/aux right
	 *  - one row: unboxed flex rows, hover-slate, min-h-9
	 *  - one group header: avatar chip + name + count (the board's own)
	 *  - one badge: text-only rounded-full 10px chips (no emoji)
	 *  - one footer: bottom-right primary link, only where navigation exists
	 *  - one empty state: the dashed box
	 *  Throwaway: helpers are copied from the real cards, content is
	 *  faithful, mutations are stubbed (visual-only). */
	import { DateTime } from 'luxon';
	import { showsModule } from '$lib/dashboardModules';
	import { rsvpVisual } from '$lib/utils/eventChip';
	import { chipShell } from '$lib/utils/chipVocabulary';
	import { avatarColor } from '$lib/utils/avatarColor';
	import type { PrototypeProps, VariantKey } from './prototypeProps';
	import DashboardInfoBand from '../DashboardInfoBand.svelte';
	import type { GlanceEvent } from '../TodayGlanceCard.svelte';

	let {
		dateLabel,
		isToday,
		meId,
		familyId,
		dailyVerse,
		glance,
		dayEvents,
		top3,
		familyTasks,
		familyMembers,
		kidsSchedule,
		completedToday,
		familyGroceries,
		mineGroceries,
		loadWarnings,
		modules,
		onEventClick
	}: PrototypeProps & { variant?: VariantKey } = $props();

	// ===== copied helpers (faithful to the real cards) =====
	function timeLabel(start: Date | string, end?: Date | string | null): string {
		const s = DateTime.fromISO(String(start));
		if (!s.isValid) return '';
		const e = end ? DateTime.fromISO(String(end)) : null;
		return e && e.isValid ? `${s.toFormat('h:mm')}–${e.toFormat('h:mm a')}` : s.toFormat('h:mm a');
	}
	function kidTime(ev: { start: string; end: string | null; allDay: boolean }): string {
		if (ev.allDay) return 'all day';
		const s = DateTime.fromISO(ev.start);
		const e = ev.end ? DateTime.fromISO(ev.end) : null;
		if (!s.isValid) return '';
		return e && e.isValid ? `${s.toFormat('h:mm')}–${e.toFormat('h:mm a')}` : s.toFormat('h:mm a');
	}
	function initials(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return '?';
		return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
	}
	function memberName(userId: string): string {
		const m = familyMembers.find((x) => x.userId === userId);
		return m ? `${m.firstName} ${m.lastName}`.trim() : 'A member';
	}
	function dueTone(due: string): string {
		const d = DateTime.fromISO(due).startOf('day');
		const today = DateTime.fromISO(new Date().toISOString()).startOf('day');
		if (d < today) return 'bg-red-100 text-red-700';
		if (d.hasSame(today, 'day')) return 'bg-amber-100 text-amber-700';
		return 'bg-slate-100 text-slate-600';
	}
	function dueLabel(due: string): string {
		const d = DateTime.fromISO(due).startOf('day');
		const today = DateTime.fromISO(new Date().toISOString()).startOf('day');
		if (!d.isValid) return due;
		const days = Math.round(d.diff(today, 'days').days);
		if (days === 0) return 'Due today';
		if (days === 1) return 'Due tomorrow';
		if (days < 0) return `Overdue ${Math.abs(days)}d`;
		return d.toFormat('MMM d');
	}
	const PRIORITY_LABEL: Record<string, string> = { high: 'High', medium: 'Med', low: 'Low' };

	// ===== stubbed mutations (visual only) =====
	let checked = $state<Record<string, boolean>>({});
	let prioritized = $state<Record<string, string>>({});
	let protoNotice = $state('');
	function stub(name: string) {
		protoNotice = `Prototype: “${name}” would act here.`;
		setTimeout(() => (protoNotice = ''), 2200);
	}

	// ===== derived shapes =====
	const allDayEvents = $derived(dayEvents.filter((e) => e.allDay));
	const timedEvents = $derived(dayEvents.filter((e) => !e.allDay));
	const nextEvent = $derived(dayEvents.find((e) => !e.allDay) ?? null);

	/** Top-3, split by its own real logic: mine first, then family. */
	const myTop = $derived(top3.filter((t) => t.userId === meId));
	const familyTop = $derived(top3.filter((t) => t.userId !== meId));

	const boardGroups = $derived.by(() => {
		const open = familyTasks.filter((t) => !t.completedAt);
		const ids: string[] = [];
		for (const t of open) {
			const owner = t.assignedTo ?? t.userId;
			if (!ids.includes(owner)) ids.push(owner);
		}
		for (const m of familyMembers) if (!ids.includes(m.userId)) ids.push(m.userId);
		return ids.map((id) => ({
			ownerId: id,
			name: memberName(id),
			tasks: open.filter((t) => (t.assignedTo ?? t.userId) === id)
		}));
	});

	const kidGroups = $derived.by(() => {
		const groups: { kid: { id: string; name: string }; events: PrototypeProps['kidsSchedule'] }[] =
			[];
		for (const ev of kidsSchedule) {
			for (const kid of ev.kids) {
				let g = groups.find((x) => x.kid.id === kid.id);
				if (!g) {
					g = { kid, events: [] };
					groups.push(g);
				}
				g.events.push(ev);
			}
		}
		return groups;
	});

	const groceryScopes = $derived([
		...(familyId && familyGroceries.length > 0
			? [{ key: 'family', label: 'Family', items: familyGroceries }]
			: []),
		...(mineGroceries.length > 0 ? [{ key: 'mine', label: 'Mine', items: mineGroceries }] : [])
	]);

	// groupGroceriesByStore faithful copy (store names in order, first-seen)
	function storesOf(items: PrototypeProps['familyGroceries']): string[] {
		const out: string[] = [];
		for (const it of items) for (const s of it.stores) if (!out.includes(s)) out.push(s);
		return out;
	}
</script>

<div class="mx-auto w-full max-w-6xl space-y-4" data-fb="page" data-fb-label="C · Rhythm, Integrated">
	{#if loadWarnings.length > 0}
		<div class="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
			Couldn't load {loadWarnings.join(', ')} just now — everything else is up to date.
		</div>
	{/if}

	{#if protoNotice}
		<div class="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700" role="status">
			{protoNotice}
		</div>
	{/if}

	{#if dailyVerse && showsModule(modules, 'verse')}
		<DashboardInfoBand {dailyVerse} />
	{/if}

	<!-- KPI bar -->
	<div class="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-slate-200 bg-white px-5 py-3" data-fb="kpi" data-fb-label="Morning numbers">
		<span class="text-sm font-medium text-slate-900">{dateLabel}{isToday ? ' · today' : ''}</span>
		{#if nextEvent}
			<span class="text-sm text-slate-600">Next: <b class="font-semibold">{nextEvent.title}</b></span>
		{:else if isToday}
			<span class="text-sm text-slate-500">Nothing left on today's calendar</span>
		{/if}
		<span class="ml-auto flex gap-5 text-sm tabular-nums">
			<span class="text-slate-500">{glance.openToday} <span class="text-slate-400">open</span></span>
			<span class="text-slate-500">{glance.doneToday} <span class="text-slate-400">done</span></span>
			<span class="text-slate-500">{glance.weekStreak} <span class="text-slate-400">wk streak</span></span>
		</span>
	</div>

	<!-- Row 1: the day's own reading. -->
	{#if showsModule(modules, 'glance') || showsModule(modules, 'top3') || showsModule(modules, 'completed')}
		<div class="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:flex [&>*]:flex-col" data-fb="row-day">
			{#if showsModule(modules, 'glance')}
				<section class="rounded-2xl border border-slate-200 bg-white p-4" data-fb="glance" data-fb-label="Today's events">
					<header class="mb-2 flex items-baseline justify-between">
						<h2 class="text-sm font-semibold text-slate-900">Today's events</h2>
						<span class="text-xs tabular-nums text-slate-400">{dayEvents.length}</span>
					</header>
					{#if allDayEvents.length > 0}
						<div class="mb-2 flex flex-col gap-0.5">
							{#each allDayEvents as e (e.id)}
								{@const chip = chipShell({ event: e, density: 'word' })}
								<button
									type="button"
									onclick={() => onEventClick(e)}
									class="flex min-h-9 items-center gap-2.5 rounded-lg px-2 text-left hover:bg-slate-50"
								>
									<span class="min-w-0 flex-1 truncate text-sm text-slate-700">{e.title}</span>
									{#if e.source === 'family'}
										<span class="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-600">Family</span>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
					{#if timedEvents.length > 0}
						<div class="flex flex-col">
							{#each timedEvents as e (e.id)}
								{@const rv = rsvpVisual(e.rsvpStatus)}
								{@const chip = chipShell({ event: e, density: 'word' })}
								<button
									type="button"
									onclick={() => onEventClick(e)}
									class="flex min-h-9 items-center gap-2.5 rounded-lg px-2 text-left hover:bg-slate-50"
								>
									<span class="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-600">
										{timeLabel(e.start, e.end)}
									</span>
									<span class="h-2 w-2 shrink-0 rounded-full" style:background={e.color} aria-hidden="true"></span>
									<span class="min-w-0 flex-1 truncate text-sm text-slate-700">{e.title}</span>
									{#if rv}
										<span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold {rv.badgeClass}">{rv.label}</span>
									{/if}
									{#if e.location}
										<span class="hidden shrink-0 text-xs text-slate-400 sm:block">· {e.location}</span>
									{/if}
									{#if e.source === 'family'}
										<span class="shrink-0 rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-600">Family</span>
									{/if}
								</button>
							{/each}
						</div>
					{:else if allDayEvents.length === 0}
						<div class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
							<p>{isToday ? 'No events scheduled today' : 'No events scheduled on this day'}</p>
						</div>
					{/if}
					<footer class="mt-3 text-right">
						<a href="/calendar?view=day" class="text-xs font-semibold text-primary-600 hover:underline">Open day view →</a>
					</footer>
				</section>
			{/if}

			{#if showsModule(modules, 'top3')}
				<section class="rounded-2xl border border-slate-200 bg-white p-4" data-fb="top3" data-fb-label="Top 3">
					<header class="mb-2 flex items-baseline justify-between">
						<h2 class="text-sm font-semibold text-slate-900">Top 3</h2>
						<span class="text-xs tabular-nums text-slate-400">{top3.length}</span>
					</header>
					{#if top3.length === 0}
						<div class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
							Nothing due today.
						</div>
					{:else}
						{#each [myTop, familyTop] as group, gi (gi)}
							{#if group.length > 0}
								<h3 class="mb-1 mt-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
									{gi === 0 ? 'Mine' : 'Family'}
									<span class="tabular-nums">· {group.length}</span>
								</h3>
								<ol class="flex flex-col" start={gi === 0 ? 1 : myTop.length + 1}>
									{#each group as task (task.id)}
										<li class="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-slate-50" data-testid={`proto-top3-${task.id}`}>
											<span class="w-4 shrink-0 text-center text-xs font-bold text-slate-300">{gi * myTop.length + group.indexOf(task) + 1}</span>
											<button
												type="button"
												class="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors {checked[task.id] ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 hover:border-primary-500'}"
												onclick={() => (checked[task.id] = !checked[task.id])}
												aria-label="Mark done: {task.title}"
											>
												{#if checked[task.id]}
													<svg class="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="4"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
												{/if}
											</button>
											<div class="min-w-0 flex-1">
												<p class="truncate text-sm font-medium text-slate-900">{task.title}</p>
												<p class="text-[11px] text-slate-400">{memberName(task.assignedTo ?? task.userId)}</p>
											</div>
											<span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium {dueTone(task.dueDate ?? '')}">{dueLabel(task.dueDate ?? '')}</span>
											<div class="flex shrink-0 items-center gap-0.5">
												{#each ['high', 'medium', 'low'] as p (p)}
													<button
														type="button"
														class="min-h-9 rounded-md px-2 text-[11px] font-semibold {prioritized[task.id] ?? task.priority === p
															? 'bg-slate-800 text-white'
															: 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'}"
														onclick={() => stub(`priority → ${p}`)}
														aria-label="Set priority {PRIORITY_LABEL[p]}"
													>
														{PRIORITY_LABEL[p]}
													</button>
												{/each}
											</div>
										</li>
									{/each}
								</ol>
							{/if}
						{/each}
						<footer class="mt-3 text-right">
							<a href="/calendar/tasks" class="text-xs font-semibold text-primary-600 hover:underline">All tasks →</a>
						</footer>
					{/if}
				</section>
			{/if}

			{#if showsModule(modules, 'completed')}
				<section class="rounded-2xl border border-slate-200 bg-white p-4" data-fb="completed" data-fb-label="Completed">
					<header class="mb-2 flex items-baseline justify-between">
						<h2 class="text-sm font-semibold text-slate-900">Completed{isToday ? ' today' : ''}</h2>
						<span class="text-xs tabular-nums text-slate-400">{completedToday.length}</span>
					</header>
					{#if completedToday.length === 0}
						<div class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
							{isToday ? 'Nothing checked off yet — wins land here.' : 'Nothing was completed this day.'}
						</div>
					{:else}
						<ul class="flex flex-col">
							{#each completedToday as task (task.id)}
								<li class="flex min-h-9 items-center gap-2.5 rounded-lg px-2 hover:bg-slate-50">
									<span class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white" aria-hidden="true">
										<svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="4"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
									</span>
									<span class="min-w-0 flex-1 truncate text-sm text-slate-600 line-through">{task.title}</span>
									{#if task.completedAt}
										<span class="shrink-0 text-xs tabular-nums text-slate-400">{timeLabel(task.completedAt)}</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{/if}
		</div>
	{/if}

	<!-- Row 2: the household. -->
	{#if (familyId && showsModule(modules, 'board')) || (familyId && showsModule(modules, 'kids')) || showsModule(modules, 'groceries')}
		<div class="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:flex [&>*]:flex-col" data-fb="row-household">
			{#if familyId && showsModule(modules, 'board')}
				<section class="rounded-2xl border border-slate-200 bg-white p-4" data-fb="board" data-fb-label="Family board">
					<header class="mb-2 flex items-baseline justify-between">
						<h2 class="text-sm font-semibold text-slate-900">Family board</h2>
						<span class="text-xs tabular-nums text-slate-400">{familyTasks.filter((t) => !t.completedAt).length}</span>
					</header>
					<div class="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2">
						<input
							type="text"
							class="min-h-8 min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-300"
							placeholder="Quick add a family task…"
							onkeydown={(e) => e.key === 'Enter' && stub('quick add')}
						/>
						<button
							type="button"
							class="shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white"
							onclick={() => stub('quick add')}
						>
							Add
						</button>
					</div>
					{#if boardGroups.every((g) => g.tasks.length === 0)}
						<div class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
							No open family tasks — enjoy the calm.
						</div>
					{:else}
						<div class="flex flex-col gap-2.5">
							{#each boardGroups as g (g.ownerId)}
								<section>
									<h3 class="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
										<span class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold {avatarColor(g.ownerId)}">{initials(g.name)}</span>
										{g.name}
										<span class="font-normal normal-case text-slate-300">· {g.tasks.length}</span>
									</h3>
									{#if g.tasks.length === 0}
										<p class="pl-7 text-xs text-slate-400">nothing assigned</p>
									{:else}
										<div class="flex flex-col">
											{#each g.tasks as task (task.id)}
												<div class="flex min-h-9 items-center gap-2.5 rounded-lg px-2 hover:bg-slate-50" data-testid={`proto-board-${task.id}`}>
													<button
														type="button"
														class="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 hover:border-primary-500"
														onclick={() => stub('mark done')}
														aria-label="Mark done: {task.title}"
													></button>
													<span class="h-2 w-2 shrink-0 rounded-full bg-slate-300" title="{task.priority} priority" aria-hidden="true"></span>
													<p class="min-w-0 flex-1 truncate text-sm text-slate-800">{task.title}</p>
													{#if task.dueDate}
														<span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium {dueTone(task.dueDate)}">{dueLabel(task.dueDate)}</span>
													{/if}
												</div>
											{/each}
										</div>
									{/if}
								</section>
							{/each}
						</div>
					{/if}
				</section>
			{/if}

			{#if familyId && showsModule(modules, 'kids')}
				<section class="rounded-2xl border border-slate-200 bg-white p-4" data-fb="kids" data-fb-label="Kids' schedule">
					<header class="mb-2 flex items-baseline justify-between">
						<h2 class="text-sm font-semibold text-slate-900">Kids' Schedule</h2>
						<span class="text-xs tabular-nums text-slate-400">{kidsSchedule.length}</span>
					</header>
					{#if kidGroups.length === 0}
						<div class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
							<p>{isToday ? "No kids' events today — free afternoon!" : "No kids' events this day"}</p>
						</div>
					{:else}
						<div class="flex flex-col gap-2.5">
							{#each kidGroups as g (g.kid.id)}
								<section>
									<h3 class="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
										<span class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold {avatarColor(g.kid.id)}">{initials(g.kid.name)}</span>
										{g.kid.name}
										<span class="font-normal normal-case text-slate-300">· {g.events.length}</span>
									</h3>
									<div class="flex flex-col">
										{#each g.events as ev (ev.id)}
											<div class="flex min-h-9 items-center gap-2.5 rounded-lg px-2 hover:bg-slate-50">
												<span class="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-600">{kidTime(ev)}</span>
												<span class="min-w-0 flex-1 truncate text-sm text-slate-700">{ev.title}</span>
												{#if ev.location}
													<span class="hidden shrink-0 text-xs text-slate-400 sm:block">· {ev.location}</span>
												{/if}
											</div>
										{/each}
									</div>
								</section>
							{/each}
						</div>
					{/if}
					<footer class="mt-3 text-right">
						<a href="/family" class="text-xs font-semibold text-primary-600 hover:underline">Family →</a>
					</footer>
				</section>
			{/if}

			{#if showsModule(modules, 'groceries')}
				<section class="rounded-2xl border border-slate-200 bg-white p-4" data-fb="groceries" data-fb-label="Groceries">
					<header class="mb-2 flex items-baseline justify-between">
						<h2 class="text-sm font-semibold text-slate-900">Groceries</h2>
						<span class="text-xs tabular-nums text-slate-400">{familyGroceries.length + mineGroceries.length} open</span>
					</header>
					{#if groceryScopes.length === 0}
						<div class="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
							Nothing on the list yet.
						</div>
					{:else}
						<div class="flex flex-col gap-2.5">
							{#each groceryScopes as scope (scope.key)}
								<section>
									<h3 class="mb-1 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400">
										{scope.label}
										<span class="font-normal normal-case text-slate-300">· {scope.items.length}</span>
									</h3>
									<div class="flex flex-wrap gap-1 px-2">
										{#each storesOf(scope.items) as store (store)}
											<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{store}</span>
										{/each}
									</div>
									<p class="mt-1 px-2 break-words text-sm text-slate-700">
										{scope.items.slice(0, 3).map((i) => i.name).join(', ')}{#if scope.items.length > 3}, +{scope.items.length - 3} more{/if}
									</p>
								</section>
							{/each}
						</div>
					{/if}
					<footer class="mt-3 text-right">
						<a href="/calendar/groceries" class="text-xs font-semibold text-primary-600 hover:underline">Open list →</a>
					</footer>
				</section>
			{/if}
		</div>
	{/if}
</div>
