<script lang="ts">
	import type { TaskQuickAddResult } from '$lib/utils/taskQuickAdd';

	const FREQ_NOUN: Record<string, string> = {
		daily: 'day',
		weekly: 'week',
		monthly: 'month',
		yearly: 'year'
	};

	/** Live-parsed quick-add result for the title being typed (null when empty). */
	let { parsed, memberName, formatDue }: {
		parsed: TaskQuickAddResult | null;
		/** Resolve a roster userId to a display name ("Sam Rivera"). */
		memberName: (userId: string) => string;
		/** Format a due ISO date for the chip ("Sep 5" / "Jan 5, 2027"). */
		formatDue: (due: string) => string;
	} = $props();

	const hasInfo = $derived(
		!!parsed &&
			(!!parsed.dueDate ||
				parsed.priority !== 'normal' ||
				!!parsed.assignedTo ||
				parsed.tags.length > 0 ||
				!!parsed.recurrenceFrequency)
	);

	function cadenceLabel(r: TaskQuickAddResult): string {
		const noun = FREQ_NOUN[r.recurrenceFrequency!] ?? r.recurrenceFrequency!;
		return r.recurrenceInterval && r.recurrenceInterval > 1
			? `every ${r.recurrenceInterval} ${noun}s`
			: `every ${noun}`;
	}
</script>

{#if hasInfo && parsed}
	<div class="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] font-medium">
		{#if parsed.dueDate}
			<span class="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600" title="Due date">
				📅 {formatDue(parsed.dueDate)}
			</span>
		{/if}
		{#if parsed.priority !== 'normal'}
			<span
				class="rounded-full px-2 py-0.5 {parsed.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-700'}"
			>
				{parsed.priority === 'high' ? 'high priority' : 'low priority'}
			</span>
		{/if}
		{#if parsed.assignedTo}
			<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
				@ {memberName(parsed.assignedTo)}
			</span>
		{/if}
		{#each parsed.tags as tag (tag)}
			<span class="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">#{tag}</span>
		{/each}
		{#if parsed.recurrenceFrequency}
			<span class="rounded-full bg-purple-100 px-2 py-0.5 text-purple-700">
				🔁 {cadenceLabel(parsed)}
			</span>
		{/if}
	</div>
{/if}