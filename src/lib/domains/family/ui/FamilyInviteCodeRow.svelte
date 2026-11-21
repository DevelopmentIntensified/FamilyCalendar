<!--
	One code that is not the live one: its uses and expiry, whether it still
	works, and Copy + Revoke. The revoke button acknowledges on its own row.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import type { InviteCodeView } from '../family.contract';
	import { familyInviteMetaLabel } from '../family.invitations.rules';

	interface Props {
		invite: InviteCodeView;
		usable: boolean;
		copied: boolean;
		revoking: boolean;
		oncopy: () => void;
		onrevoke: () => void;
	}

	let { invite, usable, copied, revoking, oncopy, onrevoke }: Props = $props();

	const meta = $derived(familyInviteMetaLabel(invite));
</script>

<li class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<code class="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm font-bold text-slate-700"
					>{invite.code}</code
				>
				{#if !usable}
					<span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600"
						>Inactive</span
					>
				{/if}
			</div>
			<p class="mt-2 text-sm text-slate-500">{meta}</p>
		</div>
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={oncopy}
				class="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
			>
				{copied ? 'Copied ✓' : 'Copy'}
			</button>
			<button
				type="button"
				aria-label="Revoke {invite.code}"
				onclick={onrevoke}
				disabled={revoking}
				class="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
			>
				{revoking ? 'Revoking…' : 'Revoke'}
			</button>
		</div>
	</div>
</li>
