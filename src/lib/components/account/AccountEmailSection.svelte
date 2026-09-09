<script lang="ts">
	import { enhance } from '$app/forms';

	interface Props {
		user: { email?: string | null; emailVerified?: boolean | null };
	}

	let { user }: Props = $props();

	let emailLoading = $state(false);
</script>

<div id="email">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">Email Address</h2>
	<form
		method="POST"
		action="?/updateEmail"
		use:enhance={() => {
			emailLoading = true;
			return async ({ update }) => {
				emailLoading = false;
				await update({ reset: false });
			};
		}}
		class="space-y-4"
	>
		<div class="space-y-2">
			<label for="email" class="block text-sm font-medium text-slate-700">Email</label>
			<input
				type="email"
				id="email"
				name="email"
				value={user.email}
				class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
				required
			/>
		</div>
		<div class="flex items-center gap-2">
			<span class="text-sm {user.emailVerified ? 'text-green-600' : 'text-slate-500'}">
				Status: {user.emailVerified ? 'Verified' : 'Not Verified'}
			</span>
			{#if user.emailVerified}
				<svg class="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M5 13l4 4L19 7"
					/>
				</svg>
			{/if}
		</div>
		<button
			type="submit"
			disabled={emailLoading}
			class="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
		>
			{emailLoading ? 'Updating...' : 'Update Email'}
		</button>
	</form>
</div>
