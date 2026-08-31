<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData, ActionData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { avatarColor } from '$lib/utils/avatarColor';
	import { FAMILY_DASHBOARD_MODULES } from '$lib/dashboardModules';
	import { DateTime } from 'luxon';
	export let data: PageData;
	export let form: ActionData;
	const { family, members, currentUserRole, currentUserId, activity = [], moduleSwitches = {} } = data;

	function relativeTime(iso: string): string {
		return DateTime.fromISO(iso).toRelative() ?? '';
	}

	let showSettings = false;
	let showRemoveConfirm: string | null = null;
	let editingRole: string | null = null;
	let editingName = family?.name || '';
	let editingColor = family?.color || '#3b82f6';

	const isAdmin = currentUserRole === 'creator' || currentUserRole === 'admin';
</script>

<svelte:head>
	<title>{family?.name || 'Family'} - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8">
	<div class="mx-auto max-w-4xl">
		<Breadcrumbs
			crumbs={[
				{ label: 'Calendar', href: '/calendar' },
				{ label: 'Family', href: '/family' },
				{ label: family?.name || 'Family' }
			]}
		/>

		<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
				<div class="flex items-center gap-4">
					{#if family?.color}
						<div class="h-12 w-12 rounded-full" style="background-color: {family.color}"></div>
					{/if}
					<div>
						<h1 class="text-2xl font-bold text-slate-900">{family?.name}</h1>
						<p class="text-sm text-slate-500">
							{members.length} member{members.length !== 1 ? 's' : ''}
						</p>
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					<a
						href="/family/{family?.id}/tasks"
						class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
					>
						Family Tasks
					</a>
					<button
						on:click={() => (showSettings = !showSettings)}
						class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
					>
						Settings
					</button>
					<a
						href="/family"
						class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
					>
						Back to Families
					</a>
				</div>
			</div>

			{#if showSettings}
				<div class="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
					<h3 class="mb-4 text-lg font-semibold text-slate-900">Family Settings</h3>
					{#if isAdmin}
					<form
						method="POST"
						action="?/updateFamily"
						use:enhance={() => {
							return async ({ result, update }) => {
								await update();
								showSettings = false;
							};
						}}
					>
						<div class="mb-4 grid gap-4 sm:grid-cols-2">
							<div>
								<label for="name" class="mb-2 block text-sm font-medium text-slate-700"
									>Family Name</label
								>
								<input
									type="text"
									id="name"
									name="name"
									bind:value={editingName}
									class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
								/>
							</div>
							<div>
								<label for="color" class="mb-2 block text-sm font-medium text-slate-700"
									>Color</label
								>
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
								on:click={() => (showSettings = false)}
								class="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
							>
								Cancel
							</button>
						</div>
					</form>
					{/if}

					{#if isAdmin}
						<div class="mt-6 border-t border-slate-200 pt-5">
							<h4 class="text-sm font-semibold text-slate-800">Day Dashboard Modules</h4>
							<p class="mt-1 text-xs text-slate-500">
								Family-wide master switches. Switched-off cards are hidden for everyone —
								individual members can re-enable them from Account settings.
							</p>
							<div class="mt-3 grid gap-2 sm:grid-cols-2">
								{#each FAMILY_DASHBOARD_MODULES as mod (mod.id)}
									<form
										method="POST"
										action="?/toggleDashboardModule"
										use:enhance
										class="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
									>
										<span class="text-sm font-medium text-slate-800">{mod.label}</span>
										<input type="hidden" name="module" value={mod.id} />
										<button
											type="submit"
											name="enabled"
											value={moduleSwitches[mod.id] ? 'false' : 'true'}
											class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors {moduleSwitches[mod.id]
												? 'bg-green-100 text-green-700 hover:bg-green-200'
												: 'bg-slate-200 text-slate-600 hover:bg-slate-300'}"
										>
											{moduleSwitches[mod.id] ? 'On' : 'Off'}
										</button>
									</form>
								{/each}
							</div>
						</div>
					{/if}
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
							<li
								class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50"
							>
								<div class="flex min-w-0 flex-1 items-center gap-3">
									<div
										class="flex h-10 w-10 items-center justify-center rounded-full font-semibold {avatarColor(
											member.userId
										)}"
									>
										{member.firstName?.[0] || member.email?.[0] || '?'}
									</div>
									<div class="min-w-0">
										<p class="truncate font-medium text-slate-900">{([member.firstName, member.lastName].filter(Boolean).join(' ') || member.email || 'Family member')}</p>
										<p class="truncate text-sm text-slate-500">{member.email}</p>
									</div>
								</div>
								<div class="flex flex-wrap items-center gap-2">
									{#if isAdmin}
										<form
											method="POST"
											action="?/setMemberType"
											use:enhance={() => {
												return async ({ result, update }) => {
													await update();
													await invalidateAll();
												};
											}}
											title="Member type (profile label — parent, child, or member)"
										>
											<input type="hidden" name="userId" value={member.userId} />
											<select
												name="memberType"
												value={member.memberType ?? 'member'}
												on:change={(e) => e.currentTarget.form?.requestSubmit()}
												aria-label="Member type for {member.firstName}"
												class="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600"
											>
												<option value="parent">Parent</option>
												<option value="child">Child</option>
												<option value="member">Member</option>
											</select>
										</form>
									{/if}
									{#if editingRole === member.userId}
										<form
											method="POST"
											action="?/updateRole"
											use:enhance={() => {
												return async ({ result, update }) => {
													await update();
													await invalidateAll();
													editingRole = null;
												};
											}}
										>
											<input type="hidden" name="userId" value={member.userId} />
											<select
												name="role"
												class="rounded-lg border border-slate-300 px-2 py-1 text-xs"
											>
												<option value="member" selected={member.role === 'member'}>member</option>
												<option value="admin" selected={member.role === 'admin'}>admin</option>
												{#if currentUserRole === 'creator'}<option
														value="creator"
														selected={member.role === 'creator'}>creator</option
													>{/if}
											</select>
											<button
												type="submit"
												class="ml-1 rounded bg-primary-600 px-2 py-1 text-xs font-medium text-white hover:bg-primary-700"
												>Save</button
											>
											<button
												type="button"
												on:click={() => (editingRole = null)}
												class="ml-1 rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
												>Cancel</button
											>
										</form>
									{:else}
										<span
											class="rounded-full px-3 py-1 text-xs font-medium uppercase {member.role ===
											'creator'
												? 'bg-amber-100 text-amber-700'
												: member.role === 'admin'
													? 'bg-emerald-100 text-emerald-700'
													: 'bg-blue-100 text-blue-700'}"
										>
											{member.role || 'member'}
										</span>
									{/if}
									{#if (currentUserRole === 'creator' || currentUserRole === 'admin') && member.userId !== currentUserId && (currentUserRole === 'creator' || member.role === 'member')}
										<button
											on:click={() => (editingRole = member.userId)}
											class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
										>
											Edit
										</button>
									{/if}
									{#if showRemoveConfirm === member.userId}
										<div class="flex items-center gap-2">
											<span class="text-sm text-red-600">Remove?</span>
											<form
												method="POST"
												action="?/removeMember"
												use:enhance={() => {
													return async ({ result, update }) => {
														await update();
														await invalidateAll();
														showRemoveConfirm = null;
													};
												}}
											>
												<input type="hidden" name="userId" value={member.userId} />
												<button
													type="submit"
													class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
												>
													Yes
												</button>
											</form>
											<button
												on:click={() => (showRemoveConfirm = null)}
												class="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-300"
											>
												No
											</button>
										</div>
									{:else if (currentUserRole === 'creator' || currentUserRole === 'admin') && member.userId !== currentUserId && member.role !== 'creator' && (currentUserRole === 'creator' || member.role === 'member')}
										<button
											on:click={() => (showRemoveConfirm = member.userId)}
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

			<div class="mb-6 border-t border-slate-200 pt-6">
				<h2 class="mb-4 text-lg font-semibold text-slate-900">Recent Activity</h2>
				{#if activity.length > 0}
					<ul class="space-y-2">
						{#each activity as item}
							<li
								class="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 transition-colors hover:bg-slate-50"
							>
								<span class="min-w-0 flex-1 truncate text-sm text-slate-700">
									{item.kind === 'completed' ? '✅' : '📋'}
									{item.actorName}
									{item.kind === 'completed' ? 'completed' : 'assigned'}
									'{item.title}'{item.kind === 'assigned' && item.targetName
										? ` to ${item.targetName}`
										: ''}
								</span>
								<span class="shrink-0 text-xs text-slate-400">{relativeTime(item.at)}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="py-8 text-center">
						<p class="text-slate-500">No activity yet — complete something to get things moving.</p>
					</div>
				{/if}
			</div>

			<div class="flex flex-wrap gap-3 border-t border-slate-200 pt-6">
				<a
					href="/family/invitations"
					class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						/>
					</svg>
					Manage Invitations
				</a>
				<a
					href="/calendar"
					class="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-primary-600"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
						/>
					</svg>
					Back to Calendar
				</a>
			</div>
		</div>
	</div>
</div>
