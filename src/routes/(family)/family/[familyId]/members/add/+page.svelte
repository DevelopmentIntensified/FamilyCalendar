<script lang="ts">
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';

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
	let inviteLink = '';
	let generatingLink = false;

	const searchUsers = async () => {
		if (searchQuery.length < 2) {
			searchResults = [];
			return;
		}
		searching = true;
		try {
			const res = await fetch(`/api/family/search?q=${encodeURIComponent(searchQuery)}&familyId=${data.familyId}`);
			const json = await res.json().catch(() => ({}));
			if (json.users) {
				searchResults = json.users;
			}
		} catch {
			error = 'Network problem. Please try again.';
		} finally {
			searching = false;
		}
	};

	const selectUser = (user: { id: string; firstName: string; lastName: string; email: string }) => {
		selectedUser = user;
		searchQuery = '';
		searchResults = [];
	};

	const addSelectedUser = async () => {
		if (!selectedUser) return;
		inviting = true;
		try {
			const res = await fetch('/family/' + data.familyId + '/members/add/direct', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: selectedUser.id })
			});
			const json = await res.json().catch(() => ({}));
			if (json.error) {
				error = json.error;
			} else {
				success = true;
			}
		} catch {
			error = 'Network problem. Please try again.';
		} finally {
			inviting = false;
		}
	};

	const sendInvite = async () => {
		inviting = true;
		try {
			const res = await fetch('/family/' + data.familyId + '/members/add/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: inviteEmail,
					firstName: inviteFirstName,
					lastName: inviteLastName
				})
			});
			const json = await res.json().catch(() => ({}));
			if (json.error) {
				error = json.error;
			} else {
				success = true;
			}
		} catch {
			error = 'Network problem. Please try again.';
		} finally {
			inviting = false;
		}
	};

	const generateInviteLink = async () => {
		generatingLink = true;
		error = '';
		inviteLink = '';
		try {
			const res = await fetch('/family/' + data.familyId + '/members/add/email/link', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: inviteEmail,
					firstName: inviteFirstName,
					lastName: inviteLastName
				})
			});
			const json = await res.json().catch(() => ({}));
			if (json.error) {
				error = json.error;
			} else if (json.link) {
				inviteLink = json.link;
			}
		} catch {
			error = 'Network problem. Please try again.';
		} finally {
			generatingLink = false;
		}
	};

	const copyLink = async () => {
		if (inviteLink) {
			await navigator.clipboard.writeText(inviteLink);
		}
	};
</script>

<svelte:head>
	<title>Add Member - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8 pt-20">
	<div class="mx-auto max-w-xl">
		<Breadcrumbs crumbs={[
			{ label: 'Calendar', href: '/calendar' },
			{ label: 'Family', href: '/family' },
			{ label: data.familyName || 'Family', href: `/family/${data.familyId}` },
			{ label: 'Add Member' }
		]} />

		{#if success}
			<div class="rounded-xl border border-green-200 bg-white p-8 text-center shadow-sm">
				<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
					<svg class="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
					</svg>
				</div>
				<h2 class="mb-2 text-xl font-bold text-slate-900">Member Added!</h2>
				<p class="mb-6 text-slate-500">The new member has been added to your family.</p>
				<a href="/family/{data.familyId}" class="inline-flex items-center gap-2 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700">
					Return to Family
				</a>
			</div>
		{:else}
			<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
				<div class="mb-6">
					<h1 class="text-2xl font-bold text-slate-900">Add Family Member</h1>
					<p class="mt-1 text-sm text-slate-500">Search for existing users or invite someone new</p>
				</div>

				<div class="mb-5 flex rounded-lg bg-slate-100 p-1">
					<button
						on:click={() => mode = 'search'}
						class="flex-1 rounded-md py-2.5 text-sm font-medium transition-colors {mode === 'search' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
					>
						Search Users
					</button>
					<button
						on:click={() => mode = 'invite'}
						class="flex-1 rounded-md py-2.5 text-sm font-medium transition-colors {mode === 'invite' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
					>
						Invite by Email
					</button>
				</div>

				{#if error}
					<div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{error}</div>
				{/if}

				{#if mode === 'search'}
					{#if selectedUser}
						<div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
							<div class="mb-3 flex items-center justify-between">
								<div class="flex items-center gap-3">
									<div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700 font-semibold">
										{selectedUser.firstName?.[0] || '?'}
									</div>
									<div>
										<p class="font-medium text-slate-900">{selectedUser.firstName} {selectedUser.lastName}</p>
										<p class="text-sm text-slate-500">{selectedUser.email}</p>
									</div>
								</div>
								<button
									on:click={() => selectedUser = null}
									class="text-sm text-slate-500 hover:text-slate-700"
								>
									Change
								</button>
							</div>
							<button
								on:click={addSelectedUser}
								disabled={inviting}
								class="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
							>
								{inviting ? 'Adding...' : 'Add to Family'}
							</button>
						</div>
					{:else}
						<div class="mb-4">
							<label for="search" class="mb-2 block text-sm font-medium text-slate-700">Search by name or email</label>
							<input
								type="text"
								id="search"
								placeholder="Type to search..."
								bind:value={searchQuery}
								on:input={searchUsers}
								class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
							/>
						</div>

						{#if searching}
							<div class="py-4 text-center text-sm text-slate-500">Searching...</div>
						{:else if searchResults.length > 0}
							<ul class="max-h-60 overflow-y-auto rounded-lg border border-slate-200">
								{#each searchResults as user}
									<li>
										<button
											on:click={() => selectUser(user)}
											class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
										>
											<div class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-sm font-medium">
												{user.firstName?.[0] || '?'}
											</div>
											<div>
												<p class="font-medium text-slate-900">{user.firstName} {user.lastName}</p>
												<p class="text-sm text-slate-500">{user.email}</p>
											</div>
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					{/if}
				{:else}
					<form on:submit|preventDefault={sendInvite} class="space-y-4">
						<div>
							<label for="firstName" class="mb-2 block text-sm font-medium text-slate-700">First Name</label>
							<input
								type="text"
								id="firstName"
								bind:value={inviteFirstName}
								required
								class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
							/>
						</div>
						<div>
							<label for="lastName" class="mb-2 block text-sm font-medium text-slate-700">Last Name</label>
							<input
								type="text"
								id="lastName"
								bind:value={inviteLastName}
								required
								class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
							/>
						</div>
						<div>
							<label for="email" class="mb-2 block text-sm font-medium text-slate-700">Email</label>
							<input
								type="email"
								id="email"
								bind:value={inviteEmail}
								required
								class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
							/>
						</div>
						<div class="flex gap-3">
							<button
								type="submit"
								disabled={inviting}
								class="flex-1 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
							>
								{inviting ? 'Sending Invite...' : 'Send Invite'}
							</button>
							<button
								type="button"
								on:click={generateInviteLink}
								disabled={generatingLink || !inviteEmail || !inviteFirstName || !inviteLastName}
								class="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
							>
								{generatingLink ? 'Generating...' : 'Get Invite Link'}
							</button>
						</div>
					</form>

					{#if inviteLink}
						<div class="mt-4 rounded-lg border border-primary-200 bg-primary-50 p-4">
							<p class="mb-2 text-sm font-medium text-primary-800">Share this link with {inviteFirstName}:</p>
							<div class="flex gap-2">
								<input
									type="text"
									readonly
									value={inviteLink}
									class="flex-1 rounded-lg border border-primary-300 bg-white px-3 py-2 text-xs text-slate-700"
								/>
								<button
									on:click={copyLink}
									class="rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700"
								>
									Copy
								</button>
							</div>
							<p class="mt-2 text-xs text-primary-600">Expires in 24 hours</p>
						</div>
					{/if}
				{/if}

				<div class="mt-6 border-t border-slate-200 pt-6">
					<a href="/family/{data.familyId}" class="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-primary-600">
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
						</svg>
						Back to Family
					</a>
				</div>
			</div>
		{/if}
	</div>
</div>
