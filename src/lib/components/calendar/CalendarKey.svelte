<script lang="ts">
	import ChipKindMark from './ChipKindMark.svelte';
	import { chipSurfaceStyle, type ChipKind } from '$lib/utils/chipVocabulary';

	/**
	 * #128 gap 9 — Prototype E's Key strip.
	 *
	 * The app had four chip treatments and no way to ask what they meant. E put
	 * a key UNDER the grid it explains and welded it to the card, so it cannot
	 * be read as a control: it has no border of its own at the seam, and its
	 * only affordance is the disclosure chevron on the claim line.
	 *
	 * The samples are drawn from the app's OWN vocabulary — `ChipKindMark` and
	 * `chipSurfaceStyle`, the same two functions every view's chips come from —
	 * so the key cannot describe a chip the grid cannot draw. E hard-coded a
	 * fixture family here; a key that renders a made-up family is a picture of
	 * a key, not a key.
	 */
	interface Props {
		/** The calendar colour the timed samples wear, so the "colour = which
		 *  calendar" line has something real to point at. */
		sampleColor?: string;
	}
	let { sampleColor = '#dd5822' }: Props = $props();

	let open = $state(false);

	const CLAIM =
		'Shape says what an event is. Colour says whose it is. A due task wears no calendar colour at all — it is due, not owned.';

	/** One row per kind, from the vocabulary's own table — not a second list. */
	const ROWS: { kind: ChipKind; word: string; title: string; say: string }[] = [
		{
			kind: 'timed',
			word: 'Timed',
			title: 'Piano',
			say: 'a filled dot and no word on purpose — the row already carries the time.'
		},
		{
			kind: 'allDay',
			word: 'All-day',
			title: 'In-service day',
			say: 'a wide bar, not a fill. No background tint means anything anywhere in this app.'
		},
		{
			kind: 'task',
			word: 'Task',
			title: "Sign Mia's slip",
			say: 'a dashed outline. A task belongs to no calendar, so it wears no calendar colour — and it sits on the day it is due, red when it is late.'
		},
		{
			kind: 'sponsored',
			word: 'Sponsored',
			title: 'Toy drive',
			say: 'a bag glyph over a neutral hatch. An ad still sits on somebody’s calendar, so its colour still means calendar.'
		}
	];

	/** Same kind, three calendar colours: the one claim colour makes. */
	const SAME_TIMED: ChipKind[] = ['timed', 'timed', 'timed'];
	const SAME_CALENDARS = ['Family', 'School', 'Work'];
	const SAME_COLORS = ['#dd5822', '#0ea5e9', '#16a34a'];

	const surface = (kind: ChipKind, color: string, isAd = false) =>
		chipSurfaceStyle({ color, allDay: false, isAd });
</script>

<!-- Welded to the card: rounded only where the card ends, and no top border of
     its own — the seam above it is the grid's bottom edge. -->
<section
	data-testid="calendar-key"
	aria-label="Key"
	class="border-t border-slate-200 bg-slate-50/70 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-3xl"
>
	<button
		type="button"
		data-testid="calendar-key-toggle"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-controls="calendar-key-body"
		class="flex w-full items-center gap-2.5 rounded-lg border-0 bg-transparent text-left transition-colors hover:bg-white/70"
	>
		<span class="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400"
			>Key</span
		>
		<span class="min-w-0 flex-1 text-[13px] leading-6 text-slate-700">{CLAIM}</span>
		<svg
			class="h-3 w-3 shrink-0 text-slate-400 transition-transform {open ? 'rotate-180' : ''}"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if open}
		<div data-testid="calendar-key-body" id="calendar-key-body" class="grid gap-2.5 pt-3">
			{#each ROWS as row (row.kind)}
				<div class="flex flex-wrap items-start gap-3">
					<span
						class="flex w-40 max-w-full shrink-0 items-center gap-1.5 overflow-hidden rounded-md border-l-[3px] border-l-[var(--chip-color)] bg-white px-1.5 py-1 text-left text-[11px] font-medium leading-tight text-slate-700"
						style={surface(row.kind, sampleColor, row.kind === 'sponsored')}
					>
						<ChipKindMark kind={row.kind} density="glyph" />
						<span class="min-w-0 truncate">{row.title}</span>
					</span>
					<p class="min-w-[12rem] flex-1 text-[13px] leading-6 text-slate-700">
						<b>{row.word}</b> — {row.say}
					</p>
				</div>
			{/each}
			<p class="border-t border-slate-200 pt-2.5 text-[13px] leading-6 text-slate-700">
				<b>Colour = which calendar, and nothing else.</b> Same shape, three calendars:
				{#each SAME_TIMED as kind, i (i)}
					<span
						class="mx-0.5 inline-flex max-w-[8rem] items-center gap-1.5 overflow-hidden rounded-md border-l-[3px] border-l-[var(--chip-color)] bg-white px-1.5 py-1 align-middle text-[11px] font-medium leading-tight text-slate-700"
						style={surface(kind, SAME_COLORS[i] ?? sampleColor)}
					>
						<ChipKindMark {kind} density="glyph" />
						<span class="min-w-0 truncate">{SAME_CALENDARS[i]}</span>
					</span>
				{/each}
				— and a task wears none. Which calendars you can actually see is decided in
				<b>Filters</b>, not here.
			</p>
		</div>
	{/if}
</section>
