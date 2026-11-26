<!--
	PROTOTYPE (throwaway) — "What should the Tasks page look like?"
	Three structurally different variants on one route, switched with `?v=a|b|c`:
	  A  Focus board  — a Top 3 strip + Today / Upcoming / Later columns, one smart-parsing quick-add.
	  B  Family lanes — one swim-lane per member with a progress ring; per-lane quick-add.
	  C  Clean list   — a grouped list, chip-driven inline quick-add, swipe-style row actions.
	Self-contained: hardcoded mock data, local $state only, no server calls, no edits to the real page.
	Matches the real Task feature set (categories, assignees, due, priority, recurrence, done).
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	// ───────────────────────────── types & mock data ─────────────────────────────
	type Priority = 'urgent' | 'high' | 'normal' | 'low';
	type Category = 'Chores' | 'School' | 'Groceries' | 'Health' | 'Home';
	interface Task {
		id: string;
		title: string;
		assignee: string; // member id | 'family'
		/** Whole days from today (negative = overdue); null = no date. */
		due: number | null;
		priority: Priority;
		recur: string | null;
		category: Category;
		done: boolean;
		/** Optimistic completion not yet "confirmed" by the (mock) server. */
		pending: boolean;
	}
	interface Person {
		id: string;
		name: string;
		role: string;
		chip: string; // avatar chip classes
		stroke: string; // progress-ring stroke class
	}

	const people: Person[] = [
		{ id: 'dad', name: 'Dad', role: 'You', chip: 'bg-sky-100 text-sky-700', stroke: 'stroke-sky-500' },
		{ id: 'mom', name: 'Mom', role: 'Parent', chip: 'bg-rose-100 text-rose-700', stroke: 'stroke-rose-500' },
		{ id: 'maya', name: 'Maya', role: '14', chip: 'bg-violet-100 text-violet-700', stroke: 'stroke-violet-500' },
		{ id: 'leo', name: 'Leo', role: '9', chip: 'bg-emerald-100 text-emerald-700', stroke: 'stroke-emerald-500' },
		{ id: 'ruby', name: 'Ruby', role: '6', chip: 'bg-teal-100 text-teal-700', stroke: 'stroke-teal-500' }
	];
	const everyone: Person = {
		id: 'family',
		name: 'Family',
		role: 'Shared',
		chip: 'bg-slate-200 text-slate-700',
		stroke: 'stroke-primary'
	};
	const lanes: Person[] = [...people, everyone];
	const avatarSize = {
		xs: 'h-4 w-4 text-[9px]',
		sm: 'h-6 w-6 text-xs',
		md: 'h-9 w-9 text-sm',
		lg: 'h-12 w-12 text-lg'
	};
	const who: Record<string, Person> = Object.fromEntries(lanes.map((p) => [p.id, p]));

	const categories: Category[] = ['Chores', 'School', 'Groceries', 'Health', 'Home'];
	const prio: Record<Priority, { label: string; dot: string; text: string; rank: number }> = {
		urgent: { label: 'Urgent', dot: 'bg-red-500', text: 'text-red-700', rank: 0 },
		high: { label: 'High', dot: 'bg-amber-500', text: 'text-amber-700', rank: 1 },
		normal: { label: 'Normal', dot: 'bg-slate-300', text: 'text-slate-500', rank: 2 },
		low: { label: 'Low', dot: 'bg-sky-300', text: 'text-sky-700', rank: 3 }
	};

	let seq = 100;
	function mk(
		title: string,
		category: Category,
		assignee: string,
		due: number | null,
		priority: Priority = 'normal',
		recur: string | null = null,
		done = false
	): Task {
		return { id: `t${seq++}`, title, category, assignee, due, priority, recur, done, pending: false };
	}

	let tasks = $state<Task[]>([
		mk('Pick up prescription at the pharmacy', 'Health', 'dad', -1, 'urgent'),
		mk('Return library books', 'School', 'leo', -2, 'high'),
		mk('Sign the field trip permission slip', 'School', 'mom', 0, 'high'),
		mk('Take out the recycling', 'Chores', 'leo', 0, 'normal', 'every week'),
		mk('Math worksheet, pages 42–43', 'School', 'maya', 0),
		mk('Buy milk, eggs and bananas', 'Groceries', 'dad', 0),
		mk('Feed the cat', 'Chores', 'ruby', 0, 'low', 'every day', true),
		mk('Practice piano for 20 minutes', 'School', 'maya', 0, 'normal', 'every day', true),
		mk('Pay the water bill', 'Home', 'dad', 0, 'normal', null, true),
		mk('Unload the dishwasher', 'Chores', 'leo', 1, 'low', 'every day'),
		mk('Water the plants', 'Home', 'mom', 1, 'low', 'every 3 days'),
		mk('Book dentist for the kids', 'Health', 'mom', 2),
		mk('Science fair poster', 'School', 'maya', 3, 'high'),
		mk('Movie night snacks', 'Groceries', 'family', 3, 'normal', 'every week'),
		mk('Mow the lawn', 'Home', 'dad', 4, 'normal', 'every 2 weeks'),
		mk('Order the cake for Ruby’s birthday', 'Groceries', 'mom', 5, 'high'),
		mk('Clean out the garage', 'Home', 'family', 9, 'low'),
		mk('Replace smoke alarm batteries', 'Home', 'dad', 12),
		mk('Renew car registration', 'Home', 'mom', null)
	]);

	// ───────────────────────────── dates ─────────────────────────────
	const NOW = new Date();
	function dayName(offset: number): string {
		const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offset);
		return d.toLocaleDateString('en-US', { weekday: 'short' });
	}
	function dateName(offset: number): string {
		const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offset);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
	function dueLabel(due: number): string {
		if (due === -1) return 'Yesterday';
		if (due < -1) return `${-due} days late`;
		if (due === 0) return 'Today';
		if (due === 1) return 'Tomorrow';
		if (due < 7) return dayName(due);
		return dateName(due);
	}
	const weekendOffset = (6 - NOW.getDay() + 7) % 7 || 7;

	// ───────────────────────────── page state ─────────────────────────────
	const variants = [
		{ key: 'a', name: 'Focus board' },
		{ key: 'b', name: 'Family lanes' },
		{ key: 'c', name: 'Clean list' }
	] as const;
	const variant = $derived(
		variants.find((v) => v.key === page.url.searchParams.get('v'))?.key ?? 'a'
	);

	let member = $state('all'); // member filter, shared by all variants
	let cat = $state<'all' | Category>('all'); // category filter (variant C)
	let showDone = $state(true);
	let demoEmpty = $state(false); // preview the empty state
	let toast = $state<{ msg: string; undo?: () => void } | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;

	function say(msg: string, undo?: () => void) {
		toast = { msg, undo };
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 4500);
	}

	// ───────────────────────────── derived views ─────────────────────────────
	const sortTasks = (list: Task[]): Task[] =>
		[...list].sort(
			(a, b) =>
				Number(a.done) - Number(b.done) ||
				(a.due ?? 999) - (b.due ?? 999) ||
				prio[a.priority].rank - prio[b.priority].rank
		);

	const base = $derived(
		demoEmpty
			? []
			: tasks.filter((t) => (member === 'all' || t.assignee === member) && (showDone || !t.done))
	);
	const openCount = $derived(tasks.filter((t) => !t.done).length);
	const doneCount = $derived(tasks.length - openCount);
	const pendingCount = $derived(tasks.filter((t) => t.pending).length);

	// A
	const top3 = $derived(
		base
			.filter((t) => !t.done && ((t.due !== null && t.due <= 2) || prio[t.priority].rank <= 1))
			.sort(
				(a, b) =>
					Number((a.due ?? 99) >= 0) - Number((b.due ?? 99) >= 0) ||
					prio[a.priority].rank - prio[b.priority].rank ||
					(a.due ?? 99) - (b.due ?? 99)
			)
			.slice(0, 3)
	);
	const columns = $derived([
		{
			key: 'today',
			title: 'Today',
			hint: 'Due now or already late',
			items: sortTasks(base.filter((t) => t.due !== null && t.due <= 0))
		},
		{
			key: 'upcoming',
			title: 'Upcoming',
			hint: 'The next 7 days',
			items: sortTasks(base.filter((t) => t.due !== null && t.due >= 1 && t.due <= 7))
		},
		{
			key: 'later',
			title: 'Later',
			hint: 'Further out, or no date',
			items: sortTasks(base.filter((t) => t.due === null || t.due > 7))
		}
	]);

	// C
	const listC = $derived(base.filter((t) => cat === 'all' || t.category === cat));
	const groupsC = $derived(
		(
			[
				{ key: 'overdue', title: 'Overdue', tone: 'text-red-600', test: (d: number | null) => d !== null && d < 0 },
				{ key: 'today', title: 'Today', tone: 'text-primary-700', test: (d: number | null) => d === 0 },
				{ key: 'tomorrow', title: 'Tomorrow', tone: 'text-slate-700', test: (d: number | null) => d === 1 },
				{ key: 'week', title: 'This week', tone: 'text-slate-700', test: (d: number | null) => d !== null && d >= 2 && d <= 7 },
				{ key: 'later', title: 'Later', tone: 'text-slate-500', test: (d: number | null) => d === null || d > 7 }
			] as const
		)
			.map((g) => ({
				...g,
				items: sortTasks(listC.filter((t) => !t.done && g.test(t.due)))
			}))
			.filter((g) => g.items.length > 0)
	);
	const doneC = $derived(listC.filter((t) => t.done));
	let doneOpen = $state(true);

	function stats(id: string) {
		const mine = base.filter((t) => t.assignee === id);
		const done = mine.filter((t) => t.done).length;
		return { total: mine.length, done, open: mine.length - done };
	}

	// ───────────────────────────── actions (mocked) ─────────────────────────────
	function toggle(id: string) {
		const t = tasks.find((x) => x.id === id);
		if (!t) return;
		t.done = !t.done; // optimistic: flip first…
		if (t.done) {
			t.pending = true; // …then "the server confirms" a beat later
			setTimeout(() => (t.pending = false), 700);
			say(`Completed “${t.title}”`, () => {
				t.done = false;
				t.pending = false;
			});
		} else {
			t.pending = false;
			say(`Reopened “${t.title}”`);
		}
	}
	function addTask(draft: Pick<Task, 'title' | 'assignee' | 'due' | 'priority' | 'recur'> & { category?: Category }) {
		const title = draft.title.trim();
		if (!title) return;
		tasks.unshift({ ...mk(title, draft.category ?? 'Chores', draft.assignee, draft.due, draft.priority, draft.recur) });
		demoEmpty = false;
		say(`Added “${title}” for ${who[draft.assignee]?.name ?? 'Family'}`);
	}
	function snooze(id: string) {
		const t = tasks.find((x) => x.id === id);
		if (!t) return;
		t.due = (t.due === null || t.due < 0 ? 0 : t.due) + 1;
		openId = null;
		say(`Moved “${t.title}” to ${dueLabel(t.due)}`);
	}
	function remove(id: string) {
		const i = tasks.findIndex((x) => x.id === id);
		if (i < 0) return;
		const [gone] = tasks.splice(i, 1);
		openId = null;
		say(`Deleted “${gone.title}”`, () => tasks.splice(Math.min(i, tasks.length), 0, gone));
	}

	/** Tiny quick-add grammar: `Buy milk tomorrow @mom !!` · `!` high · `!!` urgent · today/tomorrow/weekend · daily/weekly. */
	function parse(raw: string) {
		let title = raw;
		let assignee = 'dad';
		let due: number | null = null;
		let priority: Priority = 'normal';
		let recur: string | null = null;
		const at = title.match(/@(\w+)/);
		if (at) {
			const hit = lanes.find((p) => p.name.toLowerCase() === at[1].toLowerCase());
			if (hit) {
				assignee = hit.id;
				title = title.replace(at[0], '');
			}
		}
		if (/!!/.test(title)) (priority = 'urgent'), (title = title.replace(/!!/g, ''));
		else if (/!/.test(title)) (priority = 'high'), (title = title.replace(/!/g, ''));
		const day = title.match(/\b(today|tomorrow|weekend)\b/i);
		if (day) {
			const k = day[1].toLowerCase();
			due = k === 'today' ? 0 : k === 'tomorrow' ? 1 : weekendOffset;
			title = title.replace(day[0], '');
		}
		const rec = title.match(/\b(daily|weekly)\b/i);
		if (rec) {
			recur = rec[1].toLowerCase() === 'daily' ? 'every day' : 'every week';
			title = title.replace(rec[0], '');
			due ??= 0;
		}
		return { title: title.replace(/\s+/g, ' ').trim(), assignee, due, priority, recur };
	}

	// A: single smart input
	let draftA = $state('');
	const parsedA = $derived(parse(draftA));
	function submitA(e: SubmitEvent) {
		e.preventDefault();
		if (!parsedA.title) return;
		addTask(parsedA);
		draftA = '';
	}

	// B: one input per lane
	let draftB = $state<Record<string, string>>({});
	function submitB(e: SubmitEvent, laneId: string) {
		e.preventDefault();
		const text = (draftB[laneId] ?? '').trim();
		if (!text) return;
		const p = parse(text);
		addTask({ ...p, assignee: laneId });
		draftB[laneId] = '';
	}

	// C: input + chips
	let draftC = $state('');
	let chipDue = $state<number | null>(null);
	let chipWho = $state('dad');
	let chipPrio = $state<Priority>('normal');
	let chipRecur = $state(false);
	function submitC(e: SubmitEvent) {
		e.preventDefault();
		addTask({
			title: draftC,
			assignee: chipWho,
			due: chipDue,
			priority: chipPrio,
			recur: chipRecur ? 'every week' : null,
			category: cat === 'all' ? 'Chores' : cat
		});
		draftC = '';
		chipDue = null;
		chipPrio = 'normal';
		chipRecur = false;
	}
	const dueChips: { label: string; value: number }[] = [
		{ label: 'Today', value: 0 },
		{ label: 'Tomorrow', value: 1 },
		{ label: 'Weekend', value: weekendOffset }
	];

	// C: swipe rows (pointer based so mouse drag works too; touch-action keeps vertical scroll)
	const REVEAL = 128;
	let drag = $state<{ id: string; x: number } | null>(null);
	let openId = $state<string | null>(null);
	let gesture: { id: string; startX: number; base: number; moved: boolean } | null = null;
	const rowX = (id: string) => (drag?.id === id ? drag.x : openId === id ? -REVEAL : 0);

	function swipeDown(e: PointerEvent, id: string) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		gesture = { id, startX: e.clientX, base: openId === id ? -REVEAL : 0, moved: false };
	}
	function swipeMove(e: PointerEvent) {
		if (!gesture) return;
		const dx = e.clientX - gesture.startX;
		if (!gesture.moved) {
			if (Math.abs(dx) < 8) return;
			gesture.moved = true;
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); // only once it is a drag: keeps taps/clicks intact
			if (openId !== gesture.id) openId = null;
		}
		drag = { id: gesture.id, x: Math.max(-REVEAL, Math.min(140, gesture.base + dx)) };
	}
	function swipeUp() {
		const g = gesture;
		gesture = null;
		if (!g?.moved || !drag) return;
		const x = drag.x;
		drag = null;
		if (x > 90) {
			openId = null;
			toggle(g.id);
		} else openId = x < -50 ? g.id : null;
	}
	function swipeCancel() {
		gesture = null;
		drag = null;
	}

	function clearFilters() {
		member = 'all';
		cat = 'all';
		showDone = true;
		demoEmpty = false;
	}
</script>

<svelte:head><title>Tasks prototype</title></svelte:head>

<!-- ───────────────────────────── shared snippets ───────────────────────────── -->

{#snippet avatar(id: string, size: 'xs' | 'sm' | 'md' | 'lg' = 'sm')}
	{@const p = who[id] ?? everyone}
	<span
		class="inline-flex shrink-0 items-center justify-center rounded-full font-bold {p.chip} {avatarSize[size]}"
		title={p.name}
		aria-hidden="true">{id === 'family' ? '👪' : p.name[0]}</span
	>
{/snippet}

{#snippet check(t: Task)}
	<button
		type="button"
		onclick={() => toggle(t.id)}
		aria-label={t.done ? `Reopen ${t.title}` : `Complete ${t.title}`}
		aria-pressed={t.done}
		class="relative grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors before:absolute before:-inset-2.5 before:content-[''] {t.done
			? 'border-primary bg-primary text-white'
			: 'border-slate-300 bg-white text-transparent hover:border-primary hover:text-primary-200'} {t.pending
			? 'animate-pulse'
			: ''}"
	>
		<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
			<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
		</svg>
	</button>
{/snippet}

<!-- priority · due · recurring · assignee: the four markers every row carries -->
{#snippet markers(t: Task, showWho = true)}
	<span class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
		{#if t.priority !== 'normal'}
			<span class="inline-flex items-center gap-1 font-medium {prio[t.priority].text}">
				<span class="h-2 w-2 rounded-full {prio[t.priority].dot}" aria-hidden="true"></span>{prio[t.priority].label}
			</span>
		{/if}
		{#if t.due !== null}
			<span class={!t.done && t.due < 0 ? 'font-semibold text-red-600' : ''}>{dueLabel(t.due)}</span>
		{/if}
		{#if t.recur}
			<span class="inline-flex items-center gap-1 font-medium text-purple-600" title="Repeats {t.recur}">
				<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M5.6 15A8 8 0 0018.4 9M18.4 9A8 8 0 005.6 15" />
				</svg>{t.recur}
			</span>
		{/if}
		{#if showWho}
			<span class="inline-flex items-center gap-1">{@render avatar(t.assignee, 'xs')}{who[t.assignee]?.name}</span>
		{/if}
	</span>
{/snippet}

{#snippet filterChips(withDone = true)}
	<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by family member">
		{#each [{ id: 'all', name: 'Everyone' }, ...lanes] as p (p.id)}
			<button
				type="button"
				onclick={() => (member = p.id)}
				aria-pressed={member === p.id}
				class="inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors {member === p.id
					? 'border-primary bg-primary text-white'
					: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100'}"
			>
				{#if p.id === 'all'}<span aria-hidden="true">👪</span>{:else}{@render avatar(p.id, 'xs')}{/if}{p.name}
			</button>
		{/each}
		{#if withDone}
			<label class="ml-auto inline-flex min-h-8 items-center gap-1.5 text-xs text-slate-500">
				<input type="checkbox" bind:checked={showDone} class="h-4 w-4 accent-primary-600" /> Show done
			</label>
		{/if}
	</div>
{/snippet}

{#snippet emptyState(title: string, hint: string, action = true)}
	<div class="flex flex-col items-center gap-1 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
		<span class="text-2xl" aria-hidden="true">👪</span>
		<p class="text-sm font-semibold text-slate-700">{title}</p>
		<p class="text-xs text-slate-400">{hint}</p>
		{#if action}
			<button type="button" onclick={clearFilters} class="mt-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-700 shadow-sm ring-1 ring-slate-200 hover:bg-primary-50">
				Reset filters
			</button>
		{/if}
	</div>
{/snippet}

{#snippet ring(done: number, total: number, id: string, size: number)}
	{@const r = size / 2 - 4}
	{@const c = 2 * Math.PI * r}
	<span class="relative inline-grid shrink-0 place-items-center" style:width="{size}px" style:height="{size}px">
		<svg width={size} height={size} viewBox="0 0 {size} {size}" class="-rotate-90" aria-hidden="true">
			<circle cx={size / 2} cy={size / 2} {r} fill="none" stroke-width="4" class="stroke-slate-100" />
			<circle
				cx={size / 2}
				cy={size / 2}
				{r}
				fill="none"
				stroke-width="4"
				stroke-linecap="round"
				class="transition-all duration-500 {who[id].stroke}"
				stroke-dasharray={c}
				stroke-dashoffset={c * (1 - (total ? done / total : 0))}
			/>
		</svg>
		<span class="absolute inset-0 grid place-items-center">{@render avatar(id, size > 60 ? 'lg' : 'md')}</span>
	</span>
{/snippet}

<!-- ───────────────────────────── page ───────────────────────────── -->

<div class="min-h-screen overflow-x-clip bg-slate-50">
	<div class="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4">
		<p class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
			<strong>Prototype</strong> — mock family, nothing is saved. Question: which Tasks layout reads best at a glance?
		</p>

		<header class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
				<div class="min-w-0">
					<h1 class="text-xl font-bold text-slate-900"><span aria-hidden="true">👪</span> Tasks</h1>
					<p class="mt-0.5 text-xs text-slate-400">{openCount} open · {doneCount} completed</p>
				</div>
				<button type="button" onclick={() => (demoEmpty = !demoEmpty)} class="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">
					{demoEmpty ? 'Restore tasks' : 'Preview empty state'}
				</button>
			</div>

			<nav class="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" aria-label="Prototype variant">
				{#each variants as v (v.key)}
					<a
						href="{resolve('/(calendar)/calendar/tasks/prototype')}?v={v.key}"
						data-sveltekit-replacestate
						aria-current={variant === v.key ? 'page' : undefined}
						class="min-w-0 truncate rounded-lg px-1.5 py-2 text-center text-xs font-semibold transition-colors sm:text-sm {variant === v.key
							? 'bg-white text-primary-700 shadow-sm'
							: 'text-slate-500 hover:text-slate-800'}"
					>
						<span class="uppercase text-slate-400">{v.key}</span> {v.name}
					</a>
				{/each}
			</nav>
		</header>

		<!-- ═════════════ A · Focus board ═════════════ -->
		{#if variant === 'a'}
			<section class="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4" aria-label="Quick add">
				<form onsubmit={submitA} class="flex gap-2">
					<input
						bind:value={draftA}
						aria-label="New task"
						placeholder="Add a task…  try “Buy milk tomorrow @mom !”"
						class="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
					/>
					<button type="submit" disabled={!parsedA.title} class="min-h-11 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-40">Add</button>
				</form>
				{#if parsedA.title}
					<p class="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500" aria-live="polite">
						<span class="font-medium text-slate-700">{parsedA.title}</span>
						<span class="inline-flex items-center gap-1">{@render avatar(parsedA.assignee, 'xs')}{who[parsedA.assignee].name}</span>
						{#if parsedA.due !== null}<span>{dueLabel(parsedA.due)}</span>{/if}
						{#if parsedA.priority !== 'normal'}<span class={prio[parsedA.priority].text}>{prio[parsedA.priority].label}</span>{/if}
						{#if parsedA.recur}<span class="text-purple-600">↻ {parsedA.recur}</span>{/if}
					</p>
				{/if}
				<div class="mt-3 border-t border-slate-100 pt-3">{@render filterChips()}</div>
			</section>

			<section class="mt-4" aria-labelledby="top3-h">
				<h2 id="top3-h" class="mb-2 text-sm font-bold text-slate-900">Top 3 <span class="font-normal text-slate-400">· what matters most right now</span></h2>
				{#if top3.length === 0}
					{@render emptyState('All clear', 'Nothing urgent. Enjoy the calm.', member !== 'all' || demoEmpty || !showDone)}
				{:else}
					<ol class="grid gap-2 sm:grid-cols-3">
						{#each top3 as t, i (t.id)}
							<li class="flex min-w-0 items-start gap-3 rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 to-white p-3">
								<span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white">{i + 1}</span>
								<div class="min-w-0 flex-1">
									<p class="break-words text-sm font-semibold text-slate-900">{t.title}</p>
									<div class="mt-1">{@render markers(t)}</div>
								</div>
								{@render check(t)}
							</li>
						{/each}
					</ol>
				{/if}
			</section>

			<div class="mt-4 grid items-start gap-4 lg:grid-cols-3">
				{#each columns as col (col.key)}
					<section class="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" aria-labelledby="col-{col.key}">
						<div class="mb-2 flex items-baseline justify-between gap-2">
							<h2 id="col-{col.key}" class="text-sm font-bold text-slate-900">{col.title}</h2>
							<span class="text-xs text-slate-400">{col.items.filter((t) => !t.done).length} open</span>
						</div>
						<p class="-mt-1.5 mb-2 text-xs text-slate-400">{col.hint}</p>
						{#if col.items.length === 0}
							{@render emptyState('Nothing here', 'No tasks match this view.', member !== 'all' || !showDone)}
						{:else}
							<ul class="space-y-1.5">
								{#each col.items as t (t.id)}
									<li class="flex min-w-0 items-start gap-2.5 rounded-xl border px-2.5 py-2 {t.done ? 'border-slate-100 bg-slate-50/60' : !t.done && t.due !== null && t.due < 0 ? 'border-red-200 bg-red-50/50' : 'border-slate-100 bg-white hover:bg-slate-50'}">
										<div class="mt-0.5">{@render check(t)}</div>
										<div class="min-w-0 flex-1">
											<p class="break-words text-sm font-medium {t.done ? 'text-slate-400 line-through' : 'text-slate-900'}">{t.title}</p>
											<div class="mt-0.5">{@render markers(t)}</div>
										</div>
									</li>
								{/each}
							</ul>
						{/if}
					</section>
				{/each}
			</div>

			<!-- ═════════════ B · Family lanes ═════════════ -->
		{:else if variant === 'b'}
			<section class="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4" aria-label="Who is on the hook">
				<div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
					{#each lanes as p (p.id)}
						{@const s = stats(p.id)}
						<button
							type="button"
							onclick={() => (member = member === p.id ? 'all' : p.id)}
							aria-pressed={member === p.id}
							class="flex min-w-0 flex-col items-center gap-1 rounded-xl border p-2 transition-colors {member === p.id ? 'border-primary bg-primary-50' : 'border-transparent hover:bg-slate-50'}"
						>
							{@render ring(s.done, s.total, p.id, 52)}
							<span class="max-w-full truncate text-xs font-semibold text-slate-700">{p.name}</span>
							<span class="text-[11px] text-slate-400">{s.done}/{s.total} done</span>
						</button>
					{/each}
				</div>
				<div class="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
					<span>{member === 'all' ? 'Showing the whole family — tap a ring to focus one lane' : `Focused on ${who[member].name}`}</span>
					<span class="flex shrink-0 items-center gap-3">
						{#if member !== 'all'}<button type="button" onclick={() => (member = 'all')} class="font-semibold text-primary-700 hover:underline">Show all</button>{/if}
						<label class="inline-flex items-center gap-1.5"><input type="checkbox" bind:checked={showDone} class="h-4 w-4 accent-primary-600" /> Show done</label>
					</span>
				</div>
			</section>

			<div class="mt-4 space-y-3">
				{#each lanes.filter((p) => member === 'all' || p.id === member) as p (p.id)}
					{@const s = stats(p.id)}
					{@const items = sortTasks(base.filter((t) => t.assignee === p.id))}
					<section class="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm md:grid md:grid-cols-[10rem_1fr]" aria-label="{p.name}'s tasks">
						<div class="flex items-center gap-3 border-b border-slate-100 p-3 md:flex-col md:items-start md:justify-center md:border-r md:border-b-0">
							<span class="md:hidden">{@render ring(s.done, s.total, p.id, 44)}</span>
							<span class="hidden md:block">{@render ring(s.done, s.total, p.id, 64)}</span>
							<div class="min-w-0">
								<h2 class="truncate text-sm font-bold text-slate-900">{p.name} <span class="font-normal text-slate-400">· {p.role}</span></h2>
								<p class="text-xs text-slate-500">{s.open} to do · {s.done} done</p>
							</div>
						</div>
						<div class="min-w-0 p-3">
							{#if items.length === 0}
								{@render emptyState(`No tasks for ${p.name}`, 'Nothing assigned — add one below.', false)}
							{:else}
								{#if s.open === 0}
									<p class="mb-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">All done — {p.name} is clear.</p>
								{/if}
								<ul class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
									{#each items as t (t.id)}
										<li class="flex min-w-0 items-start gap-2.5 rounded-xl border border-l-4 border-slate-100 px-2.5 py-2 {t.done ? 'bg-slate-50/60 border-l-slate-200' : prio[t.priority].rank <= 1 ? (t.priority === 'urgent' ? 'border-l-red-500' : 'border-l-amber-400') : 'border-l-slate-200'}">
											<div class="mt-0.5">{@render check(t)}</div>
											<div class="min-w-0 flex-1">
												<p class="break-words text-sm font-medium {t.done ? 'text-slate-400 line-through' : 'text-slate-900'}">{t.title}</p>
												<div class="mt-0.5">{@render markers(t, false)}</div>
											</div>
										</li>
									{/each}
								</ul>
							{/if}
							<form onsubmit={(e) => submitB(e, p.id)} class="mt-3 flex gap-2">
								<input
									bind:value={draftB[p.id]}
									aria-label="Add a task for {p.name}"
									placeholder="Add for {p.name}…  (tomorrow, !, weekly)"
									class="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm placeholder:text-slate-400 focus:border-primary-500 focus:outline-none"
								/>
								<button type="submit" class="min-h-10 shrink-0 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-700">Add</button>
							</form>
						</div>
					</section>
				{/each}
			</div>

			<!-- ═════════════ C · Clean list ═════════════ -->
		{:else}
			<section class="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4" aria-label="Quick add">
				<form onsubmit={submitC}>
					<div class="flex items-center gap-2">
						<span class="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-dashed border-primary-300 text-primary" aria-hidden="true">+</span>
						<input
							bind:value={draftC}
							aria-label="New task"
							placeholder="New task…"
							class="min-h-11 min-w-0 flex-1 bg-transparent text-base placeholder:text-slate-400 focus:outline-none"
						/>
						<button type="submit" disabled={!draftC.trim()} class="min-h-9 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-30">Add</button>
					</div>
					<div class="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2" role="group" aria-label="Task details">
						{#each dueChips as c (c.label)}
							<button type="button" onclick={() => (chipDue = chipDue === c.value ? null : c.value)} aria-pressed={chipDue === c.value} class="min-h-8 rounded-full border px-2.5 text-xs font-medium {chipDue === c.value ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}">{c.label}</button>
						{/each}
						<span class="mx-0.5 h-4 w-px bg-slate-200" aria-hidden="true"></span>
						{#each lanes as p (p.id)}
							<button type="button" onclick={() => (chipWho = p.id)} aria-pressed={chipWho === p.id} aria-label="Assign to {p.name}" title={p.name} class="rounded-full p-0.5 {chipWho === p.id ? 'ring-2 ring-primary ring-offset-1' : 'opacity-60 hover:opacity-100'}">{@render avatar(p.id, 'sm')}</button>
						{/each}
						<span class="mx-0.5 h-4 w-px bg-slate-200" aria-hidden="true"></span>
						<button type="button" onclick={() => (chipPrio = chipPrio === 'normal' ? 'high' : chipPrio === 'high' ? 'urgent' : 'normal')} class="min-h-8 rounded-full border border-slate-200 px-2.5 text-xs font-medium hover:bg-slate-50 {prio[chipPrio].text}">
							<span class="mr-1 inline-block h-2 w-2 rounded-full {prio[chipPrio].dot}" aria-hidden="true"></span>{prio[chipPrio].label}
						</button>
						<button type="button" onclick={() => (chipRecur = !chipRecur)} aria-pressed={chipRecur} class="min-h-8 rounded-full border px-2.5 text-xs font-medium {chipRecur ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}">↻ Weekly</button>
					</div>
				</form>
			</section>

			<section class="mt-3 space-y-2" aria-label="Filters">
				{@render filterChips()}
				<div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
					{#each ['all', ...categories] as c (c)}
						<button type="button" onclick={() => (cat = c as 'all' | Category)} aria-pressed={cat === c} class="min-h-8 rounded-md px-2.5 text-xs font-medium capitalize {cat === c ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">{c}</button>
					{/each}
				</div>
			</section>

			<p class="mt-3 text-xs text-slate-400">Tip: swipe a row right to complete it, left for snooze / delete.</p>

			{#snippet row(t: Task)}
				<li class="group relative touch-pan-y select-none overflow-hidden">
					<div class="absolute inset-0 flex items-center bg-emerald-500 pl-4 text-sm font-semibold text-white {rowX(t.id) > 0 ? '' : 'invisible'}" aria-hidden="true">✓ Done</div>
					<div class="absolute inset-y-0 right-0 flex w-32 {rowX(t.id) < 0 ? '' : 'invisible'}">
						<button type="button" onclick={() => snooze(t.id)} class="flex-1 bg-amber-400 text-xs font-semibold text-amber-950">Snooze</button>
						<button type="button" onclick={() => remove(t.id)} class="flex-1 bg-red-500 text-xs font-semibold text-white">Delete</button>
					</div>
					<div
						class="relative flex items-center gap-3 bg-white px-3 py-2.5 {drag?.id === t.id ? '' : 'transition-transform duration-200'}"
						style:transform="translateX({rowX(t.id)}px)"
						role="presentation"
						onpointerdown={(e) => swipeDown(e, t.id)}
						onpointermove={swipeMove}
						onpointerup={swipeUp}
						onpointercancel={swipeCancel}
					>
						{@render check(t)}
						<div class="min-w-0 flex-1">
							<p class="break-words text-sm font-medium {t.done ? 'text-slate-400 line-through' : 'text-slate-900'}">{t.title}</p>
							<div class="mt-0.5">{@render markers(t, false)}</div>
						</div>
						<span class="hidden shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 sm:inline">{t.category}</span>
						{@render avatar(t.assignee, 'sm')}
						<span class="hidden shrink-0 gap-1 group-focus-within:flex md:group-hover:flex">
							<button type="button" onclick={() => snooze(t.id)} class="rounded-md px-1.5 py-1 text-xs text-slate-500 hover:bg-amber-100" aria-label="Snooze {t.title}">Snooze</button>
							<button type="button" onclick={() => remove(t.id)} class="rounded-md px-1.5 py-1 text-xs text-slate-500 hover:bg-red-100 hover:text-red-700" aria-label="Delete {t.title}">Delete</button>
						</span>
					</div>
				</li>
			{/snippet}

			<div class="mt-2 space-y-4">
				{#each groupsC as g (g.key)}
					<section aria-labelledby="g-{g.key}">
						<h2 id="g-{g.key}" class="mb-1 flex items-baseline gap-2 px-1 text-xs font-bold tracking-wide uppercase {g.tone}">
							{g.title} <span class="font-medium text-slate-400">{g.items.length}</span>
						</h2>
						<ul class="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
							{#each g.items as t (t.id)}{@render row(t)}{/each}
						</ul>
					</section>
				{/each}

				{#if groupsC.length === 0 && doneC.length === 0}
					{@render emptyState('Nothing to do', 'No tasks match these filters. Add one above or reset.')}
				{/if}

				{#if doneC.length > 0 && showDone}
					<section aria-labelledby="g-done">
						<h2 id="g-done" class="mb-1 px-1">
							<button type="button" onclick={() => (doneOpen = !doneOpen)} aria-expanded={doneOpen} class="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-500 uppercase">
								<span aria-hidden="true">{doneOpen ? '▾' : '▸'}</span> Completed <span class="font-medium text-slate-400">{doneC.length}</span>
							</button>
						</h2>
						{#if doneOpen}
							<ul class="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white opacity-80 shadow-sm">
								{#each doneC as t (t.id)}{@render row(t)}{/each}
							</ul>
						{/if}
					</section>
				{/if}
			</div>
		{/if}

		<details class="mt-6 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
			<summary class="cursor-pointer font-medium">Prototype state</summary>
			<p class="mt-2 break-words font-mono">
				variant={variant} · member={member} · cat={cat} · showDone={showDone} · demoEmpty={demoEmpty} · open={openCount} ·
				done={doneCount} · pending={pendingCount}
			</p>
		</details>
	</div>

	{#if toast}
		<div role="status" class="fixed inset-x-3 bottom-4 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
			<span class="min-w-0 truncate">{toast.msg}</span>
			<span class="flex shrink-0 items-center gap-3">
				{#if toast.undo}
					<button
						type="button"
						onclick={() => {
							toast?.undo?.();
							toast = null;
						}}
						class="font-semibold text-primary-300 hover:text-primary-200">Undo</button
					>
				{/if}
				<button type="button" onclick={() => (toast = null)} aria-label="Dismiss" class="text-slate-400 hover:text-white">✕</button>
			</span>
		</div>
	{/if}
</div>
