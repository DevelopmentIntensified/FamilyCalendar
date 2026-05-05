<script lang="ts">
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';

	export let data: PageData;
</script>

<svelte:head>
	<title>Archive - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8 pt-20">
	<div class="mx-auto max-w-4xl">
		<Breadcrumbs crumbs={[
			{ label: 'Calendar', href: '/calendar' },
			{ label: 'Archive' }
		]} />

		<div class="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="mb-6">
				<h1 class="text-2xl font-bold text-slate-900">Archive</h1>
				<p class="mt-1 text-sm text-slate-500">
					Events from {data.retentionDays} days ago
				</p>
			</div>

			{#if !data.archiveAllowed}
				<div class="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-4">
					<p class="text-sm text-amber-800">
						{data.reason || 'Archive view not available on your plan.'}
					</p>
					<a
						href="/pricing"
						class="mt-3 inline-flex rounded-full bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
					>
						Upgrade to View Archive
					</a>
				</div>
			{:else if data.events.length === 0}
				<p class="text-sm text-slate-500">No archived events found.</p>
			{:else}
				<div class="space-y-3">
					{#each data.events as event}
						<div class="rounded-lg border border-slate-200 p-4">
							<h3 class="font-medium text-slate-900">{event.title}</h3>
							<p class="text-sm text-slate-500">
								{new Date(event.start).toLocaleDateString()}
							</p>
							{#if event.location}
								<p class="text-sm text-slate-600">{event.location}</p>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>