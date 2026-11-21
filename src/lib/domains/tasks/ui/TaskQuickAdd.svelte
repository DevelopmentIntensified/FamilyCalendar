<!--
	The "New task" card: one textarea that parses what you type, a live preview of
	what will be captured, the paste-a-list bulk branch (arm, then confirm), the
	due shortcuts, the category/visibility extras and the smart-task templates.

	Parsing owns the grammar; `TaskQuickAddState` owns the behaviour (parse,
	bulk, submit, toasts); this file is the layout and the copy.
	Legacy reference: `components/tasks/AddTaskCard.svelte`.
-->
<script lang="ts">
	import MentionInput from '$lib/kernel/ui/MentionInput.svelte';
	import Pill from '$lib/kernel/ui/Pill.svelte';
	import {
		TASK_SMART_CATEGORIES,
		TASK_SMART_TEMPLATES,
		type TaskSmartCategory
	} from '../tasks.smart.rules';
	import type { TaskQuickAddState } from '../tasks.quickadd.state.svelte';
	import { formatTaskDue } from '../tasks.display.rules';
	import TaskCategoryField from './TaskCategoryField.svelte';

	interface Props {
		state: TaskQuickAddState;
		/** The viewer's category names for the picker. */
		categories: readonly string[];
	}

	let { state, categories }: Props = $props();

	let helpOpen = $state(false);

	const previewDue = $derived(
		state.quick?.dueDate
			? formatTaskDue(state.quick.dueDate)
			: state.dueDate
				? formatTaskDue(`${state.dueDate}T23:59:00`)
				: null
	);
	const categoriesMeta = $derived(
		(Object.keys(TASK_SMART_CATEGORIES) as TaskSmartCategory[]).map((key) => ({
			key,
			meta: TASK_SMART_CATEGORIES[key],
			templates: TASK_SMART_TEMPLATES.filter((template) => template.category === key)
		}))
	);

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void state.add();
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
		<!-- Quick-add shortcuts: the legacy help panel, kept beside its input. -->
		<span class="relative inline-flex shrink-0 items-center">
			<button
				type="button"
				onclick={() => (helpOpen = !helpOpen)}
				aria-expanded={helpOpen}
				aria-label="Quick-add shortcuts help"
				title="Quick-add shortcuts"
				class="flex h-11 w-11 items-center justify-center rounded-full text-base font-bold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
			>
				?
			</button>
			{#if helpOpen}
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
			{/if}
		</span>
	</div>

	<form onsubmit={submit} class="mt-3 space-y-2">
		<MentionInput
			value={state.title}
			people={state.roster.map((member) => ({
				id: member.userId,
				firstName: member.firstName,
				lastName: member.lastName
			}))}
			everyone={{
				header: 'Family',
				insert: '@family',
				label: 'Everyone',
				handle: '@family · the whole family',
				glyph: '👪'
			}}
			onchange={(value) => state.setTitle(value)}
			onsubmit={() => void state.add()}
			placeholder="Buy milk tomorrow @maya  ·  or paste a list"
			aria-label="New task"
		/>

		{#if !state.isBulk && state.quick}
			<p class="text-xs text-slate-500" aria-live="polite">
				<span class="font-medium text-slate-700">{state.quick.title}</span>
				{#if previewDue}<span> · due {previewDue}</span>{/if}
				{#if state.category.trim()}<span> · {state.category.trim()}</span>{/if}
			</p>
			{#if state.quick.hasInfo}
				<div class="flex flex-wrap items-center gap-1">
					{#if state.quick.dueDate}<Pill tone="neutral" size="compact">due {formatTaskDue(state.quick.dueDate)}</Pill>{/if}
					{#if state.quick.priority !== 'normal'}
						<Pill tone="warning" size="compact">{state.quick.priority}</Pill>
					{/if}
					{#if state.quick.assignedTo}
						<Pill tone="accent" size="compact">for {state.memberName(state.quick.assignedTo)}</Pill>
					{/if}
					{#each state.quick.tags as tag (tag)}
						<Pill tone="accent" size="compact">#{tag}</Pill>
					{/each}
					{#if state.quick.recurrenceFrequency}
						<Pill tone="neutral" size="compact">↻ every {state.quick.recurrenceFrequency}</Pill>
					{/if}
					{#if state.quick.visibilityExplicit}
						<Pill tone="neutral" size="compact">{state.quick.visibility}</Pill>
					{/if}
					{#if state.quick.familyTask}<Pill tone="family" size="compact">Family</Pill>{/if}
				</div>
			{/if}
		{/if}

		{#if state.isBulk}
			<p class="text-xs text-slate-500" aria-live="polite">
				{state.activeRows.length}
				{state.activeRows.length === 1 ? 'task' : 'tasks'} parsed{state.bulkConfirming
					? ' — press Confirm to add'
					: ''}
			</p>
			<ul
				class="max-h-48 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/80 p-1.5"
				aria-live="polite"
			>
				{#each state.bulkRows as { record, parsed } (record.text)}
					{@const skipped = state.skippedKeys.includes(record.text)}
					<li class="flex items-start gap-2 rounded-lg px-1.5 py-1 {skipped ? 'opacity-40' : ''}">
						<input
							type="checkbox"
							checked={!skipped}
							onchange={() => state.toggleSkip(record.text)}
							aria-label={skipped ? `Include ${parsed.title}` : `Skip ${parsed.title}`}
							class="mt-1 h-4 w-4 shrink-0 accent-primary-600"
						/>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-slate-800">{parsed.title}</p>
							{#if record.tag}
								<span class="mr-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] text-slate-500"
									>{record.tag}</span
								>
							{/if}
							{#if parsed.dueDate}
								<span class="text-xs text-slate-500">due {formatTaskDue(parsed.dueDate)}</span>
							{/if}
							{#if parsed.unknownMember}
								<p class="mt-0.5 text-[11px] font-medium text-red-600">
									Unknown member {parsed.unknownMember}
								</p>
							{/if}
						</div>
						<div class="flex shrink-0 items-center gap-1">
							<button
								type="button"
								onclick={() => state.createRow(record.text, record.text)}
								disabled={state.rowBusyKey === record.text || !!parsed.unknownMember}
								aria-label={`Create task ${parsed.title}`}
								title="Create this task"
								class="rounded-md px-2 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-40"
							>
								{state.rowBusyKey === record.text ? '…' : 'Create'}
							</button>
							<button
								type="button"
								onclick={() => state.removeRowLines(record.text)}
								aria-label={`Remove ${parsed.title} from the list`}
								title="Remove from the list"
								class="rounded-md px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
							>
								✕
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="flex flex-wrap items-center gap-1.5">
			{#each [{ days: 0, label: 'Today' }, { days: 1, label: 'Tomorrow' }, { days: 7, label: 'Next week' }] as shortcut (shortcut.label)}
				<button
					type="button"
					onclick={() => state.setQuickDate(shortcut.days)}
					class="rounded-full px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
				>
					{shortcut.label}
				</button>
			{/each}
			<input
				type="date"
				value={state.dueDate}
				oninput={(event) => state.setDueDate(event.currentTarget.value)}
				aria-label="Due date"
				class="min-h-[32px] w-[9.5rem] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 focus:border-primary-500 focus:outline-none"
			/>
			<button
				type="button"
				onclick={() => state.toggleShowMore()}
				aria-expanded={state.showMore}
				class="text-xs text-slate-400 hover:text-slate-600"
			>
				{state.showMore ? 'Less' : 'More'}
			</button>
			<div class="ml-auto flex items-center gap-1.5">
				{#if state.bulkConfirming && state.isBulk}
					<button
						type="button"
						onclick={() => state.cancelBulkConfirm()}
						class="min-h-[36px] rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-100"
					>
						Back
					</button>
				{/if}
				<button
					type="submit"
					disabled={state.adding || state.bulkAdding || !state.title.trim() || (state.isBulk && !!state.bulkBlocked)}
					class="min-h-[36px] rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
				>
					{state.bulkAdding
						? `Adding… ${state.bulkDone}/${state.activeRows.length}`
						: state.isBulk
							? state.bulkConfirming
								? `Confirm ${state.activeRows.length}`
								: `Add ${state.activeRows.length}`
							: 'Add'}
				</button>
			</div>
		</div>

		{#if state.showMore}
			<div class="mt-2 max-w-xs">
				<TaskCategoryField
					id="add-task-category"
					value={state.category}
					{categories}
					compact
					onchange={(value) => state.setCategory(value)}
				/>
			</div>
			<label class="mt-2 flex items-center gap-2 text-xs text-slate-500">
				Who can see this
				<select
					value={state.visibility}
					onchange={(event) =>
						state.setVisibility(event.currentTarget.value === 'public' ? 'public' : 'private')}
					aria-label="Who can see this task"
					class="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none"
				>
					<option value="private">Private</option>
					<option value="public">Public</option>
				</select>
			</label>
		{/if}

		{#if state.bulkBlocked && state.isBulk}
			<p class="mt-2 text-xs font-medium text-red-600" role="alert">
				Unknown member {state.bulkBlocked} — fix the spelling before adding.
			</p>
		{/if}
		{#if state.quickUnknownMember && !state.isBulk}
			<p class="mt-2 text-xs font-medium text-red-600" role="alert">
				Unknown member {state.quickUnknownMember} — check the spelling or pick someone from your family.
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
			{#each categoriesMeta as category, index (category.key)}
				<details class="mb-1 last:mb-0" open={index === 0}>
					<summary
						class="cursor-pointer select-none rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-white"
					>
						{category.meta.icon}
						{category.meta.label}
						<span class="ml-1 text-xs font-normal text-slate-400">({category.templates.length})</span>
					</summary>
					<div class="mt-1 flex flex-wrap gap-1.5 pl-2">
						{#each category.templates as template (template.id)}
							<button
								type="button"
								onclick={() => state.addSmartTask(template)}
								disabled={state.busyTemplateId === template.id}
								title={state.cadenceNote(template)}
								class="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50 {category
									.meta.color}"
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
