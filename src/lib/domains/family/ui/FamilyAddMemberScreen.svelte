<!--
	The `/family/[familyId]/members/add` page body: one tablist (Find someone /
	Invite by email / Create a child), the one error banner, the chosen pane, and
	the success panel that replaces all of it.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { copyOrShare } from '$lib/kernel/client/shareText';
	import { createFamilyApi } from '../family.api';
	import type { FamilyAddMemberPage } from '../family.contract';
	import {
		FamilyAddMemberState,
		FamilyChildFormState,
		FamilyInviteFormState,
		FamilyMemberSearchState
	} from '../family.addMember.state.svelte';
	import { familyVisibleAddTabs } from '../family.addMember.rules';
	import Breadcrumbs from '$lib/kernel/ui/Breadcrumbs.svelte';
	import FamilyMemberChildTab from './FamilyMemberChildTab.svelte';
	import FamilyMemberInviteTab from './FamilyMemberInviteTab.svelte';
	import FamilyMemberSearchTab from './FamilyMemberSearchTab.svelte';

	interface Props {
		data: FamilyAddMemberPage;
	}

	let { data }: Props = $props();

	const api = createFamilyApi();
	const page = new FamilyAddMemberState();
	const search = new FamilyMemberSearchState(api, data.familyId, (message) => page.fail(message));
	const invite = new FamilyInviteFormState(api, data.familyId, (text, title) =>
		copyOrShare(text, { share: true, title })
	);
	const child = new FamilyChildFormState(api, data.familyId);
	const tabs = $derived(familyVisibleAddTabs(data.canInviteByEmail));

	const tabClass = (active: boolean) =>
		'min-h-10 rounded-lg px-4.5 text-sm font-semibold transition-colors ' +
		(active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900');
</script>

<svelte:head>
	<title>Add Member - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8">
	<div class="mx-auto max-w-xl">
		<Breadcrumbs
			crumbs={[
				{ label: 'Calendar', href: '/calendar' },
				{ label: 'Family', href: '/family' },
				{ label: data.familyName || 'Family', href: `/family/${data.familyId}` },
				{ label: 'Add Member' }
			]}
		/>

		{#if page.success}
			<div class="rounded-xl border border-green-200 bg-white p-8 text-center shadow-sm">
				<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
					<svg class="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				</div>
				<h2 class="mb-2 text-xl font-bold text-slate-900">{page.successCopy.heading}</h2>
				<p class="mb-6 text-slate-500">{page.successCopy.body}</p>
				<a
					href="/family/{data.familyId}"
					class="inline-flex items-center gap-2 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
				>
					Return to Family
				</a>
			</div>
		{:else}
			<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
				<div class="mb-6">
					<h1 class="text-2xl font-bold text-slate-900">Add Family Member</h1>
					<p class="mt-1 text-sm text-slate-500">Search for existing users or invite someone new</p>
				</div>

				<div
					class="mb-5 inline-flex rounded-xl bg-slate-100 p-1"
					role="tablist"
					aria-label="Three ways to add a member"
				>
					<button
						role="tab"
						aria-selected={page.mode === 'search'}
						onclick={() => page.selectMode('search')}
						class={tabClass(page.mode === 'search')}
					>
						Find someone
					</button>
					{#if tabs.includes('invite')}
						<button
							role="tab"
							aria-selected={page.mode === 'invite'}
							onclick={() => page.selectMode('invite')}
							class={tabClass(page.mode === 'invite')}
						>
							Invite by email
						</button>
					{/if}
					<button
						role="tab"
						aria-selected={page.mode === 'child'}
						onclick={() => page.selectMode('child')}
						class={tabClass(page.mode === 'child')}
					>
						Create a child
					</button>
				</div>

				{#if page.error}
					<div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{page.error}</div>
				{/if}

				<div data-member-pane>
					{#if page.mode === 'search'}
						<FamilyMemberSearchTab
							state={search}
							onfail={(message) => page.fail(message)}
							onadded={() => page.added()}
						/>
					{:else if page.mode === 'invite' && data.canInviteByEmail}
						<FamilyMemberInviteTab
							state={invite}
							onfail={(message) => page.fail(message)}
							onclearerror={() => page.clearError()}
							onadded={(email) => page.added(email)}
						/>
					{:else}
						<FamilyMemberChildTab
							state={child}
							onfail={(message) => page.fail(message)}
							onadded={() => page.added()}
						/>
					{/if}
				</div>

				<div class="mt-6 border-t border-slate-200 pt-6">
					<a
						href="/family/{data.familyId}"
						class="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-primary-600"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 19l-7-7 7-7"
							/>
						</svg>
						Back to Family
					</a>
				</div>
			</div>
		{/if}
	</div>
</div>
