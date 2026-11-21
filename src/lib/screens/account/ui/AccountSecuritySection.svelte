<!--
	Security: one action, "Logout from All Other Devices" ("Logging out..." while
	it runs). API tokens are not sessions and are untouched — the copy says so.
-->
<script lang="ts">
	import type { AccountFormEnhancer } from '../account.state.svelte';

	interface Props {
		enhance: AccountFormEnhancer;
	}

	let { enhance }: Props = $props();

	let logoutAllLoading = $state(false);
</script>

<div id="security">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">Security</h2>
	<form
		method="POST"
		action="?/logoutAllDevices"
		use:enhance={() => {
			logoutAllLoading = true;
			return async ({ update }) => {
				logoutAllLoading = false;
				await update();
			};
		}}
		class="space-y-4"
	>
		<p class="text-sm text-slate-600">
			Log out from all devices except the current one. This will invalidate all other sessions.
		</p>
		<button
			type="submit"
			disabled={logoutAllLoading}
			class="rounded-full bg-yellow-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-yellow-700 disabled:opacity-50"
		>
			{logoutAllLoading ? 'Logging out...' : 'Logout from All Other Devices'}
		</button>
	</form>
</div>
