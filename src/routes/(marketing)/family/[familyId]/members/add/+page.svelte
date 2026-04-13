<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let mode: 'search' | 'invite' = 'search';
	let searchQuery = '';
	let searchResults: { id: string; firstName: string; lastName: string; email: string }[] = [];
	let selectedUser: { id: string; firstName: string; lastName: string; email: string } | null = null;
	let inviteEmail = '',
		inviteFirstName = '',
		inviteLastName = '';
	let error = '';
	let success = false;
	let searching = false;
	let inviting = false;

	const searchUsers = async () => {
		if (searchQuery.length < 2) {
			searchResults = [];
			return;
		}
		searching = true;
		const res = await fetch(`/api/family/search?q=${encodeURIComponent(searchQuery)}&familyId=${data.familyId}`);
		const json = await res.json();
		if (json.users) {
			searchResults = json.users;
		}
		searching = false;
	};

	const selectUser = (user: { id: string; firstName: string; lastName: string; email: string }) => {
		selectedUser = user;
		searchQuery = '';
		searchResults = [];
	};

	const addSelectedUser = async () => {
		if (!selectedUser) return;
		inviting = true;
		const res = await fetch('/family/' + data.familyId + '/members/add/direct', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId: selectedUser.id })
		});
		const json = await res.json();
		if (json.error) {
			error = json.error;
		} else {
			success = true;
		}
		inviting = false;
	};

	const sendInvite = async () => {
		inviting = true;
		const res = await fetch('/family/' + data.familyId + '/members/add/email', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: inviteEmail,
				firstName: inviteFirstName,
				lastName: inviteLastName
			})
		});
		const json = await res.json();
		if (json.error) {
			error = json.error;
		} else {
			success = true;
		}
		inviting = false;
	};
</script>

<svelte:head>
	<title>Add Member - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 px-4 pt-20">
	<div class="mx-auto max-w-md">
		<a href="/family/{data.familyId}" class="mb-4 inline-flex items-center text-primary-600 hover:text-primary-700">
			<svg xmlns="http://www.w3.org/2000/svg" class="mr-1 h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="15 18 9 12 15 6"></polyline>
			</svg>
			Back to Family
		</a>

		{#if success}
			<div class="rounded-lg bg-green-50 p-6 text-center">
				<svg xmlns="http://www.w3.org/2000/svg" class="mx-auto mb-3 h-12 w-12 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
					<polyline points="22 4 12 14.01 9 11.01"></polyline>
				</svg>
				<h2 class="mb-2 text-xl font-bold text-gray-900">Member Added!</h2>
				<p class="mb-4 text-gray-600">The new member has been added to your family.</p>
				<a href="/family/{data.familyId}" class="inline-block rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
					Return to Family
				</a>
			</div>
		{:else}
			<div class="rounded-lg bg-white p-6 shadow-sm">
				<h1 class="mb-5 text-2xl font-bold text-gray-900">Add Family Member</h1>

				<div class="mb-5 flex rounded-lg bg-gray-100 p-1">
					<button
						on:click={() => mode = 'search'}
						class="flex-1 rounded-md py-2 text-sm font-medium transition-colors {mode === 'search' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}"
					>
						Search Users
					</button>
					<button
						on:click={() => mode = 'invite'}
						class="flex-1 rounded-md py-2 text-sm font-medium transition-colors {mode === 'invite' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}"
					>
						Invite by Email
					</button>
				</div>

				{#if error}
					<div class="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
				{/if}

				{#if mode === 'search'}
					{#if selectedUser}
						<div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
							<div class="mb-3 flex items-center justify-between">
								<div>
									<p class="font-medium">{selectedUser.firstName} {selectedUser.lastName}</p>
									<p class="text-sm text-gray-600">{selectedUser.email}</p>
								</div>
								<button
									on:click={() => selectedUser = null}
									class="text-sm text-gray-500 hover:text-gray-700"
								>
									Change
								</button>
							</div>
							<button
								on:click={addSelectedUser}
								disabled={inviting}
								class="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
							>
								{inviting ? 'Adding...' : 'Add to Family'}
							</button>
						</div>
					{:else}
						<div class="mb-3">
							<label for="search" class="mb-1 block text-sm font-medium text-gray-700">Search by name or email</label>
							<input
								type="text"
								id="search"
								placeholder="Type to search..."
								bind:value={searchQuery}
								on:input={searchUsers}
								class="w-full rounded-md border border-gray-300 px-3 py-2"
							/>
						</div>

						{#if searching}
							<div class="py-2 text-center text-sm text-gray-500">Searching...</div>
						{:else if searchResults.length > 0}
							<ul class="max-h-60 overflow-y-auto rounded-md border border-gray-200">
								{#each searchResults as user}
									<li>
										<button
											on:click={() => selectUser(user)}
											class="w-full px-3 py-2 text-left hover:bg-gray-50"
										>
											<p class="font-medium">{user.firstName} {user.lastName}</p>
											<p class="text-sm text-gray-600">{user.email}</p>
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}
				{:else}
					<form on:submit|preventDefault={sendInvite}>
						<div class="mb-3">
							<label for="firstName" class="mb-1 block text-sm font-medium text-gray-700">First Name</label>
							<input
								type="text"
								id="firstName"
								bind:value={inviteFirstName}
								required
								class="w-full rounded-md border border-gray-300 px-3 py-2"
							/>
						</div>
						<div class="mb-3">
							<label for="lastName" class="mb-1 block text-sm font-medium text-gray-700">Last Name</label>
							<input
								type="text"
								id="lastName"
								bind:value={inviteLastName}
								required
								class="w-full rounded-md border border-gray-300 px-3 py-2"
							/>
						</div>
						<div class="mb-4">
							<label for="email" class="mb-1 block text-sm font-medium text-gray-700">Email</label>
							<input
								type="email"
								id="email"
								bind:value={inviteEmail}
								required
								class="w-full rounded-md border border-gray-300 px-3 py-2"
							/>
						</div>
						<button
							type="submit"
							disabled={inviting}
							class="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
						>
							{inviting ? 'Sending Invite...' : 'Send Invite'}
						</button>
					</form>
				{/if}
			</div>
		{/if}
	</div>
</div>