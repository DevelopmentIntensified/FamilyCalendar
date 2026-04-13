<script lang="ts">
	import type { PageData } from './$types';
	export let data: PageData;
	const { family, members } = data;
</script>

<svelte:head>
	<title>{family?.name || 'Family'} - Family Planz</title>
</svelte:head>

<div class="h-min- relative top-16 w-full p-10">
	<div class="h-full rounded border-black p-5 shadow">
		<div class="mb-5 flex items-center justify-between">
			<h1 class="text-3xl font-bold">{family?.name}</h1>
			<a href="/family" class="rounded bg-gray-500 px-4 py-2 font-bold text-white hover:bg-gray-700">
				Back to Families
			</a>
		</div>

		{#if family?.color}
			<div class="mb-4 flex items-center gap-2">
				<span class="text-gray-600">Color:</span>
				<div class="h-6 w-6 rounded" style="background-color: {family.color}"></div>
			</div>
		{/if}

		<div class="border-t pt-4">
			<h2 class="mb-3 text-xl font-semibold">Family Members ({members.length})</h2>
			{#if members.length > 0}
				<ul class="space-y-2">
					{#each members as member}
						<li class="flex items-center justify-between rounded border p-3">
							<div>
								<p class="font-medium">{member.firstName} {member.lastName}</p>
								<p class="text-sm text-gray-600">{member.email}</p>
							</div>
							<span class="rounded bg-gray-200 px-2 py-1 text-xs font-medium uppercase">{member.role}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-gray-600">No members found.</p>
			{/if}
		</div>

		<div class="mt-4 flex gap-2">
			<a
				href="/family/invitations"
				class="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
			>
				Manage Invitations
			</a>
			<a
				href="/family/{family?.id}/members/add"
				class="rounded bg-green-500 px-4 py-2 font-bold text-white hover:bg-green-700"
			>
				Add Member
			</a>
		</div>
	</div>
</div>