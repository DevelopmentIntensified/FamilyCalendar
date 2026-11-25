<!--
	The family detail page body: the hero, the main column (members, activity,
	settings and invitations for admins), the side rail, the `form.error` alert
	and the mobile member sheet (a lazy chunk that loads when a member is picked:
	ADR 0010). Layout only — every decision lives in `FamilyHubState` and the
	components.

	Legacy reference: `family/[familyId]/+page.svelte`. The `(family)` layout
	provides Navbar/BottomNav/Toaster only, so the page draws its own breadcrumb.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { sharedToasts } from '$lib/kernel/client/toasts.svelte';
	import { systemScheduler } from '$lib/kernel/time/scheduler';
	import { DEFAULT_FAMILY_COLOR } from '$lib/domains/family/index';
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

	/** How long after mount the lazy member sheet's chunk is fetched. */
	const SHEET_WARM_MS = 4000;

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

	const toasts = sharedToasts;
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

	// Warm the sheet's chunk a few seconds after mount, once the page's own load
	// is over, so the first tap (even offline) finds it cached (ADR 0010).
	onMount(() =>
		systemScheduler(() => {
			void import('./FamilyMemberSheet.svelte');
		}, SHEET_WARM_MS)
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

{#if state.sheetMember}
	{#await import('./FamilyMemberSheet.svelte') then { default: FamilyMemberSheet }}
		<FamilyMemberSheet {state} {enhance} />
	{/await}
{/if}
