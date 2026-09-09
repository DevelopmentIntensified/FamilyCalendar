<script lang="ts">
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import MemberSearchTab from '$lib/components/family/MemberSearchTab.svelte';
	import MemberInviteTab from '$lib/components/family/MemberInviteTab.svelte';
	import MemberChildTab from '$lib/components/family/MemberChildTab.svelte';

	export let data: PageData;

	let mode: 'search' | 'invite' | 'child' = 'search';
	let error = '';
	let success = false;

	const tabCls = (active: boolean) =>
		'flex-1 rounded-md py-2.5 text-sm font-medium transition-colors ' +
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

		{#if success}
			<div class="rounded-xl border border-green-200 bg-white p-8 text-center shadow-sm">
				<div
					class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100"
				>
					<svg class="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				</div>
				<h2 class="mb-2 text-xl font-bold text-slate-900">Member Added!</h2>
				<p class="mb-6 text-slate-500">The new member has been added to your family.</p>
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

				<div class="mb-5 flex rounded-lg bg-slate-100 p-1">
					<button on:click={() => (mode = 'search')} class={tabCls(mode === 'search')}>
						Search Users
					</button>
					{#if data.canInviteByEmail}
						<button on:click={() => (mode = 'invite')} class={tabCls(mode === 'invite')}>
							Invite by Email
						</button>
					{/if}
					<button on:click={() => (mode = 'child')} class={tabCls(mode === 'child')}>
						Create Child
					</button>
				</div>

				{#if error}
					<div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{error}</div>
				{/if}

				{#if mode === 'search'}
					<MemberSearchTab
						familyId={data.familyId}
						onSuccess={() => (success = true)}
						onError={(message) => (error = message)}
					/>
				{:else if mode === 'invite' && data.canInviteByEmail}
					<MemberInviteTab
						familyId={data.familyId}
						onSuccess={() => (success = true)}
						onError={(message) => (error = message)}
					/>
				{:else}
					<MemberChildTab
						familyId={data.familyId}
						onSuccess={() => (success = true)}
						onError={(message) => (error = message)}
					/>
				{/if}

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
