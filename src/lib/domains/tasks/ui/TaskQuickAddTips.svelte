<!--
	The "?" popover body beside the New task title: every phrase the quick-add
	parser understands (`#public`, `@family`, `@name`, `#tag`, due dates,
	repeats, priority). `TaskQuickAdd` imports it lazily when the "?" opens, so
	the closed button every tasks page ships carries no popover markup (ADR 0010).

	The shorter calendar-sheet variant is `TaskQuickAddHelp.svelte`.
-->
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
		<li>
			<code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">#tag</code>
			— tag it, for the tag filter
		</li>
		<li>
			<code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">tomorrow</code>,
			<code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">next fri</code>
			— due dates
		</li>
		<li>
			<code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">every 2 weeks</code>
			— repeat it
		</li>
		<li>
			<code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">high</code>
			priority — or <span class="font-mono text-[11px]">low</span>
		</li>
	</ul>
</div>
