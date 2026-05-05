<script lang="ts">
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	export let data: PageData;
	let { invitations, family } = data;
</script>

<div class="min-h-screen bg-slate-50 px-4 py-8 pt-20">
	<div class="mx-auto max-w-4xl">
		<Breadcrumbs crumbs={[
			{ label: 'Calendar', href: '/calendar' },
			{ label: 'Family', href: '/family' },
			{ label: family?.name || 'Family', href: family?.id ? `/family/${family.id}` : undefined },
			{ label: 'Invitations' }
		]} />

		<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="mb-6 flex flex-wrap items-center justify-between gap-4">
				<div>
					<h1 class="text-2xl font-bold text-slate-900">Family Invitations</h1>
					{#if family}
						<p class="mt-1 text-sm text-slate-500">Managing invitations for: <span class="font-medium text-slate-700">{family.name}</span></p>
					{/if}
				</div>
				<a href="/family/{family?.id}" class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200">
					Back to Family
				</a>
			</div>

			{#if invitations.length > 0}
				<div class="space-y-4">
					{#each invitations as invite}
						<div class="rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50">
							<div class="flex flex-wrap items-start justify-between gap-4">
								<div>
									<div class="mb-2 inline-flex items-center rounded-full bg-slate-100 px-3 py-1">
										<code class="text-sm font-mono text-slate-700">{invite.code}</code>
									</div>
									<div class="flex flex-wrap gap-4 text-sm text-slate-500">
										<span>Uses: {invite.useCount} / {invite.maxUses || '∞'}</span>
										<span>Expires: {new Date(invite.expiresAt).toLocaleDateString()}</span>
									</div>
								</div>
								<button 
									class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
									on:click={() => navigator.clipboard.writeText(window.location.origin + '/family/join/' + invite.code)}
								>
									Copy Invite Link
								</button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="py-12 text-center">
					<svg class="mx-auto mb-4 h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
					</svg>
					<p class="mb-4 text-slate-500">No active invitations for this family.</p>
					<p class="text-sm text-slate-400">Create an invitation to invite new members to your family.</p>
				</div>
			{/if}

			<div class="mt-6 border-t border-slate-200 pt-6">
				<a
					href="/api/family/invite?familyId={family?.id}"
					class="inline-flex items-center gap-2 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					Create New Invitation
				</a>
			</div>
		</div>
	</div>
</div>
