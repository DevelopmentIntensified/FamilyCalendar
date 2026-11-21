<!--
	The detail page's breadcrumb: Calendar › Family › {family name}. Legacy
	rendered `$lib/components/Breadcrumbs.svelte` inline (the `(family)` layout
	provides Navbar/BottomNav/Toaster only), so the screen carries its own copy
	until `shell` exports page chrome. Look is the legacy component's, rebuilt
	here with no dependency on another screen (rule R1).
-->
<script lang="ts">
	import type { FamilyHubModel } from '../familyHub.contract';

	interface Props {
		family: FamilyHubModel['family'];
	}

	let { family }: Props = $props();

	const crumbs = $derived([
		{ label: 'Calendar', href: '/calendar' },
		{ label: 'Family', href: '/family' },
		{ label: family.name || 'Family' }
	]);
</script>

<nav class="mb-4 text-sm" aria-label="Breadcrumb">
	<ol class="flex flex-wrap items-center space-x-2 text-slate-500">
		{#each crumbs as crumb, index (crumb.label)}
			<li class="flex items-center">
				{#if index > 0}
					<svg
						class="mx-2 h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				{/if}
				{#if crumb.href && index < crumbs.length - 1}
					<a href={crumb.href} class="transition-colors hover:text-primary-600">{crumb.label}</a>
				{:else}
					<span class={index === crumbs.length - 1 ? 'font-medium text-slate-900' : ''}>
						{crumb.label}
					</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
