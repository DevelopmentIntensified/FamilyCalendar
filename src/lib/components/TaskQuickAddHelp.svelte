<script lang="ts">
	/**
	 * Collapsed "?" next to smart-add inputs; expands a compact panel
	 * listing the quick-add scoping shortcuts (issue 019). Reusable —
	 * bills quick-add (#011) reuses it. 320px-safe: the panel wraps and
	 * never forces the row wider than its container.
	 */
	let open = false;
</script>

<span class="relative inline-flex shrink-0 items-center">
	<button
		type="button"
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-label="Quick-add shortcuts help"
		title="Quick-add shortcuts"
		class="flex h-11 w-11 items-center justify-center rounded-full text-base font-bold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
	>
		?
	</button>
	{#if open}
		<div
			class="absolute right-0 top-full z-20 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg"
		>
			<p class="mb-2 text-xs font-semibold text-slate-700">Type these right in the title</p>
			<ul class="space-y-1.5 text-slate-600">
				<li>
					<code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">#public</code>
					/
					<code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">#private</code>
					— who can see it (default public)
				</li>
				<li>
					<code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">@family</code>
					— add it to the family task list
				</li>
				<li>
					<code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">@name</code>
					— assign to a member (e.g. <span class="font-mono text-[11px]">@maya</span>)
				</li>
			</ul>
			<p class="mt-2 border-t border-slate-100 pt-2 text-slate-500">
				Example:
				<span class="font-mono text-[11px] text-slate-700">@family #private clean the garage</span>
			</p>
			<button
				type="button"
				onclick={() => (open = false)}
				class="mt-2 min-h-[44px] rounded-lg px-2 text-xs font-medium text-slate-400 hover:text-slate-600"
			>
				Close
			</button>
		</div>
	{/if}
</span>
