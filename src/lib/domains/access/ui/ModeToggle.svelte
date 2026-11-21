<!--
	The Password / Email Link switch: a `role="group"` of two `aria-pressed`
	buttons with 44 px minimum targets. Options in, chosen value out; generic so
	a caller's own method union survives the round trip.

	Doc: ../README.md#public-interface
-->
<script lang="ts" generics="T extends string">
	/* eslint-disable no-undef -- Svelte 5 generics ("T") are invisible to eslint's svelte parser */
	interface Props {
		options: ReadonlyArray<{ value: T; label: string }>;
		value: T;
		onValueChange?: (value: T) => void;
		groupLabel?: string;
	}

	let { options, value, onValueChange, groupLabel = 'Login method' }: Props = $props();
</script>

<div class="mb-6 flex rounded-xl bg-slate-100 p-1" role="group" aria-label={groupLabel}>
	{#each options as option (option.value)}
		<button
			type="button"
			aria-pressed={value === option.value}
			onclick={() => onValueChange?.(option.value)}
			class="min-h-[44px] flex-1 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 {value ===
			option.value
				? 'bg-white text-slate-900 shadow-sm'
				: 'text-slate-500 hover:text-slate-700'}"
		>
			{option.label}
		</button>
	{/each}
</div>
