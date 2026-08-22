<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	const WEEKDAY_LABELS: Record<string, string[]> = {
		sunday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
		monday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
	};
	$: labels = WEEKDAY_LABELS[data.weekStart] ?? WEEKDAY_LABELS.sunday;

	let autoPrinted = false;
	onMount(() => {
		if (!autoPrinted && new URLSearchParams(window.location.search).get('auto') === '1') {
			autoPrinted = true;
			setTimeout(() => window.print(), 300);
		}
	});
</script>

<svelte:head>
	<title>{data.monthName} {data.year} — Print</title>
</svelte:head>

<div class="mx-auto max-w-6xl p-4 print:p-0">
	<!-- Controls (never printed) -->
	<div class="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
		<a href="/calendar" class="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
			Calendar
		</a>
		<div class="flex items-center gap-2">
			<a
				href="?year={data.prev.year}&month={data.prev.month}"
				class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
			>← {new Date(data.prev.year, data.prev.month - 1).toLocaleString('en', { month: 'short' })}</a>
			{#if !data.isCurrentMonth}
				<span class="text-sm font-medium text-primary-600">Jump to now ↓</span>
			{/if}
			<a
				href="?year={data.next.year}&month={data.next.month}"
				class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
			>{new Date(data.next.year, data.next.month - 1).toLocaleString('en', { month: 'short' })} →</a>
			<button
				type="button"
				onclick={() => window.print()}
				class="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700"
			>
				🖨️ Print
			</button>
		</div>
	</div>

	<!-- Fridge sheet -->
	<div class="fridge-sheet rounded-xl bg-white p-4 shadow-sm print:shadow-none print:rounded-none">
		<header class="mb-3 text-center">
			<h1 class="text-3xl font-black tracking-tight text-slate-900 print:text-4xl">
				{data.monthName} {data.year}
			</h1>
			<p class="text-xs uppercase tracking-[0.25em] text-slate-400">
				{data.familyName ?? 'Family Planz'}
			</p>
		</header>

		<div class="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-300 bg-slate-300 print:border-slate-400">
			{#each labels as label}
				<div class="bg-slate-100 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500 print:bg-slate-200">
					{label}
				</div>
			{/each}

			{#each data.grid as cell (cell.iso)}
				<div
					class="cell bg-white p-1 {cell.inMonth ? '' : 'bg-slate-50/70'} {cell.isToday ? 'ring-2 ring-inset ring-primary-400' : ''}"
				>
					<div class="mb-0.5 flex items-center justify-between px-0.5">
						<span
							class="flex h-5 w-5 items-center justify-center text-[11px] font-bold {cell.isToday
								? 'rounded-full bg-primary-600 text-white'
								: cell.inMonth
									? 'text-slate-700'
									: 'text-slate-300'}"
						>
							{cell.day}
						</span>
						{#if cell.items.length > 3}
							<span class="pr-0.5 text-[9px] font-semibold text-slate-400">+{cell.items.length - 3}</span>
						{/if}
					</div>
					<ul class="space-y-[2px]">
						{#each cell.items.slice(0, 3) as item}
							<li class="flex items-start gap-1 leading-tight">
								<span class="mt-[3px] h-2 w-2 shrink-0 rounded-full" style="background-color: {item.color}; -webkit-print-color-adjust: exact; print-color-adjust: exact;"></span>
								<span class="line-clamp-2 text-[10px] font-semibold text-slate-800 print:text-[11px]" style="-webkit-print-color-adjust: exact;">{item.title}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>

		<p class="mt-2 text-center text-[10px] text-slate-300">familyplanz.com</p>
	</div>
</div>

<style>
	.cell {
		min-height: 96px;
	}
	@media screen and (min-width: 640px) {
		.cell {
			min-height: 112px;
		}
	}
	@media print {
		@page {
			size: A4 landscape;
			margin: 8mm;
		}
		:global(body) {
			background: white !important;
		}
		.fridge-sheet header {
			margin-bottom: 1.5mm;
		}
		.cell {
			min-height: 0 !important;
			height: 22mm;
		}
	}
</style>
