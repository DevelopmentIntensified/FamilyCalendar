<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData, ActionData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	export let data: PageData;
	export let form: ActionData;
	const { family, members, currentUserRole } = data;
	
	let showSettings = false;
	let showRemoveConfirm: string | null = null;
	let editingName = family?.name || '';
	let editingColor = family?.color || '#3b82f6';
</script>

<svelte:head>
	<title>{family?.name || 'Family'} - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8 pt-20">
	<div class="mx-auto max-w-4xl">
		<Breadcrumbs crumbs={[
			{ label: 'Calendar', href: '/calendar' },
			{ label: 'Family', href: '/family' },
			{ label: family?.name || 'Family' }
		]} />

		<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
				<div class="flex items-center gap-4">
					{#if family?.color}
						<div class="h-12 w-12 rounded-full" style="background-color: {family.color}"></div>
					{/if}
					<div>
						<h1 class="text-2xl font-bold text-slate-900">{family?.name}</h1>
						<p class="text-sm text-slate-500">{members.length} member{members.length !== 1 ? 's' : ''}</p>
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					<button 
						on:click={() => showSettings = !showSettings}
						class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
					>
						Settings
					</button>
					<a href="/family" class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200">
						Back to Families
					</a>
				</div>
			</div>

			{#if showSettings}
				<div class="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
					<h3 class="mb-4 text-lg font-semibold text-slate-900">Family Settings</h3>
					<form method="POST" action="?/updateFamily" use:enhance={() => {
						return async ({ result, update }) => {
							await update();
							showSettings = false;
						};
					}}>
						<div class="mb-4 grid gap-4 sm:grid-cols-2">
							<div>
								<label for="name" class="mb-2 block text-sm font-medium text-slate-700">Family Name</label>
								<input
									type="text"
									id="name"
									name="name"
									bind:value={editingName}
									class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
								/>
							</div>
							<div>
								<label for="color" class="mb-2 block text-sm font-medium text-slate-700">Color</label>
								<input
									type="color"
									id="color"
									name="color"
									bind:value={editingColor}
									class="h-12 w-full rounded-lg border border-slate-300"
								/>
							</div>
						</div>
						<div class="flex gap-2">
							<button
								type="submit"
								class="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
							>
								Save Changes
							</button>
							<button
								type="button"
								on:click={() => showSettings = false}
								class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
							>
								Cancel
							</button>
						</div>
					</form>
				</div>
			{/if}

			<div class="mb-6 border-t border-slate-200 pt-6">
				<div class="mb-4 flex items-center justify-between">
					<h2 class="text-lg font-semibold text-slate-900">Family Members</h2>
					<a
						href="/family/{family?.id}/members/add"
						class="rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
					>
						Add Member
					</a>
				</div>

				{#if members.length > 0}
					<ul class="space-y-3">
						{#each members as member}
							<li class="flex items-center justify-between rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50">
								<div class="flex items-center gap-3">
									<div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700 font-semibold">
										{member.firstName?.[0] || member.email?.[0] || '?'}
									</div>
									<div>
										<p class="font-medium text-slate-900">{member.firstName} {member.lastName}</p>
										<p class="text-sm text-slate-500">{member.email}</p>
									</div>
								</div>
								<div class="flex items-center gap-3">
									<span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase text-slate-700">
										{member.role || 'member'}
									</span>
									{#if showRemoveConfirm === member.userId}
										<div class="flex items-center gap-2">
											<span class="text-sm text-red-600">Remove?</span>
											<form method="POST" action="?/removeMember" use:enhance={() => {
												return async ({ result, update }) => {
													await update();
													await invalidateAll();
													showRemoveConfirm = null;
												};
											}}>
												<input type="hidden" name="userId" value={member.userId} />
												<button
													type="submit"
													class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
												>
													Yes
												</button>
											</form>
											<button
												on:click={() => showRemoveConfirm = null}
												class="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-300"
											>
												No
											</button>
										</div>
									{:else if currentUserRole === 'admin' && member.role !== 'admin'}
										<button
											on:click={() => showRemoveConfirm = member.userId}
											class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
										>
											Remove
										</button>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="py-8 text-center">
						<p class="text-slate-500">No members found.</p>
					</div>
				{/if}
			</div>

			<div class="flex flex-wrap gap-3 border-t border-slate-200 pt-6">
				<a
					href="/family/invitations"
					class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
					</svg>
					Manage Invitations
				</a>
				<a
					href="/calendar"
					class="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-primary-600"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
					</svg>
					Back to Calendar
				</a>
			</div>
		</div>
	</div>
</div>
