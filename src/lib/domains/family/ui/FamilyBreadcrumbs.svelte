<!--
	The family pages' breadcrumb trail: Calendar › Family › … , with a chevron
	between crumbs, links for every crumb except the last, and the last in bold
	slate-900. Same look as the legacy `$lib/components/Breadcrumbs.svelte` (v2
	may not import that file, rule R14); shell folds this into kernel/ui when it
	rebuilds the shared chrome.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	interface Crumb {
		readonly label: string;
		readonly href?: string;
	}

	interface Props {
		crumbs: readonly Crumb[];
	}

	let { crumbs }: Props = $props();
</script>

<nav class="mb-4 text-sm">
	<ol class="flex flex-wrap items-center space-x-2 text-slate-500">
		{#each crumbs as crumb, i (crumb.label)}
			<li class="flex items-center">
				{#if i > 0}
					<svg class="mx-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5l7 7-7 7"
						/>
					</svg>
				{/if}
				{#if crumb.href && i < crumbs.length - 1}
					<a href={crumb.href} class="transition-colors hover:text-primary-600">
						{crumb.label}
					</a>
				{:else}
					<span class={i === crumbs.length - 1 ? 'font-medium text-slate-900' : ''}>
						{crumb.label}
					</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
