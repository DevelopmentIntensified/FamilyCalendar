<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	export let data: PageData;
	export let form: ActionData;
	const { family, members } = data;
	
	let showSettings = false;
	let showRemoveConfirm: string | null = null;
	let editingName = family?.name || '';
	let editingColor = family?.color || '#3b82f6';
</script>

<svelte:head>
	<title>{family?.name || 'Family'} - Family Planz</title>
</svelte:head>

<div class="h-min- relative top-16 w-full p-10">
	<div class="mx-auto max-w-4xl h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
		<div class="mb-6 flex items-center justify-between">
			<h1 class="text-3xl font-bold text-slate-900">{family?.name}</h1>
			<div class="flex gap-3">
				<button 
					on:click={() => showSettings = !showSettings}
					class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
				>
					Settings
				</button>
				<a href="/family" class="rounded-lg bg-slate-500 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600">
					Back
				</a>
			</div>
		</div>

		{#if showSettings}
			<div class="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
				<h3 class="mb-4 text-lg font-semibold text-slate-900">Family Settings</h3>
				<form method="POST" action="?/updateFamily" use:enhance>
					<div class="mb-4">
						<label for="name" class="mb-2 block text-sm font-medium text-slate-700">Family Name</label>
						<input
							type="text"
							id="name"
							name="name"
							bind:value={editingName}
							class="w-full rounded-lg border border-slate-300 px-4 py-2.5"
						/>
					</div>
					<div class="mb-4">
						<label for="color" class="mb-2 block text-sm font-medium text-slate-700">Color</label>
						<input
							type="color"
							id="color"
							name="color"
							bind:value={editingColor}
							class="h-12 w-28 rounded-lg border border-slate-300"
						/>
					</div>
					<button
						type="submit"
						class="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
					>
						Save Changes
					</button>
				</form>
			</div>
		{/if}

		{#if family?.color}
			<div class="mb-5 flex items-center gap-3">
				<span class="text-slate-600">Color:</span>
				<div class="h-6 w-6 rounded-full" style="background-color: {family.color}"></div>
			</div>
		{/if}

		<div class="border-t border-slate-200 pt-5">
			<h2 class="mb-4 text-xl font-semibold text-slate-900">Family Members ({members.length})</h2>
			{#if members.length > 0}
				<ul class="space-y-3">
					{#each members as member}
						<li class="flex items-center justify-between rounded-xl border border-slate-200 p-4">
							<div>
								<p class="font-medium text-slate-900">{member.firstName} {member.lastName}</p>
								<p class="text-sm text-slate-500">{member.email}</p>
							</div>
							<div class="flex items-center gap-2">
								<span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase text-slate-700">
									{member.role || 'member'}
								</span>
								{#if showRemoveConfirm === member.userId}
									<div class="flex items-center gap-1">
										<span class="text-sm text-red-600">Remove?</span>
										<form method="POST" action="?/removeMember" use:enhance>
											<input type="hidden" name="userId" value={member.userId} />
											<button
												type="submit"
												class="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
											>
												Yes
											</button>
										</form>
										<button
											on:click={() => showRemoveConfirm = null}
											class="rounded-md bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-300"
										>
											No
										</button>
									</div>
								{:else}
									<button
										on:click={() => showRemoveConfirm = member.userId}
										class="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
									>
										Remove
									</button>
								{/if}
							</div>
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
				class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
			>
				Manage Invitations
			</a>
			<a
				href="/family/{family?.id}/members/add"
				class="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
			>
				Add Member
			</a>
		</div>
	</div>
</div>