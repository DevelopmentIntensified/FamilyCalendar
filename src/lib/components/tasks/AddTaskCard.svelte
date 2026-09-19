<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import MentionInput from '$lib/components/MentionInput.svelte';
	import TaskQuickAddPreview from '$lib/components/TaskQuickAddPreview.svelte';
	import TaskQuickAddHelp from '$lib/components/TaskQuickAddHelp.svelte';
	import {
		CATEGORY_META,
		SMART_EVENT_TEMPLATES,
		type SmartEventCategory,
		type SmartEventTemplate
	} from '$lib/data/smartEventTemplates';
	import { parseTaskQuickAdd } from '$lib/utils/taskQuickAdd';
	import { splitTaskRecords, type BulkGhost } from '$lib/utils/taskBulk';
	import { submitTaskQuickAdd } from '$lib/client/taskSubmit';
	import { pushToast } from '$lib/client/toasts';

	interface Props {
		familyRoster: { userId: string; firstName: string; lastName: string }[];
		familyId: string | null;
		memberName: (userId: string) => string;
		formatDue: (due: string | null) => string;
		onError: (message: string) => void;
		/** Optimistic insert: page prepends the created task instantly (invalidateAll reconciles). */
		onAdded?: (task: unknown) => void;
		/** Live bulk rows for ghost drafts in the list (empty when not bulk). */
		onBulkRows?: (rows: BulkGhost[]) => void;
		/** Ghost keys created/discarded in the list — excluded from counts. */
		excludedKeys?: string[];
	}

	let {
		familyRoster,
		familyId,
		memberName,
		formatDue,
		onError,
		onAdded = () => {},
		onBulkRows = () => {},
		excludedKeys = []
	}: Props = $props();

	let newTitle = $state('');
	let newDueDate = $state('');
	let newVisibility: 'public' | 'private' = $state('private');
	let showMore = $state(false);
	let adding = $state(false);
	let busyTemplateId: string | null = $state(null);

	/** Live parse of the title being typed, so chips preview what gets captured. */
	let quick = $derived(
		newTitle.trim() ? parseTaskQuickAdd(newTitle, { members: familyRoster }) : null
	);

	// Multi-task: a multi-line paste in the main input becomes bulk mode —
	// one live-parsed row per record, explicit confirm, then bulk create.
	let bulkConfirming = $state(false);
	let bulkAdding = $state(false);
	let bulkDone = $state(0);
	let bulkRows = $derived(
		splitTaskRecords(newTitle)
			.filter((r) => r.text)
			.map((rec) => ({ rec, parsed: parseTaskQuickAdd(rec.text, { members: familyRoster }) }))
	);
	let isBulk = $derived(bulkRows.length > 1);
	let skippedKeys = $state<string[]>([]);
	let activeRows = $derived(
		bulkRows.filter(
			(r) => !skippedKeys.includes(r.rec.text) && !excludedKeys.includes(r.rec.text)
		)
	);
	let bulkBlocked = $derived(
		activeRows.find((r) => r.parsed.unknownMember)?.parsed.unknownMember
	);
	// Any edit re-arms: confirm never survives a changed input. Skipped
	// keys for vanished rows are pruned at the same time.
	$effect(() => {
		newTitle;
		bulkConfirming = false;
		const alive = new Set(bulkRows.map((r) => r.rec.text));
		// Guarded write: filter() mints a new array identity every run,
		// and this effect also reads skippedKeys — an unconditional
		// assignment would retrigger itself forever (effect_update_depth_exceeded).
		const pruned = skippedKeys.filter((k) => alive.has(k));
		if (pruned.length !== skippedKeys.length) skippedKeys = pruned;
	});

	// Ghost feed: the list renders these as editable drafts (not in the DB).
	// untrack is load-bearing: the parent callback reads parent state
	// (ghostGoneKeys/ghostEdits), and without it this effect would subscribe
	// to state the callback itself rewrites → cross-component infinite loop.
	$effect(() => {
		const feed = isBulk
			? bulkRows.map(({ rec, parsed }) => ({
					key: rec.text,
					text: rec.text,
					tag: rec.tag,
					parsed,
					vis: newVisibility,
					dueFb: newDueDate || null
				}))
			: [];
		untrack(() => onBulkRows(feed));
	});

	function toggleSkip(key: string) {
		skippedKeys = skippedKeys.includes(key)
			? skippedKeys.filter((k) => k !== key)
			: [...skippedKeys, key];
	}

	function setQuickDate(days: number) {
		const d = new Date();
		d.setDate(d.getDate() + days);
		const p = (n: number) => String(n).padStart(2, '0');
		newDueDate = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
	}

	async function addTask() {
		if (!newTitle.trim() || adding || bulkAdding) return;
		if (isBulk) {
			if (bulkBlocked) return; // inline alert explains
			if (!bulkConfirming) {
				bulkConfirming = true; // arm: user reviews rows, presses again
				return;
			}
			bulkAdding = true;
			bulkDone = 0;
			const failedKeys = new Set<string>();
			const failedNames: string[] = [];
			const short = (t: string) => (t.length > 40 ? t.slice(0, 40) + '…' : t);
			try {
				for (const { rec, parsed } of activeRows) {
					try {
						const result = await submitTaskQuickAdd({
							title: rec.text,
							dueDateFallback: newDueDate || null,
							visibilityFallback: newVisibility,
							familyId,
							members: familyRoster
						});
						if (result.ok) {
							bulkDone += 1;
							onAdded(result.task);
						} else {
							failedKeys.add(rec.text);
							failedNames.push(short(parsed.title));
						}
					} catch {
						failedKeys.add(rec.text);
						failedNames.push(short(parsed.title));
					}
				}
				const total = activeRows.length;
				if (failedKeys.size) {
					pushToast({ message: `Added ${bulkDone} of ${total} — failed: ${failedNames.join(', ')}.` });
					// Keep only the failures in the composer for retry.
					newTitle = activeRows
						.filter(({ rec }) => failedKeys.has(rec.text))
						.map(({ rec }) => rec.text)
						.join('\n');
				} else {
					pushToast({
						message: total === 1 ? 'Added 1 task.' : `Added ${bulkDone} tasks.`
					});
					newTitle = '';
					newDueDate = '';
				}
				await invalidateAll();
			} finally {
				bulkAdding = false;
				bulkConfirming = false;
			}
			return;
		}
		adding = true;
		try {
			const result = await submitTaskQuickAdd({
				title: newTitle,
				dueDateFallback: newDueDate || null,
				visibilityFallback: newVisibility,
				familyId,
				members: familyRoster
			});
			if (!result.ok) {
				onError(result.error);
				return;
			}
			pushToast({ message: `Added "${result.title}".` });
			newTitle = '';
			newDueDate = '';
			onAdded(result.task);
			await invalidateAll();
		} finally {
			adding = false;
		}
	}

	// Template descriptions explain the cadence; fall back to a
	// generated phrase for templates without one.
	function cadenceNote(t: SmartEventTemplate): string {
		if (t.description) return t.description;
		const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[
			t.recurrenceFrequency
		];
		const units = { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' }[
			t.recurrenceFrequency
		];
		return t.recurrenceInterval > 1 ? `Every ${t.recurrenceInterval} ${units}` : `Every ${unit}`;
	}

	async function addSmartTask(t: SmartEventTemplate) {
		if (busyTemplateId) return;
		busyTemplateId = t.id;
		try {
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: t.name,
					// First occurrence lands today; cadence keeps it coming back.
					dueDate: new Date(new Date().setHours(23, 59, 0, 0)).toISOString(),
					recurrenceFrequency: t.recurrenceFrequency,
					recurrenceInterval: t.recurrenceInterval
				})
			});
			if (res.ok) {
				pushToast({
					message: `Added "${t.name}"${cadenceNote(t) ? ` — ${cadenceNote(t).toLowerCase()}` : ''}.`
				});
				const created = await res.json().catch(() => null);
				if (created?.task) onAdded(created.task);
				await invalidateAll();
			} else {
				const j = await res.json().catch(() => ({}));
				pushToast({
					message: j.error || `Couldn't add "${t.name}" — try again.`
				});
			}
		} catch {
			pushToast({ message: `Couldn't add "${t.name}" — check your connection.` });
		} finally {
			busyTemplateId = null;
		}
	}
</script>

<section
	class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	aria-labelledby="add-task-heading"
>
	<div class="flex items-center justify-between gap-2">
		<div class="min-w-0">
			<h2 id="add-task-heading" class="text-sm font-semibold text-slate-900">New task</h2>
			<p class="text-xs text-slate-400">Type a task, or paste a list</p>
		</div>
		<TaskQuickAddHelp />
	</div>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			addTask();
		}}
		class="mt-3 space-y-2"
	>
		<MentionInput
			bind:value={newTitle}
			members={familyRoster}
			placeholder="Buy milk tomorrow @maya  ·  or paste a list"
			on:submit={addTask}
		/>

		{#if !isBulk && quick}
			<p class="text-xs text-slate-500" aria-live="polite">
				<span class="font-medium text-slate-700">{quick.title}</span>
				{#if quick.dueDate}
					<span> · due {formatDue(quick.dueDate)}</span>
				{:else if newDueDate}
					<span> · due {formatDue(`${newDueDate}T23:59:00`)}</span>
				{/if}
			</p>
			<TaskQuickAddPreview parsed={quick} {memberName} {formatDue} />
		{/if}
		{#if isBulk}
			<p class="text-xs text-slate-500" aria-live="polite">
				{activeRows.length}
				{activeRows.length === 1 ? 'task' : 'tasks'} parsed{bulkConfirming
					? ' — press Confirm to add'
					: ''}
			</p>
			<ul class="max-h-48 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/80 p-1.5" aria-live="polite">
				{#each bulkRows as { rec, parsed } (rec.text)}
					{@const skipped = skippedKeys.includes(rec.text)}
					<li class="flex items-start gap-2 rounded-lg px-1.5 py-1 {skipped ? 'opacity-40' : ''}">
						<input
							type="checkbox"
							checked={!skipped}
							onchange={() => toggleSkip(rec.text)}
							aria-label={skipped ? `Include ${parsed.title}` : `Skip ${parsed.title}`}
							class="mt-1 h-4 w-4 shrink-0 accent-primary-600"
						/>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-slate-800">{parsed.title}</p>
							{#if rec.tag}
								<span class="mr-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] text-slate-500"
									>{rec.tag}</span
								>
							{/if}
							<TaskQuickAddPreview {parsed} {memberName} {formatDue} />
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="flex flex-wrap items-center gap-1.5">
			{#each [[0, 'Today'], [1, 'Tomorrow'], [7, 'Next week']] as [days, label]}
				<button
					type="button"
					onclick={() => setQuickDate(days as number)}
					class="rounded-full px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
				>
					{label}
				</button>
			{/each}
			<input
				type="date"
				bind:value={newDueDate}
				aria-label="Due date"
				class="min-h-[32px] w-[9.5rem] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 focus:border-primary-500 focus:outline-none"
			/>
			<button
				type="button"
				onclick={() => (showMore = !showMore)}
				aria-expanded={showMore}
				class="text-xs text-slate-400 hover:text-slate-600"
			>
				{showMore ? 'Less' : 'More'}
			</button>
			<div class="ml-auto flex items-center gap-1.5">
				{#if bulkConfirming && isBulk}
					<button
						type="button"
						onclick={() => (bulkConfirming = false)}
						class="min-h-[36px] rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-100"
					>
						Back
					</button>
				{/if}
				<button
					type="submit"
					disabled={adding || bulkAdding || !newTitle.trim() || (isBulk && bulkBlocked)}
					class="min-h-[36px] rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
				>
					{bulkAdding
						? `Adding… ${bulkDone}/${activeRows.length}`
						: isBulk
							? bulkConfirming
								? `Confirm ${activeRows.length}`
								: `Add ${activeRows.length}`
							: 'Add'}
				</button>
			</div>
		</div>

		{#if showMore}
			<label class="mt-2 flex items-center gap-2 text-xs text-slate-500">
				Who can see this
				<select
					bind:value={newVisibility}
					aria-label="Who can see this task"
					class="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none"
				>
					<option value="private">Private</option>
					<option value="public">Public</option>
				</select>
			</label>
		{/if}

		{#if bulkBlocked && isBulk}
			<p class="mt-2 text-xs font-medium text-red-600" role="alert">
				Unknown member {bulkBlocked} — fix the spelling before adding.
			</p>
		{/if}
		{#if quick?.unknownMember && !isBulk}
			<p class="mt-2 text-xs font-medium text-red-600" role="alert">
				Unknown member {quick.unknownMember} — check the spelling or pick someone from your family.
			</p>
		{/if}
	</form>

	<!-- Smart task templates -->
	<details class="group mt-3">
		<summary
			class="flex w-fit cursor-pointer select-none items-center gap-1 rounded-full px-2 py-0.5 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
		>
			<span>✨ Smart tasks</span>
			<svg
				class="h-3 w-3 transition-transform group-open:rotate-180"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
		</summary>
		<div class="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
			{#each Object.keys(CATEGORY_META) as cat (cat)}
				{@const templates = SMART_EVENT_TEMPLATES.filter(
					(t) => t.category === (cat as SmartEventCategory)
				)}
				<details class="mb-1 last:mb-0" open={Object.keys(CATEGORY_META).indexOf(cat) === 0}>
					<summary
						class="cursor-pointer select-none rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-white"
					>
						{CATEGORY_META[cat as SmartEventCategory].icon}
						{CATEGORY_META[cat as SmartEventCategory].label}
						<span class="ml-1 text-xs font-normal text-slate-400">({templates.length})</span>
					</summary>
					<div class="mt-1 flex flex-wrap gap-1.5 pl-2">
						{#each templates as template (template.id)}
							<button
								type="button"
								onclick={() => addSmartTask(template)}
								disabled={busyTemplateId === template.id}
								title={cadenceNote(template)}
								class="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50 {CATEGORY_META[
									template.category
								].color}"
							>
								{template.name}
							</button>
						{/each}
					</div>
				</details>
			{/each}
		</div>
	</details>
</section>
