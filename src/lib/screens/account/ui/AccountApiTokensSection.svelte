<!--
	API tokens: the create form (the plaintext shows once, in the amber box, with
	a Copy button), the token rows with their relative "last used …" line and a
	Revoke button, and the empty state.

	The approved row also masks a token (`fp_live_••••7a2c`); that is NOT built
	because `api_tokens` stores only a hash and has no last-four column, so those
	characters do not exist to show.
-->
<script lang="ts">
	import type { AccountActionForm } from '../account.form.rules';
	import type { AccountSectionModel } from '../account.contract';
	import { accountLastUsedLabel } from '../account.subscription.rules';
	import type { AccountFormEnhancer } from '../account.state.svelte';

	type AccountApiModel = Extract<AccountSectionModel, { section: 'api' }>;

	interface Props {
		model: AccountApiModel;
		form: AccountActionForm | null;
		/** The page load's instant: "last used …" is relative to it. */
		now: Date;
		enhance: AccountFormEnhancer;
	}

	let { model, form, now, enhance }: Props = $props();

	// Plaintext arrives in the create answer only; `$derived` because `form`
	// changes after submit.
	const newToken = $derived(form?.apiToken ?? null);
	const newTokenName = $derived(form?.apiTokenName ?? '');

	let creating = $state(false);
	let copied = $state(false);

	async function copyToken(): Promise<void> {
		if (!newToken) return;
		await navigator.clipboard.writeText(newToken);
		copied = true;
	}
</script>

<div id="api">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">API Tokens</h2>
	<p class="mb-4 text-sm text-slate-600">
		Tokens let a desktop app (e.g. TaskFocus) use the task API as you. They live until revoked —
		treat them like passwords.
	</p>
	<p class="mb-4 text-xs leading-relaxed text-slate-500">
		Only the hash is stored, so a lost token cannot be recovered — it has to be replaced. There is
		no scope per token: every token can read and write the whole account.
	</p>

	{#if newToken}
		<div class="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
			<p class="text-sm font-semibold text-amber-900">
				Token '{newTokenName}' created — copy it now, it won't be shown again.
			</p>
			<div class="mt-2 flex items-center gap-2">
				<code class="flex-1 break-all rounded bg-white px-3 py-2 font-mono text-sm text-slate-900"
					>{newToken}</code
				>
				<button
					type="button"
					onclick={copyToken}
					class="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
				>
					{copied ? 'Copied!' : 'Copy'}
				</button>
			</div>
		</div>
	{/if}

	<form
		method="POST"
		action="?/createApiToken"
		use:enhance={() => {
			creating = true;
			copied = false;
			return async ({ update }) => {
				creating = false;
				await update();
			};
		}}
		class="mb-6 flex gap-2"
	>
		<input
			type="text"
			name="name"
			placeholder="Token name (e.g. TaskFocus laptop)"
			maxlength="60"
			class="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
		/>
		<button
			type="submit"
			disabled={creating}
			class="rounded-full bg-primary-600 px-6 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
		>
			{creating ? 'Creating...' : 'Create token'}
		</button>
	</form>

	{#if model.tokens.length === 0}
		<p class="text-sm text-slate-500">No API tokens yet.</p>
	{:else}
		<ul class="space-y-2">
			{#each model.tokens as token (token.id)}
				<li
					class="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3"
				>
					<div class="min-w-0">
						<p class="truncate text-sm font-semibold text-slate-900">{token.name}</p>
						<p class="text-xs text-slate-500">
							{accountLastUsedLabel(token.lastUsedAt, now) ?? 'last used at an unknown time'}
						</p>
					</div>
					<form
						method="POST"
						action="?/revokeApiToken"
						use:enhance={() =>
							async ({ update }) =>
								await update()}
					>
						<input type="hidden" name="tokenId" value={token.id} />
						<button
							type="submit"
							class="rounded-full border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
						>
							Revoke
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</div>
