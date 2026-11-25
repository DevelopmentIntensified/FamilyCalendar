<!--
	The `/family/invitations` page body: the header and Back link, the family
	switcher when there is a choice, the plain-member notice, the live code and
	the other codes, then the rail's New-code and Revoke bands.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { copyOrShare } from '$lib/kernel/client/shareText';
	import { createToasts } from '$lib/kernel/client/toasts.svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import { createFamilyApi } from '../family.api';
	import type { FamilyInvitationsPage } from '../family.contract';
	import {
		FAMILY_MEMBER_INVITES_NOTICE,
		FAMILY_SWITCHER_LABEL,
		familyLiveInvite,
		familyOtherInvites
	} from '../family.invitations.rules';
	import { isInviteUsable } from '../family.invites.rules';
	import { FamilyInvitationsState } from '../family.invitations.state.svelte';
	import Breadcrumbs from '$lib/kernel/ui/Breadcrumbs.svelte';
	import FamilyInviteCodeRow from './FamilyInviteCodeRow.svelte';
	import FamilyLiveInviteCard from './FamilyLiveInviteCard.svelte';
	import FamilyNewCodeBand from './FamilyNewCodeBand.svelte';

	interface Props {
		data: FamilyInvitationsPage;
		refresh: () => Promise<void>;
	}

	let { data, refresh }: Props = $props();

	const toasts = createToasts();
	const state = new FamilyInvitationsState(
		createFamilyApi(),
		toasts,
		refresh,
		(text, title) => copyOrShare(text, { share: true, title })
	);

	const now = new Date(data.now);
	const live = $derived(familyLiveInvite(data.invitations, now));
	const others = $derived(familyOtherInvites(data.invitations, live));

	const origin = typeof window !== 'undefined' ? window.location.origin : '';
	const joinUrl = (code: string) => `${origin}/family/join/${code}`;

	function copy(code: string): void {
		void state.copyLink(code, joinUrl(code), data.family?.name ?? 'the family');
	}

	function create(): void {
		if (data.family) void state.createCode(data.family.id);
	}

	function revoke(code: string): void {
		void state.revoke(code);
	}
</script>

<div class="min-h-screen bg-slate-50 px-4 py-8">
	<div class="mx-auto max-w-6xl">
		<Breadcrumbs
			crumbs={[
				{ label: 'Calendar', href: '/calendar' },
				{ label: 'Family', href: '/family' },
				{
					label: data.family?.name || 'Family',
					href: data.family ? `/family/${data.family.id}` : undefined
				},
				{ label: 'Invitations' }
			]}
		/>

		<div class="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
			<main class="min-w-0">
				<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
					<div>
						<h1 class="text-2xl font-bold text-slate-900">Family Invitations</h1>
						{#if data.family}
							<p class="mt-1 text-sm text-slate-500">
								Managing invitations for: <span class="font-medium text-slate-700"
									>{data.family.name}</span
								>
							</p>
						{/if}
					</div>
					<a
						href="/family/{data.family?.id}"
						class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
					>
						Back to Family
					</a>
				</div>

				{#if state.error}
					<div role="alert" class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">
						{state.error}
					</div>
				{/if}

				{#if data.memberships.length > 1}
					<nav class="mb-4 flex flex-wrap gap-1.5" aria-label={FAMILY_SWITCHER_LABEL}>
						{#each data.memberships as membership (membership.id)}
							<a
								href="/family/invitations?familyId={membership.id}"
								aria-current={membership.id === data.family?.id ? 'page' : undefined}
								class="inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-medium transition-colors {membership.id ===
								data.family?.id
									? 'border-primary-600 bg-primary-50 text-primary-700'
									: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}"
							>
								{membership.name}
							</a>
						{/each}
					</nav>
				{/if}

				{#if !data.canManageInvites}
					<section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
						<div class="py-12 text-center">
							<p class="text-slate-500">{FAMILY_MEMBER_INVITES_NOTICE}</p>
						</div>
					</section>
				{:else if data.invitations.length > 0}
					{#if live}
						<FamilyLiveInviteCard
							familyName={data.family?.name ?? 'this family'}
							invite={live}
							url={joinUrl(live.code)}
							copied={state.copiedCode === live.code}
							copyFailed={state.copyFailedCode === live.code}
							oncopy={() => copy(live.code)}
						/>
					{/if}

					{#if others.length > 0}
						<section class="mt-4" aria-label="Other codes">
							<ul class="space-y-3">
								{#each others as invite (invite.code)}
									<FamilyInviteCodeRow
										{invite}
										usable={isInviteUsable(invite, now)}
										copied={state.copiedCode === invite.code}
										revoking={state.revokingCode === invite.code}
										oncopy={() => copy(invite.code)}
										onrevoke={() => revoke(invite.code)}
									/>
								{/each}
							</ul>
						</section>
					{/if}
				{:else}
					<section class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
						<div class="py-12 text-center">
							<svg
								class="mx-auto mb-4 h-12 w-12 text-slate-300"
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
							<p class="mb-4 text-slate-500">No active invitations for this family.</p>
							<p class="text-sm text-slate-400">
								Create an invitation to invite new members to your family.
							</p>
						</div>
					</section>
				{/if}
			</main>

			<aside class="mt-4 flex min-w-0 flex-col gap-4 lg:mt-0">
				{#if data.canManageInvites}
					<FamilyNewCodeBand
						validityDays={state.validityDays}
						maxUses={state.maxUses}
						creating={state.creating}
						onvalidity={(days) => {
							state.validityDays = days;
						}}
						onuses={(uses) => {
							state.maxUses = uses;
						}}
						oncreate={create}
					/>

					<section
						class="min-w-0 rounded-2xl border border-red-200 bg-gradient-to-br from-red-100/40 to-white p-4 shadow-sm"
						aria-label="Revoke"
					>
						<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
							Revoke
						</h2>
						<p class="text-xs leading-relaxed text-slate-500">
							Revoking kills the link for anyone who has not used it yet. It cannot un-join somebody
							who already has.
						</p>
						{#if live}
							<button
								type="button"
								onclick={() => revoke(live.code)}
								disabled={state.revokingCode === live.code}
								aria-busy={state.revokingCode === live.code}
								class="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
							>
								{state.revokingCode === live.code ? 'Revoking…' : `Revoke ${live.code}`}
							</button>
						{/if}
					</section>

					<a
						href="/family/{data.family?.id}/members/add"
						class="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
							/>
						</svg>
						Add a member
					</a>
				{/if}
			</aside>
		</div>
	</div>
</div>

<Toaster items={toasts.items} ondismiss={toasts.dismiss} />
