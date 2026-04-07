<script lang="ts">
	export let data: PageData;
	let { invitations, family } = data;
</script>

<div class="h-min- relative top-16 w-full p-10">
	<div class="h-full rounded border-black p-5 shadow">
		<div class="mb-5 flex items-center justify-between">
			<h1 class="text-3xl font-bold">Family Invitations</h1>
			<a href="/family/{family?.id}" class="rounded bg-gray-500 px-4 py-2 font-bold text-white hover:bg-gray-700">
				Back to Family
			</a>
		</div>
		
		{#if family}
			<p class="mb-4 text-gray-600">Managing invitations for: {family.name}</p>
		{/if}

		{#if invitations.length > 0}
			<div class="space-y-4">
				{#each invitations as invite}
					<div class="rounded border p-4">
						<p class="font-mono text-lg">{invite.code}</p>
						<p class="text-sm text-gray-600">
							Used: {invite.useCount} / {invite.maxUses}
						</p>
						<p class="text-sm text-gray-600">
							Expires: {new Date(invite.expiresAt).toLocaleDateString()}
						</p>
						<button 
							class="mt-2 rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
							on:click={() => navigator.clipboard.writeText(window.location.origin + '/family/join/' + invite.code)}
						>
							Copy Invite Link
						</button>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-gray-600">No active invitations for this family.</p>
		{/if}

		<a
			class="mt-4 block rounded bg-green-500 px-4 py-2 font-bold text-white hover:bg-green-700"
			href="/family/invite"
		>
			Create New Invitation
		</a>
	</div>
</div>
