<script lang="ts">
	/**
	 * The date navigator, shared by the day dashboard header and the calendar
	 * toolbar (118 mark 1.5: "make this section like the change requested for the
	 * calendar page. make them look the same"). Kernel ui; see
	 * [../README.md](../README.md).
	 *
	 * Two hand-built "Today" controls is how they drift apart — #104 rebuilt the
	 * calendar's and left the dashboard's alone. So there is one construction,
	 * one set of labels and one landmark name, and a page that wants a date
	 * pager mounts this rather than writing another one.
	 *
	 * No `$app/*` here, and no router: the caller says how a step leaves. Each
	 * control renders a LINK when it is given an href (a day is a URL on the
	 * dashboard, and a link can be opened in a new tab) and a BUTTON when it is
	 * given a callback (the calendar navigates in place through its own date
	 * store). An href wins if both are given.
	 */
	import type { Snippet } from 'svelte';

	/** What one step moves by. Names the landmark and the arrows, so a week or a
	 * month is never announced as a day. */
	type Period = 'day' | 'week' | 'month' | 'period';

	interface Props {
		period?: Period;
		/** Is the period on screen the current one? Says so, rather than greying
		 * out a control that is still the way back. */
		isToday?: boolean;

		todayHref?: string | null;
		previousHref?: string | null;
		nextHref?: string | null;

		onToday?: (() => void) | null;
		onPrevious?: (() => void) | null;
		onNext?: (() => void) | null;

		/** #119: the calendar's control also NAMES the period — "September 2026" —
		 *  and marks 1.16/1.17 said the label and the arrows were three loose
		 *  pieces that should be one thing. A second pill beside this one would
		 *  put them straight back. So a caller may put its own label in this
		 *  pill's leading segment: no ring of its own, no second navigation
		 *  landmark, and the pill stays the only ring on screen. Omitted — as on
		 *  the dashboard — and this renders exactly the three members it always
		 *  did. */
		leading?: Snippet | null;
	}

	/** One member of the pill: Today or an arrow, as a link or as a button. */
	interface Step {
		kind: 'today' | 'previous' | 'next';
		href: string | null;
		onPress: (() => void) | null;
		/** Accessible name. */
		label: string;
		/** Tooltip; the arrows carry one, Today does not. */
		title?: string;
		isCurrent?: boolean;
	}

	let {
		period = 'day',
		isToday = false,
		todayHref = null,
		previousHref = null,
		nextHref = null,
		onToday = null,
		onPrevious = null,
		onNext = null,
		leading = null
	}: Props = $props();

	const previousLabel = $derived(`Previous ${period}`);
	const nextLabel = $derived(`Next ${period}`);
	/** "Day navigation" / "Week navigation" — the landmark names the step. */
	const landmark = $derived(`${period.charAt(0).toUpperCase()}${period.slice(1)} navigation`);

	// The calendar's construction, copied rather than re-invented: one pill, its
	// members carry no ring of their own, 40px tall. Members are kept free of the
	// word "border" so the pill stays the only ring on screen.
	const PILL =
		'flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm';
	const TODAY = 'flex h-10 items-center px-3.5 text-sm font-semibold';
	const ARROW = 'flex h-10 w-11 items-center justify-center';
	const PRESS = 'hover:bg-slate-100 hover:text-slate-800';
</script>

<!-- What a member shows: the word "Today", or the chevron its direction points. -->
{#snippet face(kind: Step['kind'])}
	{#if kind === 'today'}
		Today
	{:else}
		<svg
			class="h-4 w-4"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d={kind === 'previous' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'}
			/>
		</svg>
	{/if}
{/snippet}

<!--
	One member, rendered once: a link when the caller gave an href (openable in a
	new tab), otherwise a button that calls back. Button-only affordances —
	`active:bg-slate-200`, `disabled` — never reach a link, and only Today is
	muted when it is where you already are.
-->
{#snippet step(control: Step)}
	{@const base =
		control.kind === 'today'
			? `${TODAY} text-slate-700 ${PRESS}`
			: `${ARROW} text-slate-500 ${PRESS}`}
	{#if control.href}
		<a
			href={control.href}
			aria-label={control.label}
			title={control.title}
			aria-current={control.isCurrent ? 'date' : undefined}
			class={control.kind === 'today'
				? `${base} ${control.isCurrent ? 'opacity-50' : ''}`
				: base}
		>
			{@render face(control.kind)}
		</a>
	{:else}
		<button
			type="button"
			onclick={() => control.onPress?.()}
			disabled={!control.onPress}
			aria-label={control.label}
			title={control.title}
			aria-current={control.isCurrent ? 'date' : undefined}
			class={control.kind === 'today'
				? `${base} active:bg-slate-200 ${control.isCurrent ? 'opacity-50' : ''}`
				: `${base} active:bg-slate-200`}
		>
			{@render face(control.kind)}
		</button>
	{/if}
{/snippet}

<nav aria-label={landmark} data-testid="daynav" class={PILL}>
	<!-- The caller's period label, when it has one. Inside the pill, first. -->
	{#if leading}
		{@render leading()}
	{/if}

	<!-- Today leads: it is the way back, and the arrows are the way along. -->
	{@render step({
		kind: 'today',
		href: todayHref,
		onPress: onToday,
		label: 'Go to today',
		isCurrent: isToday
	})}
	{@render step({
		kind: 'previous',
		href: previousHref,
		onPress: onPrevious,
		label: previousLabel,
		title: previousLabel
	})}
	{@render step({ kind: 'next', href: nextHref, onPress: onNext, label: nextLabel, title: nextLabel })}
</nav>
