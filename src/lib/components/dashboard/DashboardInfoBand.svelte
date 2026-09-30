<script lang="ts">
	/**
	 * The quiet info band above the dashboard cards (080).
	 *
	 * It holds readings, not work: no grid slot, no card chrome, no heading, and
	 * a type step below the cards'. Today its only occupant is the Daily Verse,
	 * whose switch now means "show the verse" — see `verseIsVisible`.
	 */
	export let dailyVerse: { reference: string; text: string; attribution?: string } | null = null;
</script>

{#if dailyVerse}
	<aside
		data-testid="dashboard-info-band"
		aria-label="Daily verse"
		class="flex flex-col gap-0.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3"
	>
		<span
			class="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
			>Daily verse</span
		>
		<p class="min-w-0 flex-1 break-words text-[13px] italic leading-snug text-slate-600">
			{dailyVerse.text}
		</p>
		<p class="shrink-0 text-[11px] leading-snug text-slate-400 sm:text-right">
			{dailyVerse.reference}
			{#if dailyVerse.attribution}
				<span class="hidden sm:inline"> · {dailyVerse.attribution}</span>
			{/if}
		</p>
	</aside>
{/if}
