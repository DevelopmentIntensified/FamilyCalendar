<!--
	The live code, drawn the way the approved page draws it: 28px extra-bold
	monospace in a sky-washed box, one segment per allowed use, and the copy
	button with its inline confirmation.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import type { InviteCodeView } from '../family.contract';
	import {
		FAMILY_COPY_FAILED_COPY,
		familyInviteMetaLabel,
		familyInviteUseSlots
	} from '../family.invitations.rules';

	interface Props {
		familyName: string;
		invite: InviteCodeView;
		url: string;
		copied: boolean;
		copyFailed: boolean;
		oncopy: () => void;
	}

	let { familyName, invite, url, copied, copyFailed, oncopy }: Props = $props();

	const slots = $derived(familyInviteUseSlots(invite));
	const meta = $derived(familyInviteMetaLabel(invite));
</script>

<section
	data-invite-codebox
	class="flex flex-wrap items-center gap-4 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-100/60 to-white p-5"
	aria-labelledby="live-code-heading"
>
	<div class="min-w-0 flex-1">
		<h2 id="live-code-heading" class="text-[10px] font-bold uppercase tracking-widest text-slate-500">
			Active code
		</h2>
		<code class="mt-1 block font-mono text-[28px] font-extrabold leading-none tracking-[0.12em] text-slate-900"
			>{invite.code}</code
		>
		{#if slots.length > 0}
			<div class="mt-3 flex max-w-[11rem] gap-1.5" aria-hidden="true">
				{#each slots as slot, i (i)}
					<span
						data-use-slot={slot}
						class="h-2 flex-1 rounded-full {slot === 'used' ? 'bg-primary-600' : 'bg-slate-200'}"
					></span>
				{/each}
			</div>
		{/if}
		<p class="mt-1.5 text-xs text-slate-500">{meta}</p>
	</div>
	<div class="flex shrink-0 flex-col gap-2">
		<button
			type="button"
			onclick={oncopy}
			class="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
		>
			{copied ? 'Copied ✓' : 'Copy join link'}
		</button>
		<div class="min-w-0 text-xs text-slate-500">
			<input
				type="text"
				readonly
				aria-label="Join link for {familyName}"
				value={url}
				class="w-full min-w-0 rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-600"
			/>
		</div>
		{#if copyFailed}
			<p class="text-xs text-red-600">{FAMILY_COPY_FAILED_COPY}</p>
		{/if}
	</div>
</section>
