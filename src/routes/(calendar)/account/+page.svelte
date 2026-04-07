<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	$: user = data.user;
	$: success = form?.success;
	$: message = form?.message;

	let profileLoading = false;
	let emailLoading = false;
	let logoutAllLoading = false;
	let deleteLoading = false;
	let showDeleteConfirmation = false;
</script>

<div class="mx-auto max-w-2xl p-6">
	<h1 class="mb-6 text-2xl font-bold">Account Settings</h1>

	{#if success && message}
		<div class="mb-4 rounded-md bg-green-100 p-4 text-green-800">
			{message}
		</div>
	{:else if form && !form.success}
		<div class="mb-4 rounded-md bg-red-100 p-4 text-red-800">
			{form.message}
		</div>
	{/if}

	<section class="mb-8 rounded-lg bg-white p-6 shadow">
		<h2 class="mb-4 text-xl font-semibold">Profile Information</h2>
		<form
			method="POST"
			action="?/updateProfile"
			use:enhance={() => {
				profileLoading = true;
				return async ({ update }) => {
					profileLoading = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<label for="firstName" class="block font-medium">First Name</label>
					<input
						type="text"
						id="firstName"
						name="firstName"
						value={user.firstName}
						class="w-full rounded-md border p-2"
						required
					/>
				</div>
				<div class="space-y-2">
					<label for="lastName" class="block font-medium">Last Name</label>
					<input
						type="text"
						id="lastName"
						name="lastName"
						value={user.lastName}
						class="w-full rounded-md border p-2"
						required
					/>
				</div>
			</div>
			<button
				type="submit"
				disabled={profileLoading}
				class="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
			>
				{profileLoading ? 'Saving...' : 'Update Profile'}
			</button>
		</form>
	</section>

	<section class="mb-8 rounded-lg bg-white p-6 shadow">
		<h2 class="mb-4 text-xl font-semibold">Email Address</h2>
		<form
			method="POST"
			action="?/updateEmail"
			use:enhance={() => {
				emailLoading = true;
				return async ({ update }) => {
					emailLoading = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<label for="email" class="block font-medium">Email</label>
				<input
					type="email"
					id="email"
					name="email"
					value={user.email}
					class="w-full rounded-md border p-2"
					required
				/>
			</div>
			<div class="flex items-center space-x-2">
				<span class="text-sm">
					Status: {user.emailVerified ? 'Verified' : 'Not Verified'}
				</span>
			</div>
			<button
				type="submit"
				disabled={emailLoading}
				class="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
			>
				{emailLoading ? 'Updating...' : 'Update Email'}
			</button>
		</form>
	</section>

	<section class="mb-8 rounded-lg bg-white p-6 shadow">
		<h2 class="mb-4 text-xl font-semibold">Security</h2>
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
			<p class="text-sm text-gray-600">
				Log out from all devices except the current one. This will invalidate all other sessions.
			</p>
			<button
				type="submit"
				disabled={logoutAllLoading}
				class="rounded-md bg-yellow-600 px-4 py-2 text-white transition-colors hover:bg-yellow-700 disabled:opacity-50"
			>
				{logoutAllLoading ? 'Logging out...' : 'Logout from All Other Devices'}
			</button>
		</form>
	</section>

	<section class="rounded-lg bg-white p-6 shadow">
		<h2 class="mb-4 text-xl font-semibold text-red-600">Danger Zone</h2>
		<p class="mb-4 text-sm text-gray-600">
			Permanently delete your account and all associated data. This action cannot be undone.
		</p>

		{#if !showDeleteConfirmation}
			<button
				type="button"
				on:click={() => (showDeleteConfirmation = true)}
				class="rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
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
				class="space-y-4"
			>
				<p class="text-sm text-red-600">
					This will permanently delete your account. To confirm, type your user ID: <code class="rounded bg-gray-100 px-1">{user.id}</code>
				</p>
				<div class="space-y-2">
					<label for="confirmation" class="block font-medium">Confirmation</label>
					<input
						type="text"
						id="confirmation"
						name="confirmation"
						placeholder="Enter your user ID to confirm"
						class="w-full rounded-md border p-2"
						required
					/>
				</div>
				<div class="flex space-x-4">
					<button
						type="submit"
						disabled={deleteLoading}
						class="rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
					>
						{deleteLoading ? 'Deleting...' : 'Confirm Deletion'}
					</button>
					<button
						type="button"
						on:click={() => (showDeleteConfirmation = false)}
						class="rounded-md bg-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-400"
					>
						Cancel
					</button>
				</div>
			</form>
		{/if}
	</section>
</div>
