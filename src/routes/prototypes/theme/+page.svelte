<script lang="ts">
	/**
	 * PROTOTYPE (issue 322) — the desktop nav + colour question answered four
	 * ways on one throwaway route, switchable by `?v=A…D`:
	 *
	 *   A  Baseline       — the shipped shell, untouched.
	 *   B  De-duped nav   — the phone tab bar drops the rows the menu already
	 *                       carries and the bell moves into the navbar.
	 *   C  Lavender       — the marketing palette's unused lavender on the
	 *                       active tab pill and the section headers.
	 *   D  Blush canvas   — blush washes as surfaces; orange survives only as
	 *                       the action colour.
	 *
	 * Every variant mounts the REAL Navbar, BottomNav (and, inside Navbar,
	 * NavbarMobileMenu), calendar grid and TopPrioritiesCard. The only thing a
	 * variant changes is a class on this wrapper plus CSS: no production file
	 * is touched. Delete this route (and its README) once the owner picks.
	 */
	import { DateTime } from 'luxon';
	import { writable } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import '$lib/marketing/theme.css';
	import Navbar from '$lib/components/Navbar.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import NotificationBell from '$lib/components/NotificationBell.svelte';
	import Calendar from '$lib/components/calendar/Calendar.svelte';
	import TopPrioritiesCard from '$lib/components/dashboard/TopPrioritiesCard.svelte';
	import type { Event } from '$lib/types';

	const VARIANTS = ['A', 'B', 'C', 'D'] as const;
	type Variant = (typeof VARIANTS)[number];

	const VARIANT_NAMES: Record<Variant, string> = {
		A: 'Baseline',
		B: 'De-duped nav',
		C: 'Lavender accents',
		D: 'Blush canvas'
	};

	/** What each variant changes, in the page copy — a review compares this. */
	const VARIANT_DELTAS: Record<Variant, string> = {
		A: 'The shipped shell, unchanged: white surfaces, primary-orange active states, one nav row on desktop and the six-tab bar on a phone.',
		B: 'Mobile nav de-dup: the tab bar keeps Calendar / Dashboard / Tasks, the secondary rows (Groceries, Family, Alerts) stay in the hamburger menu, and the bell moves into the navbar. Desktop already has a single nav row, so it is untouched.',
		C: 'Third-colour pass: the marketing palette’s unused lavender (--mp-lavender / --mp-lavender-ink) lands only on the active tab pill and section headers; every other colour stays baseline.',
		D: 'Colour-focal pass: blush washes (--mp-tint-blush) become the page and card surfaces, while orange survives only on the action button — the active nav state turns brand-ink on blush.'
	};

	/** What production would have to change if the owner picks that variant. */
	const PICK_NOTES: Record<Variant, string> = {
		A: 'Pick this only if the owner rejects the third colour: no production change follows, and #322 closes with the baseline kept.',
		B: 'Pick this and the production nav reduction becomes the real change: bottomNavItems gains a primary flag (Calendar, Dashboard, Tasks), NavbarMobileMenu keeps the rest, and NotificationBell joins the phone header cluster.',
		C: 'Pick this and the lavender pair joins the app’s Tailwind theme as a semantic accent token; the tab pill and every section header read it rather than repeating the hex.',
		D: 'Pick this and the app’s surface tokens split: blush for paper/cards, brand-orange reserved for actionable controls. It is the largest visual rewrite of the four.'
	};

	const variant = $derived.by(() => {
		const raw = page.url.searchParams.get('v') ?? page.url.searchParams.get('variant') ?? 'A';
		const q = raw.toUpperCase();
		return (VARIANTS as readonly string[]).includes(q) ? (q as Variant) : 'A';
	});

	function goTo(next: Variant) {
		const url = new URL(page.url);
		url.searchParams.set('v', next);
		void goto(`${url.pathname}${url.search}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	}

	function cycle(delta: number) {
		const i = VARIANTS.indexOf(variant);
		const next = VARIANTS[(i + delta + VARIANTS.length) % VARIANTS.length] ?? 'A';
		goTo(next);
	}

	function onKeydown(e: KeyboardEvent) {
		const target = e.target instanceof HTMLElement ? e.target : null;
		if (
			target &&
			(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
		) {
			return;
		}
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			cycle(-1);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			cycle(1);
		} else {
			const letter = e.key.toUpperCase();
			if ((VARIANTS as readonly string[]).includes(letter)) {
				e.preventDefault();
				goTo(letter as Variant);
			}
		}
	}

	const demoUser = {
		firstName: 'Sarah',
		lastName: 'Rivera',
		email: 'sarah@example.com',
		roles: ['user']
	};

	const familyMembers = [
		{ userId: 'u-sam', firstName: 'Sam', lastName: 'Rivera' },
		{ userId: 'u-jo', firstName: 'Jo', lastName: 'Rivera' }
	];

	const calendarIds = [
		{ id: 'cal-family', name: 'Rivera Family', color: '#bedae3' },
		{ id: 'cal-personal', name: 'Personal', color: '#fed5cf' }
	];

	const monthStart = DateTime.now().startOf('month');
	const currentDate = writable(monthStart);
	const todayISO = DateTime.now().toISODate() ?? monthStart.toISODate() ?? '2026-11-10';

	/** SAFETY: `base` is the whole Event surface the calendar views read; the
	 * cast names that contract once, exactly as the calendar's own tests do. */
	function eventOn(day: number, hour: number, title: string, calendarId: string): Event {
		const start = monthStart.plus({ days: day - 1 }).set({
			hour,
			minute: 0,
			second: 0,
			millisecond: 0
		});
		const base = {
			id: `demo-${day}-${hour}`,
			calendarId,
			ownerId: 'u-sam',
			title,
			start: start.toISO(),
			end: start.plus({ hours: 1 }).toISO(),
			date: start.toISODate(),
			description: null,
			location: null,
			allDay: false,
			recurrenceFrequency: null,
			recurrenceInterval: null,
			recurrenceByDay: null,
			recurrenceCount: null,
			recurrenceUntil: null,
			reminderMinutes: null,
			mirrorOf: null,
			created_at: start.toJSDate()
		};
		return base as Event;
	}

	const demoEvents: Event[] = [
		eventOn(4, 8, 'School run', 'cal-family'),
		eventOn(9, 17, 'Swim practice', 'cal-family'),
		eventOn(12, 19, 'Date night', 'cal-personal'),
		eventOn(18, 10, 'Grandma visits', 'cal-family'),
		eventOn(23, 15, 'Dentist — Sam', 'cal-personal')
	];

	const dueTasks = [
		{
			id: 't-due-1',
			title: 'Pack lunches',
			dueDate: todayISO,
			calendarId: 'cal-family'
		}
	];

	const top3 = [
		{
			id: 't1',
			title: 'Book the sitter for Friday',
			dueDate: todayISO,
			priority: 'high',
			userId: 'u-sam',
			assignedTo: null,
			assignmentStatus: null,
			familyId: 'fam-rivera',
			visibility: 'public' as const,
			category: 'Family'
		},
		{
			id: 't2',
			title: 'Renew the car insurance',
			dueDate: null,
			priority: 'normal',
			userId: 'u-sam',
			assignedTo: 'u-jo',
			assignmentStatus: 'accepted',
			assigneeFirstName: 'Jo',
			assigneeLastName: 'Rivera',
			visibility: 'private' as const
		},
		{
			id: 't3',
			title: 'Water the plants',
			dueDate: null,
			priority: 'low',
			userId: 'u-sam',
			assignedTo: null,
			assignmentStatus: null,
			visibility: 'private' as const,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1
		}
	];

	const weekRows = [
		{ when: 'Tue', what: 'Swim practice', who: 'Sam' },
		{ when: 'Wed', what: 'Family dinner', who: 'Everyone' },
		{ when: 'Fri', what: 'Date night', who: 'Sam + Jo' }
	];
</script>

<svelte:window onkeydown={onKeydown} />

<div class="theme-proto variant-{variant}" data-testid="theme-proto" data-variant={variant}>
	<Navbar isLoggedIn={true} user={demoUser} />

	{#if variant === 'B'}
		<!-- The bell the shipped phone shell hides inside the hamburger menu. -->
		<div class="nav-bell" data-testid="promoted-bell">
			<NotificationBell />
		</div>
	{/if}

	<main class="proto-main">
		<header class="proto-head">
			<div>
				<p class="proto-eyebrow">Prototype · desktop theme</p>
				<h1 class="proto-title">{monthStart.toFormat('LLLL yyyy')} at a glance</h1>
				<p class="proto-lede">
					The same dashboard every variant must carry — only the nav and the colour change.
				</p>
			</div>
			<button class="proto-action" type="button">+ New event</button>
		</header>

		<div class="variant-note" data-testid="variant-note">
			<span class="variant-note-key">{variant} · {VARIANT_NAMES[variant]}</span>
			<p>{VARIANT_DELTAS[variant]}</p>
		</div>

		<details class="variant-index">
			<summary>All four deltas</summary>
			<dl>
				{#each VARIANTS as key (key)}
					<dt>{key} · {VARIANT_NAMES[key]}</dt>
					<dd>{VARIANT_DELTAS[key]}</dd>
				{/each}
			</dl>
		</details>

		<div class="proto-grid">
			<section class="proto-panel calendar-panel" aria-labelledby="calendar-heading">
				<div class="section-head">
					<h2 id="calendar-heading">Family calendar</h2>
					<span class="section-note">{monthStart.toFormat('LLLL')}</span>
				</div>
				<Calendar
					{currentDate}
					events={demoEvents}
					{calendarIds}
					{dueTasks}
					{familyMembers}
					preferedFirstDayOfWeek="monday"
					defaultViewSetting="monthView"
				/>
			</section>

			<div class="proto-side">
				<section class="proto-panel proto-focus" aria-labelledby="focus-heading">
					<div class="section-head">
						<h2 id="focus-heading">Today's focus</h2>
						<span class="section-note">3 things</span>
					</div>
					<TopPrioritiesCard tasks={top3} meId="u-sam" />
				</section>

				<section class="proto-panel" aria-labelledby="week-heading">
					<div class="section-head">
						<h2 id="week-heading">This week</h2>
						<span class="section-note">7 days</span>
					</div>
					<ul class="week-list">
						{#each weekRows as row (row.what)}
							<li>
								<span class="week-when">{row.when}</span>
								<span class="week-what">{row.what}</span>
								<span class="week-who">{row.who}</span>
							</li>
						{/each}
					</ul>
				</section>
			</div>
		</div>

		<footer class="proto-foot" data-testid="decision-note">
			<p><strong>Decision note.</strong> {PICK_NOTES[variant]}</p>
			<p class="proto-foot-meta">
				Prototype only — no production file is touched. Switch with the bar, the
				<span class="kbd">A</span>–<span class="kbd">D</span> keys, or ← →.
			</p>
		</footer>
	</main>

	<BottomNav isLoggedIn={true} currentPath="/calendar/dashboard" />

	{#if import.meta.env.DEV}
		{@render prototypeBar()}
	{/if}
</div>

{#snippet prototypeBar()}
	<div
		class="proto-bar"
		role="toolbar"
		aria-label="Theme prototype switcher"
		data-testid="proto-bar"
	>
		<button
			type="button"
			class="proto-bar-arrow"
			onclick={() => cycle(-1)}
			aria-label="Previous variant"
		>
			←
		</button>
		<div class="proto-bar-label">
			<span data-testid="variant-label">{variant} ({VARIANT_NAMES[variant]})</span>
			<span class="proto-bar-url">?v={variant}</span>
		</div>
		<div class="proto-bar-keys">
			{#each VARIANTS as key (key)}
				<button
					type="button"
					class="proto-bar-key"
					class:active={key === variant}
					onclick={() => goTo(key)}
					aria-label="Show variant {key}"
					aria-pressed={key === variant}
				>
					{key}
				</button>
			{/each}
		</div>
		<button
			type="button"
			class="proto-bar-arrow"
			onclick={() => cycle(1)}
			aria-label="Next variant"
		>
			→
		</button>
	</div>
{/snippet}

<style>
	.theme-proto {
		min-height: 100vh;
		background: #f8fafc;
		color: #0f172a;
	}

	.proto-main {
		margin: 0 auto;
		max-width: 80rem;
		padding: calc(5.5rem + env(safe-area-inset-top)) 1rem 9rem;
	}

	@media (min-width: 768px) {
		.proto-main {
			padding-right: 1.5rem;
			padding-bottom: 7rem;
			padding-left: 1.5rem;
		}
	}

	.proto-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}

	.proto-eyebrow {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #94a3b8;
	}

	.proto-title {
		margin-top: 0.15rem;
		font-size: 1.75rem;
		font-weight: 800;
		letter-spacing: -0.03em;
		line-height: 1.1;
	}

	.proto-lede {
		margin-top: 0.3rem;
		max-width: 38rem;
		font-size: 0.875rem;
		color: #64748b;
	}

	.variant-note {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.75rem;
		margin-bottom: 1rem;
		border: 1px dashed #cbd5e1;
		border-radius: 0.9rem;
		background: #fff;
		padding: 0.7rem 0.9rem;
		font-size: 0.8rem;
		line-height: 1.55;
		color: #475569;
	}

	.variant-note-key {
		flex: 0 0 auto;
		font-weight: 700;
		color: #0f172a;
	}

	.variant-note p {
		flex: 1 1 18rem;
	}

	.variant-index {
		margin: -0.4rem 0 1rem;
		font-size: 0.78rem;
		color: #475569;
	}

	.variant-index summary {
		width: fit-content;
		cursor: pointer;
		border-radius: 9999px;
		padding: 0.2rem 0.6rem;
		font-weight: 600;
		color: #64748b;
	}

	.variant-index summary:hover {
		background: #f1f5f9;
	}

	.variant-index dl {
		margin-top: 0.5rem;
		border-radius: 0.9rem;
		background: #fff;
		padding: 0.75rem 0.9rem;
	}

	.variant-index dt {
		font-weight: 700;
		color: #0f172a;
	}

	.variant-index dd {
		margin: 0.1rem 0 0.5rem;
		line-height: 1.55;
	}

	.variant-index dd:last-child {
		margin-bottom: 0;
	}

	.proto-foot {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-width: 60rem;
		margin-top: 1.5rem;
		border-top: 1px solid #e2e8f0;
		padding-top: 0.9rem;
		font-size: 0.8rem;
		line-height: 1.6;
		color: #475569;
	}

	.proto-foot strong {
		color: #0f172a;
	}

	.proto-foot-meta {
		font-size: 0.72rem;
		color: #94a3b8;
	}

	.kbd {
		border: 1px solid #cbd5e1;
		border-radius: 0.3rem;
		padding: 0.05rem 0.3rem;
		font-family: var(--mp-font-mono);
		font-size: 0.68rem;
		color: #64748b;
	}

	.proto-action {
		min-height: 44px;
		border-radius: 9999px;
		background: #dd5822;
		padding: 0.6rem 1.35rem;
		font-size: 0.875rem;
		font-weight: 700;
		color: #fff;
		box-shadow: 0 10px 15px -3px rgba(221, 88, 34, 0.3);
		transition:
			background var(--mp-motion, 150ms) var(--mp-ease, ease),
			transform var(--mp-motion, 150ms) var(--mp-ease, ease);
	}

	.proto-action:hover {
		background: #b8441c;
		transform: translateY(-1px);
	}

	.proto-grid {
		display: grid;
		gap: 1rem;
		align-items: start;
	}

	@media (min-width: 1024px) {
		.proto-grid {
			grid-template-columns: minmax(0, 1fr) 22rem;
		}
	}

	.proto-side {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.proto-panel {
		border: 1px solid #e2e8f0;
		border-radius: 1.25rem;
		background: #fff;
		padding: 1rem;
		box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
	}

	.calendar-panel,
	.proto-focus {
		border: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin: 0 0.25rem 0.6rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid #e2e8f0;
	}

	.section-head h2 {
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.section-note {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: #94a3b8;
	}

	.week-list {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.week-list li {
		display: flex;
		align-items: baseline;
		gap: 0.55rem;
		border-radius: 0.75rem;
		background: #f8fafc;
		padding: 0.55rem 0.7rem;
		font-size: 0.8rem;
	}

	.week-when {
		width: 2rem;
		flex-shrink: 0;
		font-weight: 700;
		color: #94a3b8;
	}

	.week-what {
		min-width: 0;
		flex: 1;
		font-weight: 600;
		color: #334155;
	}

	.week-who {
		font-size: 0.7rem;
		color: #94a3b8;
	}

	/* ── B · de-duped nav ───────────────────────────────────────────────────
	   The phone tab bar keeps the primary destinations only; Groceries, Family
	   and Alerts still live in the hamburger menu, and the bell is promoted to
	   the navbar itself. Desktop already shows one nav system, so it is left
	   alone (and secondary destinations stay reachable there). */
	.nav-bell {
		position: fixed;
		top: calc(0.95rem + env(safe-area-inset-top));
		right: 4.5rem;
		z-index: 60;
		display: flex;
		align-items: center;
	}

	@media (min-width: 768px) {
		.nav-bell {
			display: none;
		}
	}

	.variant-B :global(nav[aria-label='Primary navigation'] a[href='/calendar/groceries']),
	.variant-B :global(nav[aria-label='Primary navigation'] a[href='/family']),
	.variant-B :global(nav[aria-label='Primary navigation'] a[href='/calendar/notifications']) {
		display: none;
	}

	.variant-B :global(nav[aria-label='Primary navigation'] > div) {
		grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
	}

	/* The menu keeps the bell row, so the promoted bell is not shown twice. */
	.variant-B :global(nav > div.border-t.bg-white .border-b.border-slate-200.pb-2) {
		display: none;
	}

	/* ── C · lavender ──────────────────────────────────────────────────────
	   The marketing palette's one unused third colour, on the active tab pill
	   and the section headers — nothing else changes. */
	.variant-C :global(nav a.text-primary-600) {
		color: var(--mp-lavender-ink) !important;
	}

	.variant-C :global(nav[aria-label='Primary navigation'] a[aria-current='page'] > span:first-child) {
		background: var(--mp-lavender) !important;
		color: var(--mp-lavender-ink) !important;
	}

	.variant-C .section-head {
		border-bottom-color: var(--mp-lavender);
	}

	.variant-C .section-head h2 {
		color: var(--mp-lavender-ink);
	}

	/* ── D · blush canvas ─────────────────────────────────────────────────
	   Blush washes carry the surfaces; orange is allowed to mean "tap this
	   action" and nothing else. */
	.variant-D {
		background: linear-gradient(
			155deg,
			rgba(254, 213, 207, 0.55),
			#ffffff 52%,
			rgba(254, 213, 207, 0.32)
		);
	}

	.variant-D :global(nav) {
		border-color: rgba(196, 94, 56, 0.16) !important;
		background: var(--mp-tint-blush) !important;
	}

	.variant-D .proto-panel {
		border-color: transparent;
		background: var(--mp-tint-blush);
	}

	.variant-D .proto-focus > :global(div) {
		border-color: transparent;
		background: var(--mp-tint-blush);
		box-shadow: var(--mp-shadow-rest);
	}

	.variant-D .section-head {
		border-bottom-color: rgba(196, 94, 56, 0.2);
	}

	.variant-D .section-head h2 {
		color: var(--mp-brand-ink);
	}

	.variant-D .week-list li {
		background: rgba(255, 255, 255, 0.55);
	}

	.variant-D :global(nav a.text-primary-600) {
		color: var(--mp-brand-ink) !important;
	}

	.variant-D :global(nav[aria-label='Primary navigation'] a[aria-current='page'] > span:first-child) {
		background: var(--mp-blush) !important;
		color: var(--mp-brand-ink) !important;
	}

	/* ── the floating prototype bar ────────────────────────────────────────
	   Deliberately loud and outside the design being judged. */
	.proto-bar {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		left: 1rem;
		z-index: 70;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		margin: 0 auto;
		width: fit-content;
		max-width: calc(100vw - 2rem);
		border-radius: 9999px;
		background: #0f172a;
		padding: 0.35rem 0.45rem;
		color: #f8fafc;
		box-shadow: 0 18px 40px -12px rgba(15, 23, 42, 0.55);
	}

	@media (min-width: 768px) {
		.proto-bar {
			bottom: 1.5rem;
		}
	}

	.proto-bar-arrow {
		display: flex;
		height: 2.25rem;
		width: 2.25rem;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		font-size: 1rem;
		color: #f8fafc;
	}

	.proto-bar-arrow:hover {
		background: #334155;
	}

	.proto-bar-label {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0 0.5rem;
		font-size: 0.78rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.proto-bar-keys {
		display: flex;
		gap: 0.15rem;
		padding: 0 0.2rem;
	}

	.proto-bar-key {
		display: flex;
		height: 1.75rem;
		width: 1.75rem;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		font-size: 0.7rem;
		font-weight: 700;
		color: #cbd5e1;
	}

	.proto-bar-key:hover {
		background: #334155;
		color: #fff;
	}

	.proto-bar-key.active {
		background: #f8fafc;
		color: #0f172a;
	}

	.proto-bar-url {
		font-size: 0.68rem;
		font-weight: 500;
		color: #94a3b8;
	}
</style>
