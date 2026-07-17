<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';

	export let data: PageData;
	let { invitations, family } = data;

	let creating = false;
	let revoking = '';
	let error = '';

	const origin = typeof window !== 'undefined' ? window.location.origin : '';

	const createInvitation = async () => {
		creating = true;
		error = '';
		try {
			const res = await fetch('/api/family/invite', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ familyId: family?.id })
			});
			const json = await res.json();
			if (json.error) {
				error = json.error;
			} else {
				await invalidateAll();
			}
		} catch (e) {
			error = 'Failed to create invitation';
		}
		creating = false;
	};

	const revokeInvitation = async (code: string) => {
		revoking = code;
		error = '';
		try {
			const res = await fetch('/api/family/invite', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			});
			const json = await res.json();
			if (json.error) {
				error = json.error;
			} else {
				await invalidateAll();
			}
		} catch (e) {
			error = 'Failed to revoke invitation';
		}
		revoking = '';
	};
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

			{#if error}
				<div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{error}</div>
			{/if}

			{#if invitations.length > 0}
				<div class="space-y-4">
					{#each invitations as invite}
						{@const isExpired = new Date(invite.expiresAt) < new Date()}
						{@const isUsedUp = invite.maxUses !== null && invite.useCount >= invite.maxUses}
						{@const isActive = !isExpired && !isUsedUp}
						{@const inviteUrl = origin + '/family/join/' + invite.code}
						<div class="rounded-lg border border-slate-200 p-4 transition-colors hover:bg-slate-50">
							<div class="flex flex-wrap items-start justify-between gap-4">
								<div class="min-w-0 flex-1">
									<div class="mb-2 flex flex-wrap items-center gap-2">
										<code class="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm text-slate-700">{invite.code}</code>
										{#if !isActive}
											<span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">Inactive</span>
										{/if}
									</div>
									<div class="flex flex-wrap gap-4 text-sm text-slate-500">
										<span>Uses: {invite.useCount} / {invite.maxUses || '∞'}</span>
										<span>Expires: {new Date(invite.expiresAt).toLocaleDateString()}</span>
									</div>
									{#if isActive}
										<div class="mt-2 flex items-center gap-2">
											<input
												type="text"
												readonly
												value={inviteUrl}
												class="min-w-0 flex-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
											/>
											<button
												on:click={() => navigator.clipboard.writeText(inviteUrl)}
												class="rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
											>
												Copy
											</button>
										</div>
									{/if}
								</div>
								<div class="flex items-center gap-2">
									<button
										on:click={() => navigator.clipboard.writeText(inviteUrl)}
										class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
									>
										Copy Invite Link
									</button>
									<button
										on:click={() => revokeInvitation(invite.code)}
										disabled={revoking === invite.code}
										class="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
									>
										{revoking === invite.code ? 'Revoking...' : 'Revoke'}
									</button>
								</div>
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

			<div class="mt-6 flex flex-wrap gap-3 border-t border-slate-200 pt-6">
				<button
					on:click={createInvitation}
					disabled={creating}
					class="inline-flex items-center gap-2 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					{creating ? 'Creating...' : 'Create New Invitation'}
				</button>
				<a
					href="/family/{family?.id}/members/add"
					class="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
					</svg>
					Add Member
				</a>
			</div>
		</div>
	</div>
</div>
