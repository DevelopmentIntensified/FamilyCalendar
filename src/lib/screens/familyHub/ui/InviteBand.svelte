<!--
	The rail's "Active invitation" band: Code, Uses "N of M or ∞", Expires,
	Created by, the "send this link"/"get a join link" door, or the none state.
	Visible to every member, not admin-gated.
	Legacy reference: `family/[familyId]/+page.svelte:830-866`.
-->
<script lang="ts">
	import type { FamilyHubState } from '../familyHub.detail.state.svelte';
	import { inviteExpiryLabel, inviteUsesLabel } from '../familyHub.detail.rules';

	interface Props {
		state: FamilyHubState;
	}

	let { state }: Props = $props();

	const invite = $derived(state.data.activeInvite);
</script>

<section
	class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	aria-label="Active invitation"
>
	<h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
		Active invitation
	</h2>
	{#if invite}
		<dl class="text-sm">
			<div class="flex items-baseline justify-between gap-3 py-1.5">
				<dt class="font-medium text-slate-700">Code</dt>
				<dd class="font-mono text-slate-600">{invite.code}</dd>
			</div>
			<div class="flex items-baseline justify-between gap-3 border-t border-slate-100 py-1.5">
				<dt class="font-medium text-slate-700">Uses</dt>
				<dd class="text-slate-600">{inviteUsesLabel(invite)}</dd>
			</div>
			<div class="flex items-baseline justify-between gap-3 border-t border-slate-100 py-1.5">
				<dt class="font-medium text-slate-700">Expires</dt>
				<dd class="text-slate-600">{inviteExpiryLabel(invite.expiresAt)}</dd>
			</div>
			{#if state.data.inviteCreatedBy}
				<div class="flex items-baseline justify-between gap-3 border-t border-slate-100 py-1.5">
					<dt class="font-medium text-slate-700">Created by</dt>
					<dd class="text-slate-600">{state.data.inviteCreatedBy}</dd>
				</div>
			{/if}
		</dl>
		<a
			href="/family/invitations"
			class="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary-600 hover:text-primary-700"
		>
			Send this link to someone
		</a>
	{:else}
		<p class="py-2 text-sm text-slate-500">
			No active invitation. Mint a link to bring somebody into this family.
		</p>
		{#if state.isAdmin}
			<a
				href="/family/invitations"
				class="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary-600 hover:text-primary-700"
			>
				Get a join link
			</a>
		{/if}
	{/if}
</section>
