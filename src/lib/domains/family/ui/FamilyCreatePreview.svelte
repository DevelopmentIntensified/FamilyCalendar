<!--
	The approved live preview at the top of `/family/create`: the name as typed,
	washed in the chosen colour with a blurred glow, one avatar per pick and a
	dashed "+" slot while fewer than two people are picked.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import type { MemberSearchHit } from '../family.contract';
	import { FAMILY_PREVIEW_SLOT_BELOW, familyPreviewInitials } from '../family.create.rules';

	interface Props {
		name: string;
		color: string;
		picked: readonly MemberSearchHit[];
	}

	let { name, color, picked }: Props = $props();
</script>

<div
	data-family-preview
	class="relative mb-1 overflow-hidden rounded-3xl p-6"
	style="background-color: {color}1a"
>
	<div
		data-preview-glow
		class="pointer-events-none absolute -top-6 right-1 h-28 w-28 rounded-full blur-xl"
		style="background-color: {color}33"
	></div>
	<div class="relative">
		<span
			class="inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
			style="background-color: {color}22; color: {color}"
		>
			Family
		</span>
		<p class="mt-2 break-words text-[22px] font-extrabold tracking-tight text-slate-900">
			{name.trim() || 'Your family'}
		</p>
		<div class="mt-4 flex items-center">
			{#each picked as person (person.id)}
				<span
					data-preview-avatar
					title="{person.firstName} {person.lastName}"
					class="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-white/70 text-[11px] font-extrabold text-slate-700"
				>
					{familyPreviewInitials(person)}
				</span>
			{/each}
			{#if picked.length < FAMILY_PREVIEW_SLOT_BELOW}
				<span
					data-preview-open-slot
					title="Room for another"
					class="-ml-1 grid h-8 w-8 place-items-center rounded-full border-2 border-dashed border-slate-300 text-sm text-slate-400"
				>
					+
				</span>
			{/if}
		</div>
	</div>
</div>
