<script lang="ts">
	/** #280 category chip — same pill shape as the #tag chips, teal hue so a
	 * category never reads as a tag. Renders nothing for null/blank. */
	interface Props {
		name: string | null | undefined;
		/** Completed rows fade their chips. */
		muted?: boolean;
	}

	let { name, muted = false }: Props = $props();

	let label = $derived(name?.trim() ?? '');
</script>

{#if label}
	<span
		data-testid="category-chip"
		title="Category: {label}"
		class="inline-flex max-w-[10rem] shrink-0 items-center truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium {muted
			? 'bg-teal-100/60 text-teal-700/70'
			: 'bg-teal-100 text-teal-800'}">{label}</span
	>
{/if}
