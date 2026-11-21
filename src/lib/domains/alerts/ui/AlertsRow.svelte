<!--
	One Alert in the feed. A real `<a href>` when the Alert has a deep link, so
	open-in-new-tab works; the plain-click decision is `isPlainAlertClick` and
	the caller owns the read-mark and navigation.

	The unread wash (`from-primary-50`) is the prototype's only difference
	between a read row and an unread one: a flat grey reads as quieter than the
	white rows around it, which is the opposite of the mark's job.

	The badge's classes come from the vocabulary rules (`alertTone`), the same
	tables the bell uses, so the two surfaces cannot drift (issue 073).

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import { relativeFromNow } from '$lib/kernel/time/dates';
	import type { AlertRow } from '../alerts.contract';
	import { isPlainAlertClick } from '../alerts.feed.rules';
	import { alertGlyph, alertLabel, alertTone } from '../alerts.vocabulary.rules';

	interface Props {
		row: AlertRow;
		/** The pinned "now" (the page's render instant) for the age label. */
		now: Date;
		/** The viewer's IANA zone, for the age label. */
		zone: string;
		/** A plain click on the row; the caller marks it read and navigates. */
		onopen: (row: AlertRow) => void;
	}

	let { row, now, zone, onopen }: Props = $props();

	const age = $derived(relativeFromNow(row.createdAt, now, zone));

	function handleClick(event: MouseEvent): void {
		// Modified clicks stay the browser's: a new tab must not race a read-mark.
		if (!isPlainAlertClick(event)) return;
		event.preventDefault();
		onopen(row);
	}
</script>

{#snippet inner()}
	<span class="w-2 shrink-0 pt-1.5">
		{#if !row.readAt}
			<span class="block h-2 w-2 rounded-full bg-primary-600" data-testid="unread-dot"></span>
		{/if}
	</span>
	<span
		class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold {alertTone(
			row.rawType
		)}"
		aria-hidden="true"
	>
		{alertGlyph(row.rawType)}
	</span>
	<span class="min-w-0 flex-1">
		<span
			class="block text-sm leading-snug {row.readAt
				? 'text-slate-600'
				: 'font-semibold text-slate-900'}"
		>
			<span class="font-semibold">{row.actorName}</span>
			{row.message}
		</span>
		<span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
			<span
				class="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-bold {alertTone(
					row.rawType
				)}"
			>
				{alertLabel(row.rawType)}
			</span>
			<span class="text-xs text-slate-400">{age}</span>
		</span>
	</span>
{/snippet}

<li
	data-unread={row.readAt ? 'false' : 'true'}
	class={row.readAt ? '' : 'bg-gradient-to-r from-primary-50 to-transparent'}
>
	{#if row.link}
		<a
			href={row.link}
			onclick={handleClick}
			class="flex items-start gap-3 px-3 py-3 no-underline hover:bg-slate-100"
		>
			{@render inner()}
		</a>
	{:else}
		<button
			type="button"
			onclick={handleClick}
			class="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-slate-100"
		>
			{@render inner()}
		</button>
	{/if}
</li>
