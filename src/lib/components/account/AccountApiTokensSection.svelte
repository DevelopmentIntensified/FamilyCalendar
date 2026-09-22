<script lang="ts">
	import { enhance } from '$app/forms';

	interface TokenRow {
		id: string;
		name: string;
		createdAt: string | Date;
		lastUsedAt: string | Date | null;
	}

	let { tokens = [], form = null }: { tokens: TokenRow[]; form?: unknown } = $props();

	// Plaintext is returned once by the create action — never stored, never re-shown.
	const formRecord =
		typeof form === 'object' && form !== null ? (form as Record<string, unknown>) : null;
	const newToken =
		formRecord && typeof formRecord.apiToken === 'string' ? formRecord.apiToken : null;
	const newTokenName =
		formRecord && typeof formRecord.apiTokenName === 'string' ? formRecord.apiTokenName : '';

	let creating = $state(false);
	let copied = $state(false);

	function fmt(v: string | Date | null): string {
		if (!v) return 'Never';
		return new Date(v).toLocaleString();
	}

	async function copyToken() {
		if (!newToken) return;
		await navigator.clipboard.writeText(newToken);
		copied = true;
	}
</script>

<div id="api">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">API Tokens</h2>
	<p class="mb-4 text-sm text-slate-600">
		Tokens let a desktop app (e.g. TaskFocus) use the task API as you. They live until
		revoked — treat them like passwords.
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
			class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
		/>
		<button
			type="submit"
			disabled={creating}
			class="rounded-full bg-primary-600 px-6 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
		>
			{creating ? 'Creating...' : 'Create token'}
		</button>
	</form>

	{#if tokens.length === 0}
		<p class="text-sm text-slate-500">No API tokens yet.</p>
	{:else}
		<ul class="space-y-2">
			{#each tokens as token (token.id)}
				<li
					class="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3"
				>
					<div>
						<p class="text-sm font-semibold text-slate-900">{token.name}</p>
						<p class="text-xs text-slate-500">
							Created {fmt(token.createdAt)} · Last used {fmt(token.lastUsedAt)}
						</p>
					</div>
					<form
						method="POST"
						action="?/revokeApiToken"
						use:enhance={() => async ({ update }) => await update()}
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
