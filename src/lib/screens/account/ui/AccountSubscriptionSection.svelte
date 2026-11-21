<!--
	Plan & usage: the current plan card (Free, or the paid display name with
	"Active · …" and the renewal line), the limits table, the AI-usage bar with
	its reset date when a real limit exists, and the upgrade block.

	Every string is a rule (`account.subscription.rules.ts`); the component only
	lays them out. `now` is the page load's instant, so "Resets …" does not read
	the clock here.
-->
<script lang="ts">
	import type { AccountSectionModel } from '../account.contract';
	import {
		accountAiCreationsLabel,
		accountAiResetLabel,
		accountAiUsagePercent,
		accountArchiveLabel,
		accountFormatBytes,
		accountRenewalDateLabel,
		accountRetentionLabel,
		accountSubscriptionPeriodLabel,
		accountUsageLine
	} from '../account.subscription.rules';

	type AccountSubscriptionModel = Extract<AccountSectionModel, { section: 'subscription' }>;

	interface Props {
		model: AccountSubscriptionModel;
		/** The page load's instant. */
		now: Date;
	}

	let { model, now }: Props = $props();

	const tier = $derived(model.subscription.tier);
	const row = $derived(model.subscription.subscription);
	const isPaidPlan = $derived(tier != null && tier.tierName !== 'free');
	const periodLabel = $derived(
		accountSubscriptionPeriodLabel(isPaidPlan, { tier, row })
	);
	const renewalLabel = $derived(
		isPaidPlan ? accountRenewalDateLabel(row, tier?.durationMonths ?? null) : null
	);
	// The fullest family would hit a per-family member limit first.
	const largestFamily = $derived(
		model.families.reduce((max, family) => Math.max(max, family.memberCount), 0)
	);
	const aiLimit = $derived(model.aiUsage.limit);
	const showAiBar = $derived(aiLimit > 0 && aiLimit < 999);
	const aiPct = $derived(accountAiUsagePercent(model.aiUsage.used, aiLimit));
	const aiResetLabel = $derived(accountAiResetLabel(now));
	const pricing = $derived(model.planPricing);
</script>

<div id="subscription">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">Subscription</h2>

	<div data-testid="plan-card" class="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Current Plan</p>
				<p class="mt-1 text-xl font-bold text-slate-900">
					{isPaidPlan && tier ? (tier.displayName ?? 'Family') : 'Free'}
				</p>
				<p class="mt-1 text-sm text-slate-500">
					{#if isPaidPlan}
						<span class="inline-flex items-center gap-1.5">
							<span class="inline-block h-2 w-2 rounded-full bg-green-500"></span>
							Active · {periodLabel}
						</span>
					{:else}
						You're on the Free plan. Upgrade to unlock the full family toolkit.
					{/if}
				</p>
				{#if renewalLabel}
					<p class="mt-1 text-sm font-medium text-slate-600">{renewalLabel}</p>
				{/if}
			</div>
			<a
				href="/pricing"
				class="rounded-full bg-primary-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
			>
				Change plan
			</a>
		</div>
	</div>

	<div class="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
		<h3 class="mb-4 text-sm font-semibold text-slate-700">Plan Limits</h3>
		<dl class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">Family Members</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{accountUsageLine(largestFamily, model.planLimits.memberLimit)}
					<span class="text-xs font-normal text-slate-500">per family</span>
				</dd>
			</div>
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">Families</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{accountUsageLine(model.families.length, model.planLimits.familyLimit)}
				</dd>
			</div>
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">Event History</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{accountRetentionLabel(model.planLimits.retentionViewDays)}
				</dd>
			</div>
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">Archived Events</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{accountArchiveLabel(model.planLimits.archivedRetentionDays)}
				</dd>
			</div>
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">Attachment Size</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{accountFormatBytes(model.planLimits.attachmentLimitBytes)}
				</dd>
			</div>
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">AI Event Creation</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{accountAiCreationsLabel(model.aiUsage.used, model.planLimits.aiEventCreationsPerMonth)}
				</dd>
			</div>
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">Export / Import</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{#if model.planLimits.exportImportEnabled}
						Included
					{:else}
						Not included
					{/if}
				</dd>
			</div>
		</dl>
	</div>

	{#if showAiBar}
		<div data-testid="ai-usage-bar" class="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
			<div class="mb-1.5 flex items-baseline justify-between gap-3">
				<span class="text-sm font-semibold text-slate-700">AI event creations</span>
				<span class="text-xs tabular-nums text-slate-500">
					{model.aiUsage.used} of {model.aiUsage.limit}
				</span>
			</div>
			<div class="h-1.5 overflow-hidden rounded-full bg-slate-100">
				<i
					class="block h-full rounded-full bg-primary-600"
					style="width:{aiPct}%"
					data-testid="ai-usage-fill"
				></i>
			</div>
			<p class="mt-1.5 text-xs text-slate-500">{aiResetLabel}</p>
		</div>
	{/if}

	<div class="rounded-2xl border border-amber-200 bg-amber-50 p-6">
		<h3 class="text-sm font-semibold text-amber-900">Family Master</h3>
		<p class="mt-1 text-sm text-amber-800">
			Unlimited family members, full event history, big attachments and unlimited AI events —
			<span class="font-semibold"
				>${pricing.monthly}/mo · ${pricing.annual}/yr · ${pricing.lifetime} lifetime</span
			>.
		</p>
		<div class="mt-4 flex flex-wrap items-center gap-3">
			<a
				href="/pricing"
				class="rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
			>
				See Plans & Pricing
			</a>
		</div>
		<p class="mt-3 text-xs text-amber-700">
			Checkout opens soon — purchases aren't live yet.
		</p>
	</div>
</div>
