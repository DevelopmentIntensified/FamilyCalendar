<!--
	The family detail page body: the hero, the main column (members, activity,
	settings and invitations for admins), the side rail, the `form.error` alert
	and the mobile member sheet. Layout only — every decision lives in
	`FamilyHubState` and the components.

	Legacy reference: `family/[familyId]/+page.svelte`. The page chrome
	(breadcrumbs) belongs to the `shell` layout, so this screen does not repeat
	it.
-->
<script lang="ts">
	import { createToasts } from '$lib/kernel/client/toasts.svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import Sheet from '$lib/kernel/ui/Sheet.svelte';
	import { DEFAULT_FAMILY_COLOR, memberDisplayName } from '$lib/domains/family/index';
	import type { FamilyHubModel } from '../familyHub.contract';
	import { FamilyHubState } from '../familyHub.detail.state.svelte';
	import type { FamilyHubFormEnhancer } from '../familyHub.detail.state.svelte';
	import FamilyHero from './FamilyHero.svelte';
	import FamilyHubBreadcrumbs from './FamilyHubBreadcrumbs.svelte';
	import MembersBand from './MembersBand.svelte';
	import RecentActivityCard from './RecentActivityCard.svelte';
	import FamilySettingsBand from './FamilySettingsBand.svelte';
	import InvitationsCard from './InvitationsCard.svelte';
	import SideRail from './SideRail.svelte';
	import type { FamilyHubFormEnhancer } from '../familyHub.contract';

	interface Props {
		data: FamilyHubModel;
		/** The action's own answer; only `error` is rendered (`?/updateFamily` etc.). */
		form?: { error?: string } | null;
		/** SvelteKit's `invalidateAll`, passed in by the route. */
		refresh: () => Promise<void>;
		/** SvelteKit's `$app/forms` `enhance`, passed in by the route. */
		enhance: FamilyHubFormEnhancer;
	}

	let { data, form = null, refresh, enhance }: Props = $props();

	const toasts = createToasts();
	const state = new FamilyHubState({
		toasts,
		refresh,
		data,
		fallbackColor: DEFAULT_FAMILY_COLOR
	});

	// A new load answer settles the page: this is the only place the state
	// learns about new server data, so the class itself stays effect-free.
	$effect(() => {
		state.sync(data);
	});

	const sheetTitle = $derived(
		state.sheetMember ? `Actions for ${memberDisplayName(state.sheetMember)}` : 'Member actions'
	);
</script>

<div class="min-h-screen bg-slate-50">
	<div class="mx-auto max-w-6xl px-3 py-4 pb-20 sm:px-4">
		<FamilyHubBreadcrumbs family={data.family} />

		{#if form?.error}
			<div
				role="alert"
				class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
			>
				{form.error}
			</div>
		{/if}

		<!-- The approved composition (issue 124): a main column and a 19.5rem rail. -->
		<div class="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19.5rem]">
			<div class="flex min-w-0 flex-col gap-5">
				<FamilyHero {state} />
				<MembersBand
					{state}
					{enhance}
					onOpenSheet={(member) => state.openSheet(member)}
				/>
				<RecentActivityCard {state} />
				{#if state.isAdmin}
					<FamilySettingsBand {state} {enhance} />
					<InvitationsCard familyId={state.data.family.id} />
				{/if}
			</div>
			<SideRail {state} />
		</div>
	</div>
</div>

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

<Toaster items={toasts.items} ondismiss={toasts.dismiss} />
