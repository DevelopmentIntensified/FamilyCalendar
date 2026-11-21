<!--
	The Members band: header ("Members", "N of {memberLimit}", the Family Tasks
	and Groceries links, the admin "Add member"), one row per member, the empty
	state, and the full-width "+ Add a member" under the list.
	Legacy reference: `family/[familyId]/+page.svelte:360-586`.
-->
<script lang="ts">
	import type { FamilyHubMember } from '../familyHub.contract';
	import type {
		FamilyHubFormEnhancer,
		FamilyHubState
	} from '../familyHub.detail.state.svelte';
	import MemberRow from './MemberRow.svelte';

	interface Props {
		state: FamilyHubState;
		enhance: FamilyHubFormEnhancer;
		onOpenSheet: (member: FamilyHubMember) => void;
	}

	let { state, enhance, onOpenSheet }: Props = $props();

	const members = $derived(state.data.members);
	const familyId = $derived(state.data.family.id);
</script>

<section
	class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	aria-labelledby="members-heading"
>
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h2 id="members-heading" class="text-xs font-semibold uppercase tracking-wide text-slate-500">
			Members
		</h2>
		<span class="text-xs font-normal normal-case tracking-normal text-slate-400">
			{members.length} of {state.data.planUsage.memberLimit}
		</span>
		<div class="flex items-center gap-2">
			<a
				href="/family/tasks"
				class="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50"
			>
				Family Tasks
			</a>
			<a
				href="/calendar/groceries"
				class="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50"
			>
				Groceries
			</a>
			{#if state.isAdmin}
				<a
					href="/family/{familyId}/members/add"
					class="inline-flex min-h-11 items-center rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
				>
					Add member
				</a>
			{/if}
		</div>
	</div>

	{#if members.length > 0}
		<ul class="space-y-1.5">
			{#each members as member (member.userId)}
				<MemberRow
					{state}
					{member}
					{enhance}
					onOpenSheet={() => onOpenSheet(member)}
				/>
			{/each}
		</ul>
	{:else}
		<div class="py-8 text-center">
			<p class="text-slate-500">No members found.</p>
		</div>
	{/if}

	{#if state.isAdmin}
		<a
			href="/family/{familyId}/members/add"
			class="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
		>
			+ Add a member
		</a>
	{/if}
</section>
