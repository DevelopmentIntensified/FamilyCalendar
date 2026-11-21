<!--
	Profile: the two name inputs and "Update Profile" ("Saving..." while the save
	runs). Legacy `AccountProfileSection.svelte` is the reference; `reset: false`
	keeps the reload from snapping the inputs back to their markup defaults while
	the action answers.
-->
<script lang="ts">
	import type { AccountPersonModel } from '../account.contract';
	import type { AccountFormEnhancer } from '../account.state.svelte';

	interface Props {
		person: AccountPersonModel;
		enhance: AccountFormEnhancer;
	}

	let { person, enhance }: Props = $props();

	let profileLoading = $state(false);
</script>

<div id="profile">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">Profile Information</h2>
	<form
		method="POST"
		action="?/updateProfile"
		use:enhance={() => {
			profileLoading = true;
			return async ({ update }) => {
				profileLoading = false;
				await update({ reset: false });
			};
		}}
		class="space-y-4"
	>
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-2">
				<label for="firstName" class="block text-sm font-medium text-slate-700">First Name</label>
				<input
					type="text"
					id="firstName"
					name="firstName"
					value={person.firstName}
					class="w-full rounded-xl border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
					required
				/>
			</div>
			<div class="space-y-2">
				<label for="lastName" class="block text-sm font-medium text-slate-700">Last Name</label>
				<input
					type="text"
					id="lastName"
					name="lastName"
					value={person.lastName}
					class="w-full rounded-xl border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
					required
				/>
			</div>
		</div>
		<button
			type="submit"
			disabled={profileLoading}
			class="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
		>
			{profileLoading ? 'Saving...' : 'Update Profile'}
		</button>
	</form>
</div>
