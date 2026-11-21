<!--
	"Invite by email": Send Invite, or Get Invite Link for the same names. The
	minted link is shown here with copy and "Expires in 24 hours", and the note
	spells out what the recipient actually gets.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import type { FamilyInviteFormState } from '../family.addMember.state.svelte';

	interface Props {
		state: FamilyInviteFormState;
		onfail: (message: string) => void;
		onclearerror: () => void;
		onadded: (invitedEmail: string) => void;
	}

	let { state, onfail, onclearerror, onadded }: Props = $props();

	async function send(): Promise<void> {
		const outcome = await state.send();
		if (!outcome.ok) {
			if (outcome.error) onfail(outcome.error);
			return;
		}
		onadded(state.email);
	}

	async function mintLink(): Promise<void> {
		onclearerror();
		const outcome = await state.mintLink();
		if (!outcome.ok && outcome.error) onfail(outcome.error);
	}
</script>

<form
	onsubmit={(event) => {
		event.preventDefault();
		void send();
	}}
	class="space-y-4"
>
	<div>
		<label for="firstName" class="mb-2 block text-sm font-medium text-slate-700">First Name</label>
		<input
			type="text"
			id="firstName"
			bind:value={state.firstName}
			required
			class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
		/>
	</div>
	<div>
		<label for="lastName" class="mb-2 block text-sm font-medium text-slate-700">Last Name</label>
		<input
			type="text"
			id="lastName"
			bind:value={state.lastName}
			required
			class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
		/>
	</div>
	<div>
		<label for="email" class="mb-2 block text-sm font-medium text-slate-700">Email</label>
		<input
			type="email"
			id="email"
			bind:value={state.email}
			required
			class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
		/>
	</div>
	<div class="flex gap-3">
		<button
			type="submit"
			disabled={state.sending}
			class="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
		>
			{state.sending ? 'Sending Invite...' : 'Send Invite'}
		</button>
		<button
			type="button"
			onclick={() => void mintLink()}
			disabled={state.generatingLink || !state.complete}
			class="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
		>
			{state.generatingLink ? 'Generating...' : 'Get Invite Link'}
		</button>
	</div>
</form>

<aside
	role="note"
	aria-label="What they get"
	class="mt-4 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-100/60 to-white px-4 py-3.5 text-[13px] leading-relaxed text-slate-800"
>
	<b>What they get.</b> A link to <code>/family/join/[code]</code>. They make an account with that
	email and land straight in the family — no invite list to accept, nothing to keep track of.
</aside>

{#if state.link}
	<div class="mt-4 rounded-lg border border-primary-200 bg-primary-50 p-4">
		<p class="mb-2 text-sm font-medium text-primary-800">Share this link with {state.firstName}:</p>
		<div class="flex gap-2">
			<input
				type="text"
				readonly
				value={state.link}
				class="flex-1 rounded-lg border border-primary-300 bg-white px-3 py-2 text-xs text-slate-700"
			/>
			<button
				onclick={() => void state.copyLink()}
				class="rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700"
			>
				{state.copiedLink ? (state.wasShared ? 'Shared ✓' : 'Copied ✓') : 'Copy'}
			</button>
		</div>
		{#if state.copyFailed}
			<p class="mt-2 text-xs text-red-600">
				Copy failed — select the link above and copy it manually: {state.link}
			</p>
		{/if}
		<p class="mt-2 text-xs text-primary-600">Expires in 24 hours</p>
	</div>
{/if}
