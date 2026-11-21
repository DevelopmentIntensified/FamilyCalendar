<!--
	The `/family` page body: the hero (count, plan pill, Create/Upgrade), the
	family cards or the empty state, the Invitations card, and the per-family
	side rail. Layout only — the cards, the rail and the invite row are their own
	components, and every number comes from the loader.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { copyOrShare } from '$lib/kernel/client/shareText';
	import { createToasts } from '$lib/kernel/client/toasts.svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import { createFamilyApi } from '../family.api';
	import type { FamilyListPayload } from '../family.contract';
	import {
		familyAtPlanLimit,
		familyInviteByFamily,
		familyPlanLabel,
		familyRosterByFamily
	} from '../family.home.rules';
	import { FamilyHomeState } from '../family.home.state.svelte';
	import FamilyBreadcrumbs from './FamilyBreadcrumbs.svelte';
	import FamilyHomeCard from './FamilyHomeCard.svelte';
	import FamilyHomeRail from './FamilyHomeRail.svelte';
	import FamilyInviteByLinkRow from './FamilyInviteByLinkRow.svelte';

	interface Props {
		data: FamilyListPayload;
	}

	let { data }: Props = $props();

	const toasts = createToasts();
	const state = new FamilyHomeState(createFamilyApi(), toasts, (text, title) =>
		copyOrShare(text, { share: true, title })
	);

	const families = $derived(data.families);
	const atLimit = $derived(familyAtPlanLimit(data.plan));
	const rosterByFamily = $derived(familyRosterByFamily(data.roster ?? []));
	const inviteByFamily = $derived(familyInviteByFamily(data.activeInvites ?? []));
	const invitable = $derived(families.filter((family) => family.canInvite));

	const origin = typeof window !== 'undefined' ? window.location.origin : '';

	function mint(familyId: string, familyName: string): void {
		void state.mint(familyId, familyName);
	}

	function copyMinted(familyId: string, familyName: string): void {
		void state.copyMinted(origin, familyId, familyName);
	}

	function copyCode(code: string): void {
		void state.copyCode(origin, code);
	}
</script>

<div class="min-h-screen bg-slate-50">
	<div class="mx-auto max-w-6xl px-3 py-4 pb-20 sm:px-4">
		<FamilyBreadcrumbs crumbs={[{ label: 'Calendar', href: '/calendar' }, { label: 'Family' }]} />

		<div class="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start lg:gap-5">
			<main class="min-w-0">
				<section
					class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
					aria-labelledby="families-hero-heading"
				>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="min-w-0">
							<h1 id="families-hero-heading" class="text-xl font-bold text-slate-900">Families</h1>
							<p class="mt-0.5 text-xs text-slate-400">
								{families.length === 1 ? '1 family' : `${families.length} families`} you belong to
							</p>
							<p
								class="mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium {atLimit
									? 'border-amber-200 bg-amber-50 text-amber-800'
									: 'border-slate-200 bg-slate-50 text-slate-600'}"
							>
								{familyPlanLabel(data.plan.used, data.plan.limit)}
							</p>
						</div>
						{#if atLimit}
							<a
								href="/pricing"
								class="inline-flex min-h-11 items-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
							>
								Upgrade to add families
							</a>
						{:else}
							<a
								href="/family/create"
								class="inline-flex min-h-11 items-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
							>
								Create New Family
							</a>
						{/if}
					</div>
				</section>

				{#if families.length > 0}
					<section
						class="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
						aria-labelledby="families-list-heading"
					>
						<h2 id="families-list-heading" class="text-sm font-semibold text-slate-900">
							Your families
						</h2>
						<p class="mt-0.5 text-xs text-slate-400">Open a family to see members and settings</p>
						<ul class="mt-3 space-y-4">
							{#each families as family (family.id)}
								<FamilyHomeCard {family} />
							{/each}
						</ul>
					</section>
				{:else}
					<section
						class="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
						aria-labelledby="families-empty-heading"
					>
						<div class="py-10 text-center">
							<svg
								class="mx-auto mb-4 h-14 w-14 text-slate-300"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="1.5"
									d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
								/>
							</svg>
							<p id="families-empty-heading" class="text-lg font-medium text-slate-700">
								No families yet
							</p>
							<p class="mt-1 text-sm text-slate-500">
								Create a family, then invite the people you share plans with.
							</p>
							<a
								href="/family/create"
								class="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
							>
								Create Your First Family
							</a>
						</div>
					</section>
				{/if}

				<section
					class="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
					aria-labelledby="families-invitations-heading"
				>
					<h2 id="families-invitations-heading" class="text-sm font-semibold text-slate-900">
						Invitations
					</h2>
					<p class="mt-0.5 text-xs text-slate-400">
						Get a join link to send, or manage the codes your family already has
					</p>
					<div class="mt-3 space-y-1.5">
						{#each invitable as family (family.id)}
							<FamilyInviteByLinkRow
								familyId={family.id}
								familyName={family.name}
								minting={state.mintingId === family.id}
								mintedUrl={state.linkFor(family.id)}
								copied={state.copiedFamilyId === family.id}
								copyFailed={state.copyFailedFamilyId === family.id}
								onmint={() => mint(family.id, family.name)}
								oncopy={() => copyMinted(family.id, family.name)}
							/>
						{/each}
						<a
							href="/family/invitations"
							class="flex min-h-11 items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
						>
							<svg
								class="h-5 w-5 shrink-0 text-slate-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
								/>
							</svg>
							<span class="min-w-0 flex-1 truncate">View family invitations</span>
						</a>
						<a
							href="/family/tasks"
							class="flex min-h-11 items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
						>
							<svg
								class="h-5 w-5 shrink-0 text-slate-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h4"
								/>
							</svg>
							<span class="min-w-0 flex-1 truncate">Family Tasks</span>
						</a>
					</div>
				</section>
			</main>

			<FamilyHomeRail
				{families}
				{rosterByFamily}
				{inviteByFamily}
				railCopiedCode={state.railCopiedCode}
				railCopyFailedCode={state.railCopyFailedCode}
				oncopy={copyCode}
			/>
		</div>
	</div>
</div>

<Toaster items={toasts.items} ondismiss={toasts.dismiss} />
