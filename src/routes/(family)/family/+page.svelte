<script lang="ts">
	import type { PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	export let data: PageData;
	let families = data.families;
</script>

<div class="min-h-screen bg-slate-50">
	<div class="mx-auto max-w-4xl px-3 py-4 pb-20 sm:px-4">
		<Breadcrumbs crumbs={[{ label: 'Calendar', href: '/calendar' }, { label: 'Family' }]} />

		<!-- Hero card -->
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
				</div>
				<a
					href="/family/create"
					class="inline-flex min-h-11 items-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
				>
					Create New Family
				</a>
			</div>
		</section>

		{#if families.length > 0}
			<!-- Families card -->
			<section
				class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
				aria-labelledby="families-list-heading"
			>
				<h2 id="families-list-heading" class="text-sm font-semibold text-slate-900">
					Your families
				</h2>
				<p class="mt-0.5 text-xs text-slate-400">Open a family to see members and settings</p>
				<ul class="mt-3 space-y-2">
					{#each families as family (family.id)}
						<li>
							<a
								href="/family/{family.id}"
								class="flex min-h-11 items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 transition-colors hover:bg-slate-100"
							>
								{#if family.color}
									<div
										class="h-10 w-10 shrink-0 rounded-full"
										style="background-color: {family.color}"
										aria-hidden="true"
									></div>
								{:else}
									<div
										class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600"
										aria-hidden="true"
									>
										{(family.name || 'F').charAt(0).toUpperCase()}
									</div>
								{/if}
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-semibold text-slate-900">{family.name}</p>
									<p class="truncate text-xs text-slate-400">
										{family.memberCount}
										member{family.memberCount !== 1 ? 's' : ''}
									</p>
								</div>
								<span class="shrink-0 text-xs font-medium text-primary-600">Open</span>
								<svg
									class="h-4 w-4 shrink-0 text-slate-300"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 5l7 7-7 7"
									/>
								</svg>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{:else}
			<!-- Empty state -->
			<section
				class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
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

		<!-- Invitations card -->
		<section
			class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
			aria-labelledby="families-invitations-heading"
		>
			<h2 id="families-invitations-heading" class="text-sm font-semibold text-slate-900">
				Invitations
			</h2>
			<p class="mt-0.5 text-xs text-slate-400">Families you've been invited to</p>
			<div class="mt-3 space-y-1.5">
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
					<svg
						class="h-4 w-4 shrink-0 text-slate-300"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5l7 7-7 7"
						/>
					</svg>
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
					<svg
						class="h-4 w-4 shrink-0 text-slate-300"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5l7 7-7 7"
						/>
					</svg>
				</a>
			</div>
		</section>
	</div>
</div>
