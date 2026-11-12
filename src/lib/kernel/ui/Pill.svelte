<!--
	The one pill / chip: tags, categories and status words. Folds the hand-drawn
	rounded chips in TaskRow, CategoryChip and TaskDetailModal (CategorySelect
	has no chip — it is a native `<select>`); the base classes are
	TaskDetailModal's tag chip, the tones are the legacy colour pairs (sky for
	tags, red for danger, slate for neutral).

	A category uses `category` (teal, #280: a category must never read as a tag)
	and `categoryMuted` for the faded completed-row chip; `family` is the indigo
	"Family" span of TaskDetailModal, `doneCount` the orange 🔥 count, bold like
	the modal's "Done 3× so far".

	`size="compact"` is the row chip (CategoryChip, TaskRow's pending/late/focus
	pills, TaskCompletedRow's tags): `text-[10px]` in `px-1.5`. `truncate` caps a
	long name at `max-w-[10rem]` and clips it, as CategoryChip did.

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

	type PillSize = 'default' | 'compact';

	interface Props {
		tone?: PillTone;
		size?: PillSize;
		/** Clip a long name to `max-w-[10rem]` instead of growing the row. */
		truncate?: boolean;
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

	const SIZE_CLASSES: Readonly<Record<PillSize, string>> = {
		default: 'px-2 py-0.5 text-xs',
		compact: 'px-1.5 py-0.5 text-[10px]'
	};

	let {
		tone = 'neutral',
		size = 'default',
		truncate = false,
		title,
		testid,
		children
	}: Props = $props();

	/** One weight, not two: `doneCount` is bold, every other tone medium. */
	const classes = $derived(
		[
			'inline-flex items-center rounded-full',
			SIZE_CLASSES[size],
			tone === 'doneCount' ? 'font-bold' : 'font-medium',
			TONE_CLASSES[tone],
			truncate ? 'max-w-[10rem] truncate shrink-0' : ''
		].join(' ')
	);
</script>

<span class={classes} title={title} data-testid={testid}>
	{@render children()}
</span>
