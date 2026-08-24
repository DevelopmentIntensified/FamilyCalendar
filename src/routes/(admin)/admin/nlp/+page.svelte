<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import type { UnmatchedPhrase } from '$lib/server/db/schema';

	export let data: PageData;

	const sourceLabel: Record<string, string> = {
		event_parse: 'Event parse',
		bulk_edit: 'Bulk edit'
	};

	function groupBySource(phrases: UnmatchedPhrase[]) {
		const groups = new Map<string, UnmatchedPhrase[]>();
		for (const p of phrases) {
			const list = groups.get(p.source) ?? [];
			list.push(p);
			groups.set(p.source, list);
		}
		return [...groups.entries()];
	}
</script>

<div class="min-h-screen bg-slate-50 px-4 py-8">
	<div class="mx-auto max-w-4xl">
		<h1 class="mb-2 text-2xl font-bold text-slate-900">Unmatched Phrases</h1>
		<p class="mb-6 text-sm text-slate-500">
			Instructions the NLP/regex parsers could not handle. Add patterns for the frequent ones.
		</p>

		{#each groupBySource(data.phrases) as [source, phrases]}
			<section class="mb-8">
				<h2 class="mb-3 text-lg font-semibold text-slate-700">
					{sourceLabel[source] ?? source}
					<span class="ml-1 text-sm font-normal text-slate-400">({phrases.length})</span>
				</h2>
				<div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
					<table class="w-full text-left text-sm">
						<thead class="bg-slate-50 text-xs uppercase text-slate-500">
							<tr>
								<th class="px-4 py-2">Phrase</th>
								<th class="px-4 py-2">Count</th>
								<th class="px-4 py-2">First seen</th>
								<th class="px-4 py-2"></th>
							</tr>
						</thead>
						<tbody>
							{#each phrases as phrase (phrase.id)}
								<tr class="border-t border-slate-100">
									<td class="px-4 py-2 font-mono text-slate-800">{phrase.phrase}</td>
									<td class="px-4 py-2">
										<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">{phrase.count}</span>
									</td>
									<td class="px-4 py-2 text-slate-500">
										{new Date(phrase.createdAt).toLocaleDateString()}
									</td>
									<td class="px-4 py-2 text-right">
										<form
											method="POST"
											action="?/resolve"
											use:enhance
											class="inline"
										>
											<input type="hidden" name="id" value={phrase.id} />
											<button
												type="submit"
												class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
											>
												Resolve
											</button>
										</form>
									</td>
								</tr>
							{:else}
								<tr><td colspan="4" class="px-4 py-4 text-center text-slate-400">None</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{:else}
			<p class="text-slate-400">Nothing unmatched. Parsers are holding up.</p>
		{/each}

		{#if data.resolved.length > 0}
			<details class="mt-8">
				<summary class="cursor-pointer text-sm font-medium text-slate-500">
					Resolved ({data.resolved.length})
				</summary>
				<ul class="mt-2 space-y-1 text-sm text-slate-400">
					{#each data.resolved as phrase (phrase.id)}
						<li class="font-mono">{phrase.phrase} <span class="text-xs">×{phrase.count}</span></li>
					{/each}
				</ul>
			</details>
		{/if}
	</div>
</div>
