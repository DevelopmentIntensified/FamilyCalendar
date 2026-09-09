<script lang="ts">
	import { invalidateAll } from '$app/navigation';
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
	import { submitTaskQuickAdd } from '$lib/client/taskSubmit';
	import { pushToast } from '$lib/client/toasts';

	interface Props {
		familyRoster: { userId: string; firstName: string; lastName: string }[];
		familyId: string | null;
		memberName: (userId: string) => string;
		formatDue: (due: string | null) => string;
		onError: (message: string) => void;
	}

	let { familyRoster, familyId, memberName, formatDue, onError }: Props = $props();

	let newTitle = $state('');
	let newDueDate = $state('');
	let newVisibility: 'public' | 'private' = $state('public');
	let adding = $state(false);
	let busyTemplateId: string | null = $state(null);

	/** Live parse of the title being typed, so chips preview what gets captured. */
	let quick = $derived(
		newTitle.trim() ? parseTaskQuickAdd(newTitle, { members: familyRoster }) : null
	);

	async function addTask() {
		if (!newTitle.trim()) return;
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
	<h2 id="add-task-heading" class="text-sm font-semibold text-slate-900">Add a task</h2>
	<p class="mt-0.5 text-xs text-slate-400">
		Type naturally — dates, repeats, @assignee and #tags just work
	</p>
	<form
		onsubmit={(e) => {
			e.preventDefault();
			addTask();
		}}
		class="mt-3 flex flex-col gap-2 sm:flex-row"
	>
		<div class="min-w-0 flex-1">
			<div class="flex items-start gap-1">
				<div class="min-w-0 flex-1">
					<MentionInput
						bind:value={newTitle}
						members={familyRoster}
						placeholder="Add a task... e.g. Buy milk tomorrow @maya"
					/>
					<TaskQuickAddPreview parsed={quick} {memberName} {formatDue} />
				</div>
				<TaskQuickAddHelp />
			</div>
			{#if quick?.unknownMember}
				<p class="mt-1 text-xs font-medium text-red-600" role="alert">
					Unknown member {quick.unknownMember} — check the spelling or pick someone from your family.
				</p>
			{/if}
			<p class="mt-1 text-xs text-slate-400">
				Tip: type <span class="font-mono text-slate-500">"every 2 weeks"</span> for a repeat, or
				<span class="font-mono text-slate-500">#tag</span>
				to tag (e.g. <span class="font-mono text-slate-500">#groceries</span>).
			</p>
		</div>
		<div class="flex flex-col gap-2 sm:flex-row">
			<select
				bind:value={newVisibility}
				aria-label="Who can see this task"
				class="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none sm:w-auto"
			>
				<option value="public">🌐 Public</option>
				<option value="private">🔒 Private</option>
			</select>
			<input
				type="date"
				bind:value={newDueDate}
				aria-label="Due date"
				class="min-h-[44px] w-full min-w-0 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-600 sm:w-[10.5rem]"
			/>
			<button
				type="submit"
				disabled={adding || !newTitle.trim()}
				class="min-h-[44px] shrink-0 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
			>
				Add
			</button>
		</div>
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
