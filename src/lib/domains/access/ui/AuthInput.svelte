<!--
	A labelled auth field: a real `<label for>`, the raw attribute set the
	callers need, and the inline error tied to the input by
	`aria-describedby="<id>-error"` with `aria-invalid` while it shows.

	Value in, callback out (no `bind:` on a component, issue 200), so the
	state class stays the one owner of every field.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props {
		id: string;
		label: string;
		value?: string;
		onValueChange?: (value: string) => void;
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
	}

	let {
		id,
		label,
		value = '',
		onValueChange,
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
	}: Props = $props();
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
		{value}
		oninput={(event) => onValueChange?.(event.currentTarget.value)}
		aria-invalid={invalid || error ? 'true' : undefined}
		aria-describedby={error ? `${id}-error` : undefined}
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
