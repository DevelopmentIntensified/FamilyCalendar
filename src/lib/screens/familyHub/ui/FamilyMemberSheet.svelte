<!--
	The mobile member sheet: "Actions for <name>" with the member-type select,
	the role select and the two-tap remove. `FamilyHubScreen` imports it lazily
	the moment a member is picked (`state.sheetMember`), so the page's first
	paint ships neither the kernel `Sheet` nor these forms (ADR 0010).

	The sheet only exists while a member is picked, so it is always `open`; the
	state class owns every decision and the forms post the same `?/…` actions.
-->
<script lang="ts">
	import Sheet from '$lib/kernel/ui/Sheet.svelte';
	import { memberDisplayName } from '$lib/domains/family/index';
	import type { FamilyHubFormEnhancer, FamilyHubState } from '../familyHub.detail.state.svelte';

	interface Props {
		state: FamilyHubState;
		/** SvelteKit's `$app/forms` `enhance`, passed in by the route. */
		enhance: FamilyHubFormEnhancer;
	}

	let { state, enhance }: Props = $props();

	const sheetTitle = $derived(
		state.sheetMember ? `Actions for ${memberDisplayName(state.sheetMember)}` : 'Member actions'
	);
</script>

<Sheet
	open={!!state.sheetMember}
	onclose={() => state.closeSheet()}
	title={sheetTitle}
	variant="bottom"
	testid="family-member-sheet"
>
	{#if state.sheetMember}
		{@const member = state.sheetMember}
		<div class="space-y-4">
			{#if state.isAdmin}
				<form method="POST" action="?/setMemberType" use:enhance={state.memberTypeSubmit}>
					<input type="hidden" name="userId" value={member.userId} />
					<label for="sheet-member-type" class="mb-1 block text-xs font-medium text-slate-500">
						Member type (profile label — parent, child, or member)
					</label>
					<select
						id="sheet-member-type"
						name="memberType"
						value={member.memberType ?? 'member'}
						disabled={state.memberTypeBusy === member.userId}
						onchange={(event: Event & { currentTarget: EventTarget & HTMLSelectElement }) => {
							state.startMemberTypeChange(member);
							event.currentTarget.form?.requestSubmit();
						}}
						aria-label="Member type for {member.firstName}"
						class="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 disabled:opacity-50"
					>
						<option value="parent">Parent</option>
						<option value="child">Child</option>
						<option value="member">Member</option>
					</select>
				</form>
			{/if}

			{#if state.canEdit(member)}
				<form method="POST" action="?/updateRole" use:enhance={state.roleSubmit(member)}>
					<input type="hidden" name="userId" value={member.userId} />
					<label for="sheet-role" class="mb-1 block text-xs font-medium text-slate-500">Role</label>
					<select
						id="sheet-role"
						name="role"
						value={member.role || 'member'}
						disabled={state.roleBusy === member.userId}
						aria-label="Role for {member.firstName}"
						class="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 disabled:opacity-50"
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
						class="mt-2 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
					>
						{state.roleBusy === member.userId ? 'Saving…' : 'Save'}
					</button>
				</form>
			{/if}

			{#if state.canRemove(member)}
				{#if state.removeAskId === member.userId}
					<div class="rounded-lg border border-red-200 bg-red-50 p-3">
						<p class="mb-2 text-sm text-red-600">Remove this member from the family?</p>
						<div class="flex gap-2">
							<form
								method="POST"
								action="?/removeMember"
								use:enhance={state.removeSubmit(member)}
								class="flex-1"
							>
								<input type="hidden" name="userId" value={member.userId} />
								<button
									type="submit"
									disabled={state.removeBusy === member.userId}
									class="inline-flex h-11 w-full items-center justify-center rounded-lg bg-red-600 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
								>
									{state.removeBusy === member.userId ? 'Removing…' : 'Yes'}
								</button>
							</form>
							<button
								type="button"
								onclick={() => state.cancelRemoveAsk()}
								class="h-11 flex-1 rounded-lg bg-slate-200 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
							>
								No
							</button>
						</div>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => state.startRemoveAsk(member.userId)}
						class="inline-flex h-11 w-full items-center justify-center rounded-lg border border-red-300 bg-white text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
					>
						Remove member
					</button>
				{/if}
			{/if}
		</div>
	{/if}
</Sheet>
