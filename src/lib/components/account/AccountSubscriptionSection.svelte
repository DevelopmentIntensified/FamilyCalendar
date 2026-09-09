<script lang="ts">
	import {
		formatBytesLabel,
		subscriptionPeriodLabel,
		type SubRow,
		type SubTier
	} from './accountSubscription';

	interface Props {
		subscription: { tier?: SubTier | null; subscription?: SubRow | null } | null;
		planLimits: {
			familyLimit?: number | null;
			retentionViewDays?: number | null;
			archivedRetentionDays?: number | null;
			attachmentLimitBytes?: number | null;
			aiEventCreationsPerMonth?: number | null;
			exportImportEnabled?: boolean | null;
		} | null;
		aiUsage: { used: number; limit: number };
		planPricing: { monthly?: number; annual?: number; lifetime?: number } | null;
	}

	let { subscription, planLimits, aiUsage, planPricing }: Props = $props();

	let subTier = $derived(subscription?.tier ?? null);
	let subRow = $derived(subscription?.subscription ?? null);
	let isPaidPlan = $derived(subTier != null && subTier.tierName !== 'free');
	let periodLabel = $derived(subscriptionPeriodLabel(isPaidPlan, { tier: subTier, row: subRow }));
</script>

<div id="subscription">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">Subscription</h2>

	<!-- Current plan -->
	<div class="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
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
			</div>
			{#if isPaidPlan}
				<span class="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"
					>Active</span
				>
			{:else}
				<span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500"
					>Free</span
				>
			{/if}
		</div>
	</div>

	<!-- Plan limits -->
	<div class="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
		<h3 class="mb-4 text-sm font-semibold text-slate-700">Plan Limits</h3>
		<dl class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<div class="rounded-lg bg-slate-50 p-3">
				<dt class="text-xs font-medium text-slate-500">Family Members</dt>
				<dd class="mt-1 text-lg font-bold text-slate-900">
					{planLimits?.familyLimit === 999 ? 'Unlimited' : (planLimits?.familyLimit ?? 1)}
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
