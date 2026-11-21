<!--
	One roster row of the Members band: avatar, name, email, the role pill (or
	its inline editor), the Member Type select for admins (a pill otherwise),
	Edit, Remove with its inline "Remove? Yes/No" ask, and the mobile kebab.
	Legacy reference: `family/[familyId]/+page.svelte:405-560`.

	Callbacks are the state class's own; the row fetches nothing.
-->
<script lang="ts">
	import { idColor } from '$lib/kernel/ui/colorHash';
	import { memberDisplayName } from '$lib/domains/family/index';
	import type { FamilyHubMember } from '../familyHub.contract';
	import type {
		FamilyHubFormEnhancer,
		FamilyHubState
	} from '../familyHub.detail.state.svelte';

	interface Props {
		state: FamilyHubState;
		member: FamilyHubMember;
		enhance: FamilyHubFormEnhancer;
		onOpenSheet: () => void;
	}

	let { state, member, enhance, onOpenSheet }: Props = $props();

	const name = $derived(memberDisplayName(member));
	const role = $derived(member.role || 'member');
	const initial = $derived(member.firstName?.[0] || member.email?.[0] || '?');
</script>

<li
	class="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5 transition-colors hover:bg-slate-100"
>
	<div class="flex min-w-0 flex-1 items-center gap-2.5">
		<div
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold {idColor(
				member.userId
			)}"
			aria-hidden="true"
		>
			{initial}
		</div>
		<div class="min-w-0">
			<p class="truncate text-sm font-medium text-slate-900">{name}</p>
			<p class="truncate text-xs text-slate-500">{member.email}</p>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-1.5">
		{#if !state.isAdmin}
			<span
				class="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
				title="Member type (profile label — parent, child, or member)"
			>
				{member.memberType || 'member'}
			</span>
		{/if}

		{#if state.editingRole === member.userId}
			<form
				method="POST"
				action="?/updateRole"
				use:enhance={state.roleSubmit(member)}
				class="hidden items-center gap-1.5 sm:flex"
			>
				<input type="hidden" name="userId" value={member.userId} />
				<select
					name="role"
					value={role}
					disabled={state.roleBusy === member.userId}
					aria-label="Role for {member.firstName}"
					class="h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 disabled:opacity-50"
				>
					<option value="member">member</option>
					<option value="admin">admin</option>
					{#if state.data.currentUserRole === 'creator'}
						<option value="creator">creator</option>
					{/if}
				</select>
				<button
					type="submit"
					disabled={state.roleBusy === member.userId}
					class="h-11 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
				>
					{state.roleBusy === member.userId ? 'Saving…' : 'Save'}
				</button>
				<button
					type="button"
					onclick={() => state.cancelEditRole()}
					class="h-11 rounded-lg bg-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
				>
					Cancel
				</button>
			</form>
			<span class="{state.pillClass(role)} sm:hidden">{role}</span>
		{:else}
			<span class={state.pillClass(role)}>{role}</span>
		{/if}

		<div class="hidden items-center gap-1.5 sm:flex">
			{#if state.isAdmin}
				<form
					method="POST"
					action="?/setMemberType"
					use:enhance={state.memberTypeSubmit}
					title="Member type (profile label — parent, child, or member)"
				>
					<input type="hidden" name="userId" value={member.userId} />
					<select
						name="memberType"
						value={member.memberType ?? 'member'}
						disabled={state.memberTypeBusy === member.userId}
						onchange={(event: Event & { currentTarget: EventTarget & HTMLSelectElement }) => {
							state.startMemberTypeChange(member);
							event.currentTarget.form?.requestSubmit();
						}}
						aria-label="Member type for {member.firstName}{state.memberTypeBusy === member.userId
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

			{#if state.canEdit(member) && state.editingRole !== member.userId}
				<button
					type="button"
					onclick={() => state.startEditRole(member.userId)}
					class="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
				>
					Edit
				</button>
			{/if}

			{#if state.removeAskId === member.userId}
				<div class="flex items-center gap-1.5">
					<span class="text-sm text-red-600">Remove?</span>
					<form method="POST" action="?/removeMember" use:enhance={state.removeSubmit(member)}>
						<input type="hidden" name="userId" value={member.userId} />
						<button
							type="submit"
							disabled={state.removeBusy === member.userId}
							class="h-11 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
						>
							{state.removeBusy === member.userId ? 'Removing…' : 'Yes'}
						</button>
					</form>
					<button
						type="button"
						onclick={() => state.cancelRemoveAsk()}
						class="h-11 rounded-lg bg-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
					>
						No
					</button>
				</div>
			{:else if state.canRemove(member)}
				<button
					type="button"
					onclick={() => state.startRemoveAsk(member.userId)}
					class="h-11 rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
				>
					Remove
				</button>
			{/if}
		</div>

		{#if state.mayActOn(member)}
			<button
				type="button"
				onclick={onOpenSheet}
				aria-label="Actions for {name}"
				class="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200 sm:hidden"
			>
				<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M6 10.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"
					/>
				</svg>
			</button>
		{/if}
	</div>
</li>
