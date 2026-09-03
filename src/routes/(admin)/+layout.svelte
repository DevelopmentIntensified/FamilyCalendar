<script lang="ts">
	import { page } from '$app/stores';

	export let data: { openBugs?: number; openPhrases?: number };

	$: tabs = [
		{ href: '/admin/bugs', label: 'Bug Reports', count: data.openBugs ?? 0, badge: 'bg-red-100 text-red-700' },
		{ href: '/admin/nlp', label: 'Unmatched Phrases', count: data.openPhrases ?? 0, badge: 'bg-slate-200 text-slate-600' }
	];

	$: path = $page.url.pathname;
</script>

<div class="min-h-screen bg-slate-50">
	<header class="border-b border-slate-200 bg-white">
		<div class="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-3">
			<a href="/admin" class="mr-2 text-sm font-bold text-slate-900" aria-label="Admin home">
				🛠 Admin
			</a>
			<nav class="flex items-center gap-1" aria-label="Admin sections">
				{#each tabs as tab}
					<a
						href={tab.href}
						aria-current={path === tab.href || path.startsWith(tab.href + '/') ? 'page' : undefined}
						class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {path === tab.href || path.startsWith(tab.href + '/')
							? 'bg-slate-900 text-white'
							: 'text-slate-600 hover:bg-slate-100'}"
					>
						{tab.label}
						<span class="rounded-full px-1.5 py-0.5 text-[11px] font-bold {path === tab.href || path.startsWith(tab.href + '/') ? 'bg-white/20 text-white' : tab.badge}">
							{tab.count}
						</span>
					</a>
				{/each}
			</nav>
			<a
				href="/calendar"
				class="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
			>
				← Back to app
			</a>
		</div>
	</header>
	<slot />
</div>
