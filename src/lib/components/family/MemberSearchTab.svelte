<script lang="ts">
	interface FoundUser {
		id: string;
		firstName: string;
		lastName: string;
		email: string;
	}

	interface Props {
		familyId: string;
		onSuccess: () => void;
		onError: (message: string) => void;
	}

	let { familyId, onSuccess, onError }: Props = $props();

	let searchQuery = $state('');
	let searchResults = $state<FoundUser[]>([]);
	let selectedUser = $state<FoundUser | null>(null);
	let searching = $state(false);
	let inviting = $state(false);
	let searchedFor = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let searchRequestId = 0;

	async function searchUsers() {
		const requestId = ++searchRequestId;
		const query = searchQuery;
		if (query.length < 2) {
			searchResults = [];
			searchedFor = '';
			return;
		}
		searching = true;
		try {
			const res = await fetch(
				`/api/family/search?q=${encodeURIComponent(query)}&familyId=${familyId}`
			);
			const json = await res.json().catch(() => ({}));
			if (requestId !== searchRequestId) return;
			if (json.users) {
				searchResults = json.users;
				searchedFor = query;
			}
		} catch {
			if (requestId !== searchRequestId) return;
			onError('Network problem. Please try again.');
		} finally {
			if (requestId === searchRequestId) {
				searching = false;
			}
		}
	}

	function handleSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(searchUsers, 300);
	}

	function selectUser(user: FoundUser) {
		clearTimeout(searchTimer);
		selectedUser = user;
		searchQuery = '';
		searchResults = [];
		searchedFor = '';
	}

	async function addSelectedUser() {
		if (!selectedUser) return;
		inviting = true;
		try {
			const res = await fetch('/family/' + familyId + '/members/add/direct', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId: selectedUser.id })
			});
			const json = await res.json().catch(() => ({}));
			if (json.error) {
				onError(json.error);
			} else {
				onSuccess();
			}
		} catch {
			onError('Network problem. Please try again.');
		} finally {
			inviting = false;
		}
	}
</script>

{#if selectedUser}
	<div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
		<div class="mb-3 flex items-center justify-between">
			<div class="flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-700"
				>
					{selectedUser.firstName?.[0] || '?'}
				</div>
				<div>
					<p class="font-medium text-slate-900">
						{selectedUser.firstName}
						{selectedUser.lastName}
					</p>
					<p class="text-sm text-slate-500">{selectedUser.email}</p>
				</div>
			</div>
			<button
				onclick={() => (selectedUser = null)}
				class="text-sm text-slate-500 hover:text-slate-700"
			>
				Change
			</button>
		</div>
		<button
			onclick={addSelectedUser}
			disabled={inviting}
			class="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
		>
			{inviting ? 'Adding...' : 'Add to Family'}
		</button>
	</div>
{:else}
	<div class="mb-4">
		<label for="search" class="mb-2 block text-sm font-medium text-slate-700"
			>Search by name or email</label
		>
		<input
			type="text"
			id="search"
			placeholder="Type to search..."
			bind:value={searchQuery}
			oninput={handleSearchInput}
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
						onclick={() => selectUser(user)}
						class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
					>
						<div
							class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-sm font-medium text-slate-600"
						>
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
	{:else if searchedFor && searchQuery === searchedFor}
		<div class="py-4 text-center text-sm text-slate-400">
			No users found for '{searchedFor}'
		</div>
	{/if}
{/if}
