<!--
	The one pill / chip: tags, categories and status words. Folds the hand-drawn
	rounded chips in TaskRow, CategoryChip, CategorySelect and TaskDetailModal;
	the base classes are TaskDetailModal's tag chip, the tones are the legacy
	colour pairs (sky for tags, red for danger, slate for neutral).

	A category uses `category` (teal, #280: a category must never read as a tag)
	and `categoryMuted` for the faded completed-row chip; `family` is the indigo
	"Family" span of TaskDetailModal, `doneCount` the orange 🔥 count.

	Doc: src/lib/kernel/README.md
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type PillTone =
		| 'neutral'
		| 'accent'
		| 'warning'
		| 'danger'
		| 'success'
		| 'category'
		| 'categoryMuted'
		| 'family'
		| 'doneCount';

	interface Props {
		tone?: PillTone;
		title?: string;
		testid?: string;
		children: Snippet;
	}

	const TONE_CLASSES: Readonly<Record<PillTone, string>> = {
		neutral: 'bg-slate-100 text-slate-600',
		accent: 'bg-sky-100 text-sky-700',
		warning: 'bg-amber-100 text-amber-700',
		danger: 'bg-red-100 text-red-700',
		success: 'bg-emerald-100 text-emerald-700',
		category: 'bg-teal-100 text-teal-800',
		categoryMuted: 'bg-teal-100/60 text-teal-700/70',
		family: 'bg-indigo-100 text-indigo-700',
		doneCount: 'bg-orange-100 text-orange-600'
	};

	let { tone = 'neutral', title, testid, children }: Props = $props();
</script>

<span
	class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {TONE_CLASSES[
		tone
	]}"
	title={title}
	data-testid={testid}
>
	{@render children()}
</span>
