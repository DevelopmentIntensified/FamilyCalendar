<!--
	The rail's NEW CODE band: a validity window and a max-use count (the route
	honours both since issue 091), then Create new code. It leaves the codes the
	family already has working, which the copy says out loud.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import {
		FAMILY_MAX_USES_MAX,
		FAMILY_MAX_USES_MIN,
		FAMILY_VALIDITY_CHOICES
	} from '../family.invitations.rules';

	interface Props {
		validityDays: number;
		maxUses: number;
		creating: boolean;
		onvalidity: (days: number) => void;
		onuses: (uses: number) => void;
		oncreate: () => void;
	}

	let { validityDays, maxUses, creating, onvalidity, onuses, oncreate }: Props = $props();
</script>

<section
	class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	aria-label="New code"
>
	<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">New code</h2>
	<p class="text-xs leading-relaxed text-slate-500">
		A new code joins the codes this family already has. It leaves the current code working, so send
		it only to the person you mean to invite — revoke the old one when you are done.
	</p>

	<div class="mt-3">
		<label for="validity" class="mb-1.5 block text-xs font-medium text-slate-500">Valid for</label>
		<select
			id="validity"
			value={validityDays}
			onchange={(event) => onvalidity(Number(event.currentTarget.value))}
			class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
		>
			{#each FAMILY_VALIDITY_CHOICES as choice (choice.days)}
				<option value={choice.days}>{choice.label}</option>
			{/each}
		</select>
	</div>

	<div class="mt-3">
		<label for="maxUses" class="mb-1.5 block text-xs font-medium text-slate-500">Max uses</label>
		<input
			id="maxUses"
			type="number"
			value={maxUses}
			min={FAMILY_MAX_USES_MIN}
			max={FAMILY_MAX_USES_MAX}
			oninput={(event) => onuses(Number(event.currentTarget.value))}
			class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
		/>
		<p class="mt-1 text-xs text-slate-400">
			A use is spent when somebody joins, not when the link is opened.
		</p>
	</div>

	<button
		type="button"
		onclick={oncreate}
		disabled={creating}
		aria-busy={creating}
		class="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
	>
		{creating ? 'Creating…' : 'Create new code'}
	</button>
</section>
