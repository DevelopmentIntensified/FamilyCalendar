<!--
	Danger zone: the export card (toasts are the screen's state) and the two-step
	delete — "Delete Account" reveals the inline red form asking for the user id,
	with Confirm Deletion / Cancel; success redirects home.
-->
<script lang="ts">
	import type { AccountSectionModel } from '../account.contract';
	import type { AccountFormEnhancer } from '../account.state.svelte';

	type AccountDangerModel = Extract<AccountSectionModel, { section: 'danger' }>;

	interface Props {
		model: AccountDangerModel;
		/** The export's pending state, owned by the screen's state class. */
		exporting: boolean;
		onExport: () => void;
		enhance: AccountFormEnhancer;
	}

	let { model, exporting, onExport, enhance }: Props = $props();

	let deleteLoading = $state(false);
	let showDeleteConfirmation = $state(false);
</script>

<div id="danger">
	<div class="mb-8">
		<h2 class="mb-4 text-lg font-semibold text-slate-900">Export your data 👪</h2>
		<p data-testid="export-included" class="mb-2 text-sm text-slate-600">
			Download your data as a JSON file. It includes your profile, settings, subscriptions, your
			families (other members by name only), events with their attendance and exceptions, tasks with
			their tags and completions, bills and receipt lines, grocery items and notifications.
		</p>
		<p data-testid="export-omitted" class="mb-4 text-sm text-slate-600">
			It leaves out your password, sign-in sessions, API tokens and push-notification registrations,
			your sponsored-item consent records and your AI usage counts.
		</p>
		<button
			type="button"
			onclick={onExport}
			disabled={exporting}
			class="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
		>
			{exporting ? 'Preparing…' : 'Export your data'}
		</button>
	</div>

	<h2 class="mb-4 text-lg font-semibold text-red-600">Danger Zone</h2>
	<p class="mb-4 text-sm text-slate-600">
		Permanently delete your account and all associated data. This action cannot be undone.
	</p>

	{#if !showDeleteConfirmation}
		<button
			type="button"
			onclick={() => (showDeleteConfirmation = true)}
			class="rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
		>
			Delete Account
		</button>
	{:else}
		<form
			method="POST"
			action="?/deleteAccount"
			use:enhance={() => {
				deleteLoading = true;
				return async ({ update }) => {
					deleteLoading = false;
					await update();
				};
			}}
			class="space-y-4 rounded-lg border border-red-200 bg-red-50 p-4"
		>
			<p class="text-sm text-red-600">
				This will permanently delete your account. To confirm, type your user ID: <code
					class="rounded bg-slate-100 px-1">{model.userId}</code
				>
			</p>
			<div class="space-y-2">
				<label for="confirmation" class="block text-sm font-medium text-slate-700"
					>Confirmation</label
				>
				<input
					type="text"
					id="confirmation"
					name="confirmation"
					placeholder="Enter your user ID to confirm"
					class="w-full rounded-xl border border-slate-300 px-4 py-2.5 transition-colors focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
					required
				/>
			</div>
			<div class="flex gap-3">
				<button
					type="submit"
					disabled={deleteLoading}
					class="rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
				>
					{deleteLoading ? 'Deleting...' : 'Confirm Deletion'}
				</button>
				<button
					type="button"
					onclick={() => (showDeleteConfirmation = false)}
					class="rounded-full bg-slate-200 px-6 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
				>
					Cancel
				</button>
			</div>
		</form>
	{/if}
</div>
