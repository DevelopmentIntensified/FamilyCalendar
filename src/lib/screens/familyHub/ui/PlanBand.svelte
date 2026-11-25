<!--
	The rail's Plan band: the tier pill (or "No plan"), the AI-events bar
	`{used}/{limit}`, Families, Members, Archive days and Export. A limit the
	plan does not set prints `0` (Q-089, the recorded default).
	Legacy reference: `family/[familyId]/+page.svelte:880-930`.
-->
<script lang="ts">
	import { aiUsagePercent } from '../familyHub.detail.rules';
	import type { FamilyHubPlanUsage } from '../familyHub.contract';

	interface Props {
		plan: FamilyHubPlanUsage;
	}

	let { plan }: Props = $props();

	const percent = $derived(aiUsagePercent(plan.aiUsed, plan.aiLimit));
</script>

<section
	class="min-w-0 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white p-4 shadow-sm"
	aria-label="Plan usage"
>
	<h2 class="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
		Plan
		<span
			class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide {plan.tierName
				? 'bg-emerald-100 text-emerald-800'
				: 'bg-slate-100 text-slate-500'}"
		>
			{plan.tierName || 'No plan'}
		</span>
	</h2>
	<div class="flex items-center gap-2">
		<span class="shrink-0 text-xs text-slate-500">AI events</span>
		<span class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
			<span class="block h-full rounded-full bg-primary-600" style="width: {percent}%"></span>
		</span>
		<span class="shrink-0 text-xs font-bold text-slate-700">{plan.aiUsed}/{plan.aiLimit}</span>
	</div>
	<dl class="mt-2 text-sm">
		<div class="flex items-baseline justify-between gap-3 py-1.5">
			<dt class="font-medium text-slate-700">Families</dt>
			<dd class="text-slate-600">{plan.familiesUsed} of {plan.familyLimit}</dd>
		</div>
		<div class="flex items-baseline justify-between gap-3 border-t border-slate-100 py-1.5">
			<dt class="font-medium text-slate-700">Members</dt>
			<dd class="text-slate-600">{plan.members} of {plan.memberLimit}</dd>
		</div>
		<div class="flex items-baseline justify-between gap-3 border-t border-slate-100 py-1.5">
			<dt class="font-medium text-slate-700">Archive</dt>
			<dd class="text-slate-600">{plan.archivedRetentionDays} days</dd>
		</div>
		<div class="flex items-baseline justify-between gap-3 border-t border-slate-100 py-1.5">
			<dt class="font-medium text-slate-700">Export</dt>
			<dd class="text-slate-600">
				{plan.exportImportEnabled ? 'enabled' : 'not on this plan'}
			</dd>
		</div>
	</dl>
</section>
