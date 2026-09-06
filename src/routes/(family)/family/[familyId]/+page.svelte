<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { ActionData, PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import { trapFocusAction } from '$lib/utils/focusTrap';
	import { avatarColor } from '$lib/utils/avatarColor';
	import { FAMILY_DASHBOARD_MODULES } from '$lib/dashboardModules';
	import { pushToast } from '$lib/client/toasts';
	import { DateTime } from 'luxon';
	export let data: PageData;
	export let form: ActionData;
	const {
		family,
		members,
		currentUserRole,
		currentUserId,
		activity = [],
		moduleSwitches = {}
	} = data;

	type Member = (typeof members)[number];

	function relativeTime(iso: string): string {
		return DateTime.fromISO(iso).toRelative() ?? '';
	}

	let showRemoveConfirm: string | null = null;
	let editingRole: string | null = null;
	/** The member whose mobile action sheet is open. */
	let sheetMember: Member | null = null;
	let editingName = family?.name || '';
	let editingColor = family?.color || '#3b82f6';
	let savingFamily = false;
	/** userId of the member whose member-type select is submitting. */
	let memberTypeBusy: string | null = null;
	/** userId of the member whose role form is submitting. */
	let roleBusy: string | null = null;
	/** userId of the member whose remove form is submitting. */
	let removeBusy: string | null = null;

	const isAdmin = currentUserRole === 'creator' || currentUserRole === 'admin';

	function toastResult(result: { type: string }, okMessage: string, failMessage: string) {
		if (result.type === 'success') {
			pushToast({ message: okMessage });
		} else if (result.type === 'failure') {
			pushToast({ message: failMessage });
		}
	}

	// Gate helpers — identical conditions to the pre-redesign inline expressions.
	function canEditRole(member: Member): boolean {
		return (
			isAdmin &&
			member.userId !== currentUserId &&
			(currentUserRole === 'creator' || member.role === 'member')
		);
	}
	function canRemove(member: Member): boolean {
		return (
			isAdmin &&
			member.userId !== currentUserId &&
			member.role !== 'creator' &&
			(currentUserRole === 'creator' || member.role === 'member')
		);
	}

	function rolePillClass(role: string): string {
		return (
			'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ' +
			(role === 'creator'
				? 'bg-amber-100 text-amber-700'
				: role === 'admin'
					? 'bg-emerald-100 text-emerald-700'
					: 'bg-blue-100 text-blue-700')
		);
	}

	function memberDisplayName(member: Member): string {
		return (
			[member.firstName, member.lastName].filter(Boolean).join(' ') ||
			member.email ||
			'Family member'
		);
	}

	// Shared enhance callbacks — same semantics as the pre-redesign inline handlers.
	function saveFamilySubmit() {
		savingFamily = true;
		return async ({
			result,
			update
		}: {
			result: { type: string };
			update: () => Promise<void>;
		}) => {
			savingFamily = false;
			toastResult(result, 'Family settings saved.', "Couldn't save family settings — try again.");
			await update();
		};
	}
	function memberTypeSubmit() {
		return async ({
			result,
			update
		}: {
			result: { type: string };
			update: () => Promise<void>;
		}) => {
			toastResult(result, 'Member type updated.', "Couldn't update member type — try again.");
			await update();
			await invalidateAll();
			memberTypeBusy = null;
		};
	}
	function roleSubmit(member: Member) {
		roleBusy = member.userId;
		return async ({
			result,
			update
		}: {
			result: { type: string };
			update: () => Promise<void>;
		}) => {
			toastResult(result, 'Role updated.', "Couldn't update role — try again.");
			await update();
			await invalidateAll();
			editingRole = null;
			roleBusy = null;
			sheetMember = null;
		};
	}
	function removeSubmit(member: Member) {
		removeBusy = member.userId;
		return async ({
			result,
			update
		}: {
			result: { type: string };
			update: () => Promise<void>;
		}) => {
			toastResult(result, 'Member removed from the family.', "Couldn't remove member — try again.");
			await update();
			await invalidateAll();
			showRemoveConfirm = null;
			removeBusy = null;
			sheetMember = null;
		};
	}
	function startMemberTypeChange(
		e: Event & { currentTarget: EventTarget & HTMLSelectElement },
		member: Member
	) {
		memberTypeBusy = member.userId;
		e.currentTarget.form?.requestSubmit();
	}
	function scrollToSettings() {
		document
			.getElementById('family-settings')
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	function closeSheet() {
		sheetMember = null;
		showRemoveConfirm = null;
	}
</script>

<svelte:head>
	<title>{family?.name || 'Family'} - Family Planz</title>
</svelte:head>

<svelte:window
	on:keydown={(e) => {
		if (e.key === 'Escape' && sheetMember) closeSheet();
	}}
/>

<div class="min-h-screen bg-slate-50">
	<div class="mx-auto max-w-4xl px-3 py-4 pb-20 sm:px-4">
		<Breadcrumbs
			crumbs={[
				{ label: 'Calendar', href: '/calendar' },
				{ label: 'Family', href: '/family' },
				{ label: family?.name || 'Family' }
			]}
		/>

		{#if form?.error}
			<div
				role="alert"
				class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
			>
				{form.error}
			</div>
		{/if}

		<div class="mt-4 grid gap-4 sm:grid-cols-3">
			<!-- Hero card -->
			<section
				class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-3"
				aria-labelledby="family-hero-heading"
			>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex min-w-0 items-center gap-3">
						<div
							class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
							style="background-color: {family?.color || '#3b82f6'}"
							aria-hidden="true"
						>
							{(family?.name || 'F').charAt(0).toUpperCase()}
						</div>
						<div class="min-w-0">
							<h1 id="family-hero-heading" class="truncate text-xl font-bold text-slate-900">
								{family?.name}
							</h1>
							<div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
								<span>{members.length} member{members.length !== 1 ? 's' : ''}</span>
								<span aria-hidden="true">·</span>
								<span class="flex items-center gap-1">
									You:
									<span class={rolePillClass(currentUserRole || 'member')}>{currentUserRole}</span>
								</span>
							</div>
						</div>
					</div>
					<div class="flex items-center gap-2">
						{#if isAdmin}
							<a
								href="/family/{family?.id}/members/add"
								class="inline-flex min-h-11 items-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
							>
								Add member
							</a>
							<button
								type="button"
								on:click={scrollToSettings}
								aria-label="Jump to family settings"
								class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50"
							>
								<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
									/>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
									/>
								</svg>
							</button>
						{/if}
					</div>
				</div>
			</section>

			<!-- Left column: members + activity (activity relates to member actions) -->
			<div class="flex min-w-0 flex-col gap-4 {isAdmin ? 'sm:col-span-2' : 'sm:col-span-3'}">
				<!-- Members card -->
				<section
					class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
					aria-labelledby="members-heading"
				>
					<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
						<h2 id="members-heading" class="text-lg font-semibold text-slate-900">Members</h2>
						<div class="flex items-center gap-2">
							<a
								href="/family/{family?.id}/tasks"
								class="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50"
							>
								Family Tasks
							</a>
							{#if isAdmin}
								<a
									href="/family/{family?.id}/members/add"
									class="inline-flex min-h-11 items-center rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
								>
									Add member
								</a>
							{/if}
						</div>
					</div>

					{#if members.length > 0}
						<ul class="space-y-2">
							{#each members as member (member.userId)}
								<li
									class="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 transition-colors hover:bg-slate-100"
								>
									<div class="flex min-w-0 flex-1 items-center gap-2.5">
										<div
											class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold {avatarColor(
												member.userId
											)}"
											aria-hidden="true"
										>
											{member.firstName?.[0] || member.email?.[0] || '?'}
										</div>
										<div class="min-w-0">
											<p class="truncate text-sm font-medium text-slate-900">
												{memberDisplayName(member)}
											</p>
											<p class="truncate text-xs text-slate-500">{member.email}</p>
										</div>
									</div>

									<div class="flex flex-wrap items-center gap-1.5">
										{#if !isAdmin}
											<span
												class="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
												title="Member type (profile label — parent, child, or member)"
											>
												{member.memberType || 'member'}
											</span>
										{/if}

										{#if editingRole === member.userId}
											<!-- Desktop inline role editor -->
											<form
												method="POST"
												action="?/updateRole"
												use:enhance={() => roleSubmit(member)}
												class="hidden items-center gap-1.5 sm:flex"
											>
												<input type="hidden" name="userId" value={member.userId} />
												<select
													name="role"
													value={member.role || 'member'}
													disabled={roleBusy === member.userId}
													aria-label="Role for {member.firstName}"
													class="h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 disabled:opacity-50"
												>
													<option value="member">member</option>
													<option value="admin">admin</option>
													{#if currentUserRole === 'creator'}
														<option value="creator">creator</option>
													{/if}
												</select>
												<button
													type="submit"
													disabled={roleBusy === member.userId}
													class="h-11 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
												>
													{roleBusy === member.userId ? 'Saving…' : 'Save'}
												</button>
												<button
													type="button"
													on:click={() => (editingRole = null)}
													class="h-11 rounded-lg bg-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
												>
													Cancel
												</button>
											</form>
											<span class={rolePillClass(member.role || 'member') + ' sm:hidden'}>
												{member.role || 'member'}
											</span>
										{:else}
											<span class={rolePillClass(member.role || 'member')}>
												{member.role || 'member'}
											</span>
										{/if}

										<!-- Desktop actions (sm+) -->
										<div class="hidden items-center gap-1.5 sm:flex">
											{#if isAdmin}
												<form
													method="POST"
													action="?/setMemberType"
													use:enhance={memberTypeSubmit}
													title="Member type (profile label — parent, child, or member)"
												>
													<input type="hidden" name="userId" value={member.userId} />
													<select
														name="memberType"
														value={member.memberType ?? 'member'}
														disabled={memberTypeBusy === member.userId}
														on:change={(e) => startMemberTypeChange(e, member)}
														aria-label="Member type for {member.firstName}{memberTypeBusy ===
														member.userId
															? ' — saving…'
															: ''}"
														class="h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-600 disabled:opacity-50"
													>
														<option value="parent">Parent</option>
														<option value="child">Child</option>
														<option value="member">Member</option>
													</select>
												</form>
											{/if}
											{#if canEditRole(member) && editingRole !== member.userId}
												<button
													type="button"
													on:click={() => (editingRole = member.userId)}
													class="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
												>
													Edit
												</button>
											{/if}
											{#if showRemoveConfirm === member.userId}
												<div class="flex items-center gap-1.5">
													<span class="text-sm text-red-600">Remove?</span>
													<form
														method="POST"
														action="?/removeMember"
														use:enhance={() => removeSubmit(member)}
													>
														<input type="hidden" name="userId" value={member.userId} />
														<button
															type="submit"
															disabled={removeBusy === member.userId}
															class="h-11 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
														>
															{removeBusy === member.userId ? 'Removing…' : 'Yes'}
														</button>
													</form>
													<button
														type="button"
														on:click={() => (showRemoveConfirm = null)}
														class="h-11 rounded-lg bg-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
													>
														No
													</button>
												</div>
											{:else if canRemove(member)}
												<button
													type="button"
													on:click={() => (showRemoveConfirm = member.userId)}
													class="h-11 rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
												>
													Remove
												</button>
											{/if}
										</div>

										<!-- Mobile kebab (<sm) -->
										{#if isAdmin || canEditRole(member) || canRemove(member)}
											<button
												type="button"
												on:click={() => {
													showRemoveConfirm = null;
													sheetMember = member;
												}}
												aria-label="Actions for {memberDisplayName(member)}"
												class="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200 sm:hidden"
											>
												<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
													<path
														d="M6 10.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"
													/>
												</svg>
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
				</section>

				<!-- Activity card -->
				<section
					class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
					aria-labelledby="activity-heading"
				>
					<h2 id="activity-heading" class="mb-3 text-lg font-semibold text-slate-900">
						Recent Activity
					</h2>
					{#if activity.length > 0}
						<ul class="space-y-2">
							{#each activity as item, i (i)}
								<li
									class="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 transition-colors hover:bg-slate-100"
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
						<div class="py-6 text-center">
							<p class="text-sm text-slate-500">
								No activity yet — complete something to get things moving.
							</p>
						</div>
					{/if}
				</section>
			</div>

			{#if isAdmin}
				<!-- Right column: settings, invitations -->
				<div class="flex min-w-0 flex-col gap-4">
					<!-- Settings card (always visible; admin content) -->
					{#if isAdmin}
						<section
							id="family-settings"
							class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
							aria-labelledby="settings-heading"
						>
							<h2 id="settings-heading" class="mb-3 text-lg font-semibold text-slate-900">
								Family Settings
							</h2>
							<form method="POST" action="?/updateFamily" use:enhance={saveFamilySubmit}>
								<div class="grid gap-3">
									<div>
										<label for="name" class="mb-1 block text-sm font-medium text-slate-700"
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
										<label for="color" class="mb-1 block text-sm font-medium text-slate-700"
											>Color</label
										>
										<input
											type="color"
											id="color"
											name="color"
											bind:value={editingColor}
											class="h-11 w-full rounded-lg border border-slate-300"
										/>
									</div>
								</div>
								<button
									type="submit"
									disabled={savingFamily}
									class="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
								>
									{savingFamily ? 'Saving…' : 'Save Changes'}
								</button>
							</form>

							<div class="mt-5 border-t border-slate-200 pt-4">
								<h3 class="text-sm font-semibold text-slate-800">Day Dashboard Modules</h3>
								<p class="mt-1 text-xs text-slate-500">
									Family-wide master switches. Switched-off cards are hidden for everyone —
									individual members can re-enable them from Account settings.
								</p>
								<div class="mt-3 grid gap-2">
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
												class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors {moduleSwitches[
													mod.id
												]
													? 'bg-green-100 text-green-700 hover:bg-green-200'
													: 'bg-slate-200 text-slate-600 hover:bg-slate-300'}"
											>
												{moduleSwitches[mod.id] ? 'On' : 'Off'}
											</button>
										</form>
									{/each}
								</div>
							</div>
						</section>
					{/if}

					<!-- Invitations card -->
					{#if isAdmin}
						<section
							class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
							aria-labelledby="invitations-heading"
						>
							<h2 id="invitations-heading" class="mb-3 text-lg font-semibold text-slate-900">
								Invitations
							</h2>
							<div class="space-y-1.5">
								<a
									href="/family/{family?.id}/invitations"
									class="flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
								>
									<svg
										class="h-5 w-5 shrink-0 text-slate-400"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										aria-hidden="true"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
										/>
									</svg>
									<span class="flex-1">Manage invitations</span>
									<svg
										class="h-4 w-4 shrink-0 text-slate-300"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										aria-hidden="true"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 5l7 7-7 7"
										/>
									</svg>
								</a>
								<a
									href="/family/{family?.id}/members/add"
									class="flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
								>
									<svg
										class="h-5 w-5 shrink-0 text-slate-400"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										aria-hidden="true"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									<span class="flex-1">Add member</span>
									<svg
										class="h-4 w-4 shrink-0 text-slate-300"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										aria-hidden="true"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 5l7 7-7 7"
										/>
									</svg>
								</a>
							</div>
						</section>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Mobile member action sheet -->
{#if sheetMember}
	{@const sm = sheetMember}
	<div class="fixed inset-0 z-50">
		<button
			type="button"
			aria-label="Close member actions"
			on:click={closeSheet}
			class="absolute inset-0 h-full w-full cursor-default bg-black/40"
		></button>
		<div
			use:trapFocusAction
			role="dialog"
			aria-modal="true"
			aria-label="Actions for {memberDisplayName(sm)}"
			class="fixed inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl"
		>
			<div class="mb-4 flex items-center justify-between gap-2">
				<p class="truncate text-sm font-semibold text-slate-900">
					{memberDisplayName(sm)}
				</p>
				<button
					type="button"
					on:click={closeSheet}
					aria-label="Close"
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
				>
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<div class="space-y-4">
				{#if isAdmin}
					<form method="POST" action="?/setMemberType" use:enhance={memberTypeSubmit}>
						<input type="hidden" name="userId" value={sm.userId} />
						<label for="sheet-member-type" class="mb-1 block text-xs font-medium text-slate-500"
							>Member type (profile label — parent, child, or member)</label
						>
						<select
							id="sheet-member-type"
							name="memberType"
							value={sm.memberType ?? 'member'}
							disabled={memberTypeBusy === sm.userId}
							on:change={(e) => startMemberTypeChange(e, sm)}
							aria-label="Member type for {sm.firstName}"
							class="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 disabled:opacity-50"
						>
							<option value="parent">Parent</option>
							<option value="child">Child</option>
							<option value="member">Member</option>
						</select>
					</form>
				{/if}

				{#if canEditRole(sm)}
					<form method="POST" action="?/updateRole" use:enhance={() => roleSubmit(sm)}>
						<input type="hidden" name="userId" value={sm.userId} />
						<label for="sheet-role" class="mb-1 block text-xs font-medium text-slate-500"
							>Role</label
						>
						<select
							id="sheet-role"
							name="role"
							value={sm.role || 'member'}
							disabled={roleBusy === sm.userId}
							aria-label="Role for {sm.firstName}"
							class="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 disabled:opacity-50"
						>
							<option value="member">member</option>
							<option value="admin">admin</option>
							{#if currentUserRole === 'creator'}
								<option value="creator">creator</option>
							{/if}
						</select>
						<button
							type="submit"
							disabled={roleBusy === sm.userId}
							class="mt-2 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
						>
							{roleBusy === sm.userId ? 'Saving…' : 'Save'}
						</button>
					</form>
				{/if}

				{#if canRemove(sm)}
					{#if showRemoveConfirm === sm.userId}
						<div class="rounded-lg border border-red-200 bg-red-50 p-3">
							<p class="mb-2 text-sm text-red-600">Remove this member from the family?</p>
							<div class="flex gap-2">
								<form
									method="POST"
									action="?/removeMember"
									use:enhance={() => removeSubmit(sm)}
									class="flex-1"
								>
									<input type="hidden" name="userId" value={sm.userId} />
									<button
										type="submit"
										disabled={removeBusy === sm.userId}
										class="inline-flex h-11 w-full items-center justify-center rounded-lg bg-red-600 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
									>
										{removeBusy === sm.userId ? 'Removing…' : 'Yes'}
									</button>
								</form>
								<button
									type="button"
									on:click={() => (showRemoveConfirm = null)}
									class="h-11 flex-1 rounded-lg bg-slate-200 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
								>
									No
								</button>
							</div>
						</div>
					{:else}
						<button
							type="button"
							on:click={() => (showRemoveConfirm = sm.userId)}
							class="inline-flex h-11 w-full items-center justify-center rounded-lg border border-red-300 bg-white text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
						>
							Remove member
						</button>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}
