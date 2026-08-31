<script lang="ts">
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	export let data: PageData;
	let families = data.families;
</script>

<div class="min-h-screen bg-slate-50 px-4 py-8">
	<div class="mx-auto max-w-4xl">
		<Breadcrumbs crumbs={[
			{ label: 'Calendar', href: '/calendar' },
			{ label: 'Family' }
		]} />

		<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="mb-6 flex items-center justify-between">
				<h1 class="text-2xl font-bold text-slate-900">My Families</h1>
				<div class="flex items-center gap-2">
					<a
						href="/family/tasks"
						class="rounded-full border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
					>
						Family Tasks
					</a>
					<a
						href="/family/create"
						class="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
					>
						Create New Family
					</a>
				</div>
			</div>

			{#if families.length > 0}
				<div class="space-y-4">
					{#each families as family}
						<div class="flex items-center justify-between rounded-lg border border-slate-200 p-4 transition-colors hover:border-slate-300 hover:bg-slate-50">
							<div class="flex items-center gap-4">
								{#if family.color}
									<div class="h-10 w-10 rounded-full" style="background-color: {family.color}"></div>
								{:else}
									<div class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-slate-600">
										<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
										</svg>
									</div>
								{/if}
								<div>
									<h2 class="text-lg font-semibold text-slate-900">{family.name}</h2>
									<p class="text-sm text-slate-500">{family.memberCount} member{family.memberCount !== 1 ? 's' : ''}</p>
								</div>
							</div>
							<a href="/family/{family.id}" class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200">
								View Details
							</a>
						</div>
					{/each}
				</div>
			{:else}
				<div class="py-12 text-center">
					<svg class="mx-auto mb-4 h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
					<p class="mb-4 text-slate-500">You haven't created any families yet.</p>
					<a href="/family/create" class="inline-flex items-center gap-2 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700">
						Create Your First Family
					</a>
				</div>
			{/if}

			<div class="mt-6 border-t border-slate-200 pt-6">
				<a href="/family/invitations" class="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-primary-600">
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
					</svg>
					View Family Invitations
				</a>
			</div>
		</div>
	</div>
</div>
