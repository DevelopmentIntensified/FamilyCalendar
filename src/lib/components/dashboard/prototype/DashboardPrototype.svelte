<script lang="ts">
	/** PROTOTYPE (issue 208) — the switcher on /calendar/dashboard: three
	 *  structurally different reflow variants, picked by `?variant=A|B|C`,
	 *  with the review dock. Dev-gated at the call site; prod builds never
	 *  render this. */
	import { page } from '$app/state';
	import { VARIANTS, type VariantKey, type PrototypeProps } from './prototypeProps';
	import VariantMorningRead from './VariantMorningRead.svelte';
	import VariantFocusFirst from './VariantFocusFirst.svelte';
	import VariantBoardFirst from './VariantBoardFirst.svelte';
	import PrototypeDock from './PrototypeDock.svelte';

	let { props }: { props: PrototypeProps } = $props();

	const variantNames: Record<VariantKey, string> = {
		A: 'Morning Read',
		B: 'Focus First',
		C: 'Board First'
	};

	let variant = $derived.by(() => {
		const q = page.url.searchParams.get('variant')?.toUpperCase() ?? 'A';
		return (VARIANTS as readonly string[]).includes(q) ? (q as VariantKey) : 'A';
	});

	const passing = $derived({ ...props, onEventClick: props.onEventClick ?? (() => {}) });
</script>

{#if variant === 'A'}
	<VariantMorningRead {...passing} />
{:else if variant === 'B'}
	<VariantFocusFirst {...passing} />
{:else}
	<VariantBoardFirst {...passing} />
{/if}

<PrototypeDock current={variant} {variantNames} />
