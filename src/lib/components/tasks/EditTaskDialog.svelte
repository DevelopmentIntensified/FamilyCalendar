<script lang="ts" module>
	/** Draft the dialog edits; handed to onSave on submit. */
	export interface EditDraft {
		title: string;
		notes: string;
		tags: string;
		due: string;
		freq: string;
		interval: number;
		assignedTo: string;
		priority: string;
		visibility: 'public' | 'private';
	}
</script>

<script lang="ts">
	import { trapFocusAction } from '$lib/utils/focusTrap';

	interface TaskLike {
		title: string;
		notes: string | null;
		tags?: string[];
		dueDate: string | null;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
		assignedTo?: string | null;
		priority?: string | null;
		visibility?: string | null;
		userId: string;
	}

	interface Props {
		task: TaskLike;
		currentUserId: string | undefined;
		familyRoster: { userId: string; firstName: string; lastName: string }[];
		saving: boolean;
		onSave: (draft: EditDraft) => void;
		onClose: () => void;
	}

	let { task, currentUserId, familyRoster, saving, onSave, onClose }: Props = $props();

	const FREQ_OPTIONS = [
		{ value: '', label: "Doesn't repeat" },
		{ value: 'daily', label: 'Daily' },
		{ value: 'weekly', label: 'Weekly' },
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'yearly', label: 'Yearly' }
	];
	const FREQ_NOUN = {
		daily: 'day',
		weekly: 'week',
		monthly: 'month',
		yearly: 'year'
	} satisfies Record<string, string>;

	function freqNoun(frequency: string | null | undefined): string | undefined {
		if (
			frequency === 'daily' ||
			frequency === 'weekly' ||
			frequency === 'monthly' ||
			frequency === 'yearly'
		)
			return FREQ_NOUN[frequency];
		return undefined;
	}

	function toInputDate(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		if (isNaN(d.getTime())) return '';
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}

	let draft: EditDraft = $state({
		title: task.title,
		notes: task.notes ?? '',
		tags: (task.tags ?? []).join(', '),
		due: toInputDate(task.dueDate),
		freq: task.recurrenceFrequency ?? '',
		interval: task.recurrenceInterval ?? 1,
		assignedTo: task.assignedTo ?? '',
		priority: task.priority ?? 'normal',
		visibility: task.visibility === 'private' ? 'private' : 'public'
	});

	let isOwner = $derived(task.userId === currentUserId);
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
	onclick={onClose}
	onkeydown={(e) => e.key === 'Escape' && onClose()}
	role="presentation"
>
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<div
		class="w-full max-w-md rounded-xl bg-white shadow-2xl"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
		role="dialog"
		aria-modal="true"
		aria-label="Edit task"
		use:trapFocusAction
	>
		<div class="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
			<h2 class="text-base font-semibold text-slate-900">Edit Task</h2>
			<button
				type="button"
				onclick={onClose}
				class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
				aria-label="Close"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<form
			class="space-y-3 p-5"
			onsubmit={(e) => {
				e.preventDefault();
				onSave(draft);
			}}
		>
			<div>
				<label for="edit-title" class="mb-1 block text-sm font-medium text-slate-700">Title *</label
				>
				<input
					id="edit-title"
					type="text"
					bind:value={draft.title}
					required
					class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
				/>
			</div>

			<div>
				<label for="edit-notes" class="mb-1 block text-sm font-medium text-slate-700">Notes</label>
				<textarea
					id="edit-notes"
					bind:value={draft.notes}
					rows="2"
					class="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
				></textarea>
			</div>

			<div>
				<label for="edit-tags" class="mb-1 block text-sm font-medium text-slate-700">Tags</label>
				<input
					id="edit-tags"
					type="text"
					bind:value={draft.tags}
					placeholder="e.g. groceries, home (comma separated)"
					class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
				/>
				<p class="mt-1 text-xs text-slate-400">Separate tags with commas.</p>
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<div>
					<label for="edit-due" class="mb-1 block text-sm font-medium text-slate-700"
						>Due date</label
					>
					<input
						id="edit-due"
						type="date"
						bind:value={draft.due}
						class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
					/>
				</div>
				<div>
					<label for="edit-priority" class="mb-1 block text-sm font-medium text-slate-700"
						>Priority</label
					>
					<select
						id="edit-priority"
						bind:value={draft.priority}
						class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
					>
						<option value="low">Low</option>
						<option value="normal">Normal</option>
						<option value="high">High</option>
					</select>
				</div>
				<div>
					<label for="edit-freq" class="mb-1 block text-sm font-medium text-slate-700"
						>Repeats</label
					>
					<select
						id="edit-freq"
						bind:value={draft.freq}
						class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
					>
						{#each FREQ_OPTIONS as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</div>
			</div>

			{#if draft.freq}
				<div class="flex items-center gap-2 rounded-lg bg-purple-50 px-3 py-2">
					<span class="text-sm text-purple-800">Every</span>
					<input
						type="number"
						min="1"
						max="365"
						bind:value={draft.interval}
						aria-label="Repeat interval"
						class="w-16 rounded-lg border border-purple-200 px-2 py-1 text-sm focus:border-purple-400 focus:outline-none"
					/>
					<span class="text-sm text-purple-800"
						>{freqNoun(draft.freq)}{draft.interval > 1 ? 's' : ''}</span
					>
				</div>
			{/if}

			{#if isOwner}
				<div>
					<label for="edit-visibility" class="mb-1 block text-sm font-medium text-slate-700"
						>Who can see this</label
					>
					<select
						id="edit-visibility"
						bind:value={draft.visibility}
						class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
					>
						<option value="public">🌐 Public — family can see it (read-only)</option>
						<option value="private">🔒 Private — only you and the assignee</option>
					</select>
				</div>
			{/if}

			{#if familyRoster.length > 0}
				<div>
					<label for="edit-assignee" class="mb-1 block text-sm font-medium text-slate-700"
						>Assign to</label
					>
					<select
						id="edit-assignee"
						bind:value={draft.assignedTo}
						class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
					>
						<option value="">Unassigned</option>
						<option value={currentUserId}>Me</option>
						{#each familyRoster.filter((m) => m.userId !== currentUserId) as m (m.userId)}
							<option value={m.userId}>{m.firstName} {m.lastName}</option>
						{/each}
					</select>
					{#if draft.assignedTo && draft.assignedTo !== currentUserId}
						<p class="mt-1 text-xs text-slate-400">They'll see it as pending until they accept.</p>
					{/if}
				</div>
			{/if}

			{#if draft.freq}
				<p class="text-xs text-slate-400">
					Completing it rolls the due date forward automatically.
				</p>
			{/if}

			<div class="flex justify-end gap-2 pt-1">
				<button
					type="button"
					onclick={onClose}
					class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={saving || !draft.title.trim()}
					class="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
				>
					{saving ? 'Saving…' : 'Save'}
				</button>
			</div>
		</form>
	</div>
</div>
