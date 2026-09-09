<script lang="ts">
	interface Props {
		tone: 'before' | 'after';
		title: string;
		items: string[];
	}

	let { tone, title, items }: Props = $props();

	const good = $derived(tone === 'after');
</script>

<div
	class="rounded-3xl border {good
		? 'border-green-100 bg-green-50'
		: 'border-red-100 bg-red-50'} p-8"
>
	<div
		class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl {good
			? 'bg-green-100'
			: 'bg-red-100'}"
	>
		{#if good}
			<svg
				class="h-6 w-6 text-green-500"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		{:else}
			<svg
				class="h-6 w-6 text-red-500"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		{/if}
	</div>
	<h3 class="mb-4 text-xl font-bold text-slate-900">{title}</h3>
	<ul class="space-y-3 {good ? 'text-slate-700' : 'text-slate-600'}">
		{#each items as item}
			<li class="flex items-start gap-3">
				<span class="mt-0.5 {good ? 'text-green-500' : 'text-red-400'}">{good ? '✓' : '✕'}</span>
				<span>{item}</span>
			</li>
		{/each}
	</ul>
</div>
