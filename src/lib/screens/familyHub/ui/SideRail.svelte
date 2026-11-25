<!--
	The detail page's side rail, in this order: Shared data (four links), the
	active invitation, the plan, and "Children are users". Visible to every
	member — the facts are not controls (issue 124).
	Legacy reference: `family/[familyId]/+page.svelte:796-960`.
-->
<script lang="ts">
	import type { FamilyHubState } from '../familyHub.detail.state.svelte';
	import InviteBand from './InviteBand.svelte';
	import PlanBand from './PlanBand.svelte';

	interface Props {
		state: FamilyHubState;
	}

	let { state }: Props = $props();

	const familyId = $derived(state.data.family.id);
</script>

<aside class="flex min-w-0 flex-col gap-5">
	<section
		class="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
		aria-label="Shared data"
	>
		<h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Shared data</h2>
		<div class="space-y-1.5">
			<a
				href="/family/tasks"
				class="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
			>
				Family tasks
				<span class="text-xs font-normal text-slate-400">One column per person</span>
			</a>
			<a
				href="/calendar/groceries"
				class="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
			>
				Grocery list <span class="text-xs font-normal text-slate-400">Shared</span>
			</a>
			<a
				href="/calendar"
				class="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
			>
				Family calendar
				<span class="text-xs font-normal text-slate-400">Everyone's events</span>
			</a>
			<a
				href="/family/invitations"
				class="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
			>
				Invitations <span class="text-xs font-normal text-slate-400">Manage codes</span>
			</a>
		</div>
	</section>

	<InviteBand {state} />
	<PlanBand plan={state.data.planUsage} />

	<section
		class="min-w-0 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/70 to-white p-4 shadow-sm"
		aria-label="Children are users"
	>
		<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
			Children are users
		</h2>
		<p class="text-xs leading-relaxed text-slate-500">
			A child is a real row in your account with a unique email address, which is what lets an event
			carry their attendance and the kids' schedule have something to group by.
		</p>
		<p class="mt-1.5 text-xs leading-relaxed text-slate-500">
			So a family with two children needs two addresses nobody else has.
		</p>
		<a
			href="/family/{familyId}/members/add"
			class="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary-600 hover:text-primary-700"
		>
			See the form
		</a>
	</section>
</aside>
