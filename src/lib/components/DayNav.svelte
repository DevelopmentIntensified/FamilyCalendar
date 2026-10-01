<script lang="ts">
	/**
	 * The date navigator, shared by the Day Dashboard header and the calendar
	 * page header (118, review mark 1.5: "make this section like the change
	 * requested for the calendar page. make them look the same").
	 *
	 * Two hand-built "Today" controls is how they drift apart — #104 rebuilt the
	 * calendar's and left the dashboard's alone. So there is one construction,
	 * one set of labels and one landmark name, and a page that wants a date
	 * pager mounts this rather than writing another one.
	 *
	 * The calendar navigates in place (it owns the date store and calls `goto`);
	 * the dashboard navigates by URL, so a day link can be opened in a new tab.
	 * Each control therefore renders a link when it is given an href, and a
	 * button when it is given a callback. An href wins if both are given.
	 */

	/** What one step moves by. Names the landmark and the arrows, so a week or a
	 * month is never announced as a day. */
	export let period: 'day' | 'week' | 'month' | 'period' = 'day';
	/** Is the period on screen the current one? Says so, rather than greying out
	 * a control that is still the way back. */
	export let isToday: boolean = false;

	export let todayHref: string | null = null;
	export let previousHref: string | null = null;
	export let nextHref: string | null = null;

	export let onToday: (() => void) | null = null;
	export let onPrevious: (() => void) | null = null;
	export let onNext: (() => void) | null = null;

	/** #119: the calendar's control also NAMES the period — "September 2026" —
	 *  and marks 1.16/1.17 said the label and the arrows were three loose pieces
	 *  that should be one thing. A second pill beside this one would put them
	 *  straight back. So a caller may put its own label in this pill's leading
	 *  segment: no ring of its own, no second navigation landmark, and the pill
	 *  stays the only ring on screen. Omitted — as on the dashboard — and this
	 *  renders exactly the three members it always did. */
	export let leading: import('svelte').Snippet | null = null;

	$: previousLabel = `Previous ${period}`;
	$: nextLabel = `Next ${period}`;

	// The calendar's construction, copied rather than re-invented: one pill, its
	// members carry no ring of their own, 40px tall. Members are kept free of the
	// word "border" so the pill stays the only ring on screen.
	const PILL =
		'flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm';
	const TODAY = 'flex h-10 items-center px-3.5 text-sm font-semibold';
	const ARROW = 'flex h-10 w-11 items-center justify-center';
	const PRESS = 'hover:bg-slate-100 hover:text-slate-800';
</script>

<nav aria-label="{period[0].toUpperCase()}{period.slice(1)} navigation" data-testid="daynav" class={PILL}>
	<!-- The caller's period label, when it has one. Inside the pill, first. -->
	{#if leading}
		{@render leading()}
	{/if}

	<!-- Today leads: it is the way back, and the arrows are the way along. -->
	{#if todayHref}
		<a
			href={todayHref}
			aria-label="Go to today"
			aria-current={isToday ? 'date' : undefined}
			class="{TODAY} text-slate-700 {PRESS} {isToday ? 'opacity-50' : ''}"
		>
			Today
		</a>
	{:else}
		<button
			type="button"
			onclick={() => onToday?.()}
			disabled={!onToday}
			aria-label="Go to today"
			aria-current={isToday ? 'date' : undefined}
			class="{TODAY} text-slate-700 {PRESS} active:bg-slate-200 {isToday ? 'opacity-50' : ''}"
		>
			Today
		</button>
	{/if}

	{#if previousHref}
		<a href={previousHref} aria-label={previousLabel} title={previousLabel} class="{ARROW} text-slate-500 {PRESS}">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
		</a>
	{:else}
		<button
			type="button"
			onclick={() => onPrevious?.()}
			disabled={!onPrevious}
			aria-label={previousLabel}
			title={previousLabel}
			class="{ARROW} text-slate-500 {PRESS} active:bg-slate-200"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
		</button>
	{/if}

	{#if nextHref}
		<a href={nextHref} aria-label={nextLabel} title={nextLabel} class="{ARROW} text-slate-500 {PRESS}">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
			</svg>
		</a>
	{:else}
		<button
			type="button"
			onclick={() => onNext?.()}
			disabled={!onNext}
			aria-label={nextLabel}
			title={nextLabel}
			class="{ARROW} text-slate-500 {PRESS} active:bg-slate-200"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
			</svg>
		</button>
	{/if}
</nav>
