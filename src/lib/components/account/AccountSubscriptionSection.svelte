<script lang="ts">
	import {
		formatBytesLabel,
		renewalDateLabel,
		subscriptionPeriodLabel,
		usageLine,
		type SubRow,
		type SubTier
	} from './accountSubscription';

	interface Props {
		subscription: { tier?: SubTier | null; subscription?: SubRow | null } | null;
		planLimits: {
			familyLimit?: number | null;
			memberLimit?: number | null;
			retentionViewDays?: number | null;
			archivedRetentionDays?: number | null;
			attachmentLimitBytes?: number | null;
			aiEventCreationsPerMonth?: number | null;
			exportImportEnabled?: boolean | null;
		} | null;
		aiUsage: { used: number; limit: number };
		planPricing: { monthly?: number; annual?: number; lifetime?: number } | null;
		/** 105: the usage line the approved page shows. Real counts, loaded from
		 *  the multi-family helper — never a guess at "the user's one family". */
		families?: { id: string; memberCount: number }[];
	}

	let { subscription, planLimits, aiUsage, planPricing, families = [] }: Props = $props();

	let subTier = $derived(subscription?.tier ?? null);
	let subRow = $derived(subscription?.subscription ?? null);
	let isPaidPlan = $derived(subTier != null && subTier.tierName !== 'free');
	let periodLabel = $derived(subscriptionPeriodLabel(isPaidPlan, { tier: subTier, row: subRow }));
	// 105 rerun: the renewal gets its own line, as the approved card has it.
	let renewalLabel = $derived(
		isPaidPlan ? renewalDateLabel(subRow, subTier?.durationMonths ?? null) : null
	);
	// The fullest family is the one that would hit a member limit first, so it
	// is the honest number to show against the per-family limit.
	let largestFamily = $derived(families.reduce((max, f) => Math.max(max, f.memberCount), 0));
	// 999 is the codebase's stand-in for "no limit", so a bar against it would
	// be a bar against a number nobody will ever reach. No real limit, no bar.
	let aiLimit = $derived(aiUsage.limit);
	let showAiBar = $derived(aiLimit > 0 && aiLimit < 999);
	let aiPct = $derived(
		showAiBar ? Math.min(100, Math.round((aiUsage.used / aiLimit) * 100)) : 0
	);
	// "Resets 1 October" - the first of next month, in the reader's own words.
	let aiResetLabel = $derived(
		(() => {
			const next = new Date();
			next.setMonth(next.getMonth() + 1, 1);
			return `Resets ${next.toLocaleDateString(undefined, {
				day: 'numeric',
				month: 'long'
			})}`;
		})()
	);
</script>

<div id="subscription">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">Subscription</h2>

	<!-- Current plan. The approved card pairs the plan name with a Change plan
	     button on the same line and puts the renewal date under it. -->
	<div data-testid="plan-card" class="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<div>
				<p class="text-xs font-semibold uppercase tracking-wide text-slate-400">Current Plan</p>
				<p class="mt-1 text-xl font-bold text-slate-900">
					{isPaidPlan && subTier ? (subTier.displayName ?? 'Family') : 'Free'}
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

	<!-- Plan limits -->
	<div class="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
		<h3 class="mb-4 text-sm font-semibold text-slate-700">Plan Limits</h3>
		<dl class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">Family Members</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{usageLine(largestFamily, planLimits?.memberLimit)}
					<span class="text-xs font-normal text-slate-500">per family</span>
				</dd>
			</div>
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">Families</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{usageLine(families.length, planLimits?.familyLimit)}
				</dd>
			</div>
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">Event History</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{#if (planLimits?.retentionViewDays ?? 0) >= 3650}
						Full history
					{:else}
						{planLimits?.retentionViewDays ?? 30} days
					{/if}
				</dd>
			</div>
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">Archived Events</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{#if planLimits?.archivedRetentionDays === 0}
						Not included
					{:else if (planLimits?.archivedRetentionDays ?? 0) >= 3650}
						Full archive
					{:else}
						{planLimits?.archivedRetentionDays ?? 90} days
					{/if}
				</dd>
			</div>
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">Attachment Size</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{formatBytesLabel(planLimits?.attachmentLimitBytes)}
				</dd>
			</div>
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">AI Event Creation</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{#if (planLimits?.aiEventCreationsPerMonth ?? 0) >= 999999}
						Unlimited
					{:else}
						{aiUsage.used} / {aiUsage.limit} this month
					{/if}
				</dd>
			</div>
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">Export / Import</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{#if planLimits?.exportImportEnabled}
						Included
					{:else}
						Not included
					{/if}
				</dd>
			</div>
		</dl>
	</div>

	<!-- 105 rerun: the approved page draws the AI allowance as a labelled bar
	     with the count over it and the reset date under it. As one cell in a
	     table of limits it was a number with no sense of how full it was. -->
	{#if showAiBar}
		<div data-testid="ai-usage-bar" class="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
			<div class="mb-1.5 flex items-baseline justify-between gap-3">
				<span class="text-sm font-semibold text-slate-700">AI event creations</span>
				<span class="text-xs tabular-nums text-slate-500">
					{aiUsage.used} of {aiUsage.limit}
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

	<!-- Upgrade -->
	<div class="rounded-2xl border border-amber-200 bg-amber-50 p-6">
		<h3 class="text-sm font-semibold text-amber-900">Family Master</h3>
		<p class="mt-1 text-sm text-amber-800">
			Unlimited family members, full event history, big attachments and unlimited AI events —
			<span class="font-semibold"
				>${planPricing?.monthly ?? 9}/mo · ${planPricing?.annual ?? 90}/yr · ${planPricing?.lifetime ??
					150} lifetime</span
			>.
		</p>
		<div class="mt-4 flex flex-wrap items-center gap-3">
			<a
				href="/pricing"
				class="rounded-full bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600"
			>
				See Plans & Pricing
			</a>
			{#if !isPaidPlan}
				<a
					href="/checkout?plan=monthly"
					class="rounded-full border border-amber-300 px-6 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100"
				>
					Join Waitlist
				</a>
			{/if}
		</div>
		<p class="mt-3 text-xs text-amber-700">
			Checkout opens soon — purchases aren't live yet, but joining the waitlist secures early
			access.
		</p>
	</div>
</div>
