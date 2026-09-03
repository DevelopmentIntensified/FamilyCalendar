<script lang="ts">
	export let data: { openBugs?: number; openPhrases?: number };
</script>

<svelte:head>
	<title>Admin · Family Planz</title>
</svelte:head>

<div class="px-4 py-8">
	<div class="mx-auto max-w-4xl">
		<h1 class="mb-2 text-2xl font-bold text-slate-900">Admin</h1>
		<p class="mb-6 text-sm text-slate-500">Triage user feedback and parser gaps.</p>
		<div class="grid gap-4 sm:grid-cols-2">
			<a
				href="/admin/bugs"
				class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
			>
				<div class="flex items-center justify-between">
					<h2 class="text-base font-semibold text-slate-900">🐞 Bug Reports</h2>
					<span class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
						{data.openBugs ?? 0} open
					</span>
				</div>
				<p class="mt-1 text-sm text-slate-500">User-submitted reports, newest first. Resolve what's fixed.</p>
			</a>
			<a
				href="/admin/nlp"
				class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
			>
				<div class="flex items-center justify-between">
					<h2 class="text-base font-semibold text-slate-900">💬 Unmatched Phrases</h2>
					<span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">
						{data.openPhrases ?? 0} open
					</span>
				</div>
				<p class="mt-1 text-sm text-slate-500">Instructions the parsers couldn't handle. Add patterns for frequent ones.</p>
			</a>
		</div>
	</div>
</div>
