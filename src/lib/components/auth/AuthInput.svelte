<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		id,
		label,
		value = $bindable(''),
		type = 'text',
		autocomplete,
		placeholder,
		required = false,
		inputmode,
		center = false,
		invalid = false,
		error = '',
		class: className = '',
		labelRight
	}: {
		id: string;
		label: string;
		value?: string;
		type?: string;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		placeholder?: string;
		required?: boolean;
		inputmode?: 'text' | 'numeric' | 'tel' | 'email' | 'url';
		center?: boolean;
		invalid?: boolean;
		error?: string;
		class?: string;
		labelRight?: Snippet;
	} = $props();
</script>

<div class={className}>
	<div class="mb-1.5 flex items-baseline justify-between gap-3">
		<label for={id} class="text-sm font-medium text-slate-700">{label}</label>
		{#if labelRight}
			{@render labelRight()}
		{/if}
	</div>
	<input
		{id}
		{type}
		{autocomplete}
		{placeholder}
		{required}
		{inputmode}
		aria-invalid={invalid || undefined}
		aria-describedby={error ? `${id}-error` : undefined}
		bind:value
		class="block w-full rounded-[10px] border bg-white px-4 py-3 text-base text-slate-900 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 {center
			? 'text-center text-lg tracking-[0.3em]'
			: ''} {invalid
			? 'border-red-400 focus:border-red-500 focus:ring-red-500/20'
			: 'border-slate-300 focus:border-primary-500 focus:ring-primary-500/20'}"
	/>
	{#if error}
		<p id="{id}-error" class="mt-1.5 text-sm text-red-600">{error}</p>
	{/if}
</div>
