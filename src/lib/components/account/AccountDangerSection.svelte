<script lang="ts">
	import { enhance } from '$app/forms';
	import { pushToast } from '$lib/client/toasts';

	interface Props {
		userId: string;
	}

	let { userId }: Props = $props();

	let deleteLoading = $state(false);
	let showDeleteConfirmation = $state(false);
	let exportLoading = $state(false);

	// #189: stream the requester's own data as a JSON file download. Toast
	// immediately (<100ms ack) naming the action, then on the outcome.
	async function exportData() {
		exportLoading = true;
		pushToast({ message: 'Preparing your data export…' });
		try {
			const response = await fetch('/api/account/export');
			if (!response.ok) throw new Error(`Export failed (${response.status})`);
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `familyplanz-export-${new Date().toISOString().slice(0, 10)}.json`;
			link.click();
			URL.revokeObjectURL(url);
			pushToast({ message: 'Data export downloaded.' });
		} catch (error) {
			console.error('Data export failed:', error);
			pushToast({ message: 'Data export failed — please try again.' });
		} finally {
			exportLoading = false;
		}
	}
</script>

<div id="danger">
	<div class="mb-8">
		<h2 class="mb-4 text-lg font-semibold text-slate-900">Export your data 👪</h2>
		<p class="mb-4 text-sm text-slate-600">
			Download a copy of everything your account stores: profile, settings, families,
			calendars and events, tasks, bills and receipt lines, grocery lists and notifications.
			The download is JSON.
		</p>
		<button
			type="button"
			onclick={exportData}
			disabled={exportLoading}
			class="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
		>
			{exportLoading ? 'Preparing…' : 'Export your data'}
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
					class="rounded bg-slate-100 px-1">{userId}</code
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
					class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
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
