<script lang="ts">
	export let crumbs: { label: string; href?: string }[];
</script>

<nav class="mb-4 text-sm">
	<ol class="flex items-center space-x-2 text-slate-500">
		{#each crumbs as crumb, i}
			<li class="flex items-center">
				{#if i > 0}
					<svg class="mx-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				{/if}
				{#if crumb.href && i < crumbs.length - 1}
					<a href={crumb.href} class="hover:text-primary-600 transition-colors">
						{crumb.label}
					</a>
				{:else}
					<span class="{i === crumbs.length - 1 ? 'text-slate-900 font-medium' : ''}">
						{crumb.label}
					</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
