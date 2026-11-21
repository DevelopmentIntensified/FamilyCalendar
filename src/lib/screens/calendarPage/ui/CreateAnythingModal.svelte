<!--
	The create-anything modal (legacy `EventFormModal`'s create half): one sheet
	with two tabs — Event and Task — because "add something" is one intent with
	two shapes.

	The Event half IS calendar's form (`CalendarEventFormState` +
	`CalendarEventForm` + `CalendarEventActionBar`), with the tasks checklist as
	the snippet calendar's sheet takes; this screen composes, it does not own the
	form. The Task half is this screen's (`TaskFields`) and posts through tasks'
	client api. Categories load on the Task tab's first open (owner Q-101 B), so
	a visit that never opens it pays nothing.

	Deep links land here: `?quickadd=`/the share target seed the Quick Add field
	(and say so through `state.shareNote`), a grid tap seeds the date and time.
-->
<script lang="ts">
	import type { DateTime } from 'luxon';
	import { createApiClient } from '$lib/kernel/client/apiClient';
	import { createTasksApi } from '$lib/domains/tasks/index';
	import {
		CalendarEventActionBar,
		CalendarEventForm,
		CalendarEventFormState,
		calendarSavedToast,
		type CalendarParseEvent,
		type CalendarSaveOutcome
	} from '$lib/domains/calendar/ui';
	import { EventTaskChecklist } from '$lib/domains/tasks/ui';
	import Sheet from '$lib/kernel/ui/Sheet.svelte';
	import type { CalendarCreateSeed } from '../calendarPage.contract';
	import type { CalendarPageState } from '../calendarPage.state.svelte';
	import TaskFields from './TaskFields.svelte';

	interface Props {
		state: CalendarPageState;
		seed: CalendarCreateSeed | null;
		start: DateTime | null;
		parseEvent: CalendarParseEvent | null;
		onclose: () => void;
	}

	let { state, seed, start, parseEvent, onclose }: Props = $props();

	type EntryType = 'event' | 'task';
	let entryType = $state<EntryType>('event');
	let taskTitle = $state('');
	let taskVisibility = $state('public');
	let taskDueDate = $state(start?.toISODate() ?? '');
	let taskCategory = $state('');
	let taskError = $state<string | null>(null);
	let taskSaving = $state(false);
	let categories = $state<string[]>([]);
	let categoriesLoading = $state(false);

	const shell = state.shell;
	const tasksApi = createTasksApi(createApiClient());

	const form = new CalendarEventFormState(state.api, parseEvent, {
		event: null,
		calendars: shell.calendars,
		familyMembers: shell.roster.map((member) => ({
			userId: member.userId,
			firstName: member.firstName,
			lastName: member.lastName ?? ''
		})),
		defaultCalendarId: shell.settings.defaultCalendarId,
		initialDate: start?.toISODate(),
		autoParse: true
	});

	// The timed slot a grid tap names: legacy prefilled the start (and the end
	// of a painted range) instead of making the person type it again.
	if (start && (start.hour !== 0 || start.minute !== 0)) {
		form.patch({ startTime: start.toFormat('HH:mm') });
	}

	// A consumed deep link drives Quick Add and its own parse, exactly as the
	// share target did.
	if (seed) {
		form.quickAdd = seed.quickAdd;
		form.onQuickAddInput(seed.quickAdd);
	}

	const title = $derived(entryType === 'task' ? 'Add Task' : 'Create New Event');
	const subtitle = $derived(
		entryType === 'task'
			? 'A completable item — no event needed'
			: entryType === 'event'
				? "Type naturally, we'll fill in the rest"
				: undefined
	);

	/** The Task tab's categories are one read, on its first open (Q-101 B). */
	async function loadCategories() {
		if (categories.length > 0 || categoriesLoading) return;
		categoriesLoading = true;
		try {
			const result = await tasksApi.listCategories();
			if (result.ok) categories = result.data.categories.map((row) => row.name);
		} finally {
			categoriesLoading = false;
		}
	}

	function switchTo(type: EntryType) {
		entryType = type;
		if (type === 'task') void loadCategories();
	}

	function saved(outcome: CalendarSaveOutcome) {
		state.toasts.success(calendarSavedToast(outcome.body.title));
		void state.refresh();
	}

	function createAll() {
		void form.createAllParsed().then((outcomes) => {
			if (outcomes.length > 0) {
				state.toasts.success(
					`Created ${outcomes.length} event${outcomes.length === 1 ? '' : 's'}.`
				);
				void state.refresh();
			}
		});
	}

	async function saveTask(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = taskTitle.trim();
		if (!trimmed) {
			taskError = 'Title is required';
			return;
		}
		taskSaving = true;
		taskError = null;
		try {
			const result = await tasksApi.create({
				title: trimmed,
				notes: null,
				dueDate: taskDueDate || null,
				visibility: taskVisibility === 'private' ? 'private' : 'public',
				category: taskCategory.trim() || undefined
			});
			if (!result.ok) {
				taskError = result.error;
				return;
			}
			state.toasts.success('Task added.');
			onclose();
			await state.refresh();
		} catch {
			taskError = "Hmm, that didn't take. Try again.";
		} finally {
			taskSaving = false;
		}
	}
</script>

<Sheet {title} {subtitle} open onclose={onclose} variant="bottom" testid="create-anything">
	<div class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="What are you adding?">
		<button
			type="button"
			role="tab"
			aria-selected={entryType === 'event'}
			onclick={() => switchTo('event')}
			class="rounded-md px-3 py-1.5 text-sm font-medium transition-all {entryType === 'event'
				? 'bg-white text-slate-900 shadow-sm'
				: 'text-slate-500 hover:text-slate-700'}"
		>
			Event
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={entryType === 'task'}
			onclick={() => switchTo('task')}
			class="rounded-md px-3 py-1.5 text-sm font-medium transition-all {entryType === 'task'
				? 'bg-white text-slate-900 shadow-sm'
				: 'text-slate-500 hover:text-slate-700'}"
		>
			Task
		</button>
	</div>

	{#if entryType === 'event'}
		<CalendarEventForm
			state={form}
			api={state.api}
			onsave={saved}
			ondeletescope={() => {}}
			oncreateall={createAll}
			onclose={onclose}
		>
			{#snippet checklist({ eventId })}
				<EventTaskChecklist {eventId} />
			{/snippet}
		</CalendarEventForm>
		<CalendarEventActionBar
			isEdit={false}
			submitting={form.saving}
			canSubmit={form.canSubmit}
			submitBlockedReason={form.endBeforeStart ? 'End must be after start' : undefined}
			ondelete={() => {}}
			{onclose}
			onclear={() => form.reset()}
		/>
	{:else}
		<form onsubmit={saveTask} class="space-y-3">
			<TaskFields
				title={taskTitle}
				visibility={taskVisibility}
				dueDate={taskDueDate}
				category={taskCategory}
				{categories}
				error={taskError}
				ontitle={(value) => (taskTitle = value)}
				onvisibility={(value) => (taskVisibility = value)}
				ondueDate={(value) => (taskDueDate = value)}
				oncategory={(value) => (taskCategory = value)}
			/>
			{#if categoriesLoading}
				<p class="text-xs text-slate-400" role="status">Loading your categories…</p>
			{/if}
			<div class="flex justify-end gap-2 pt-1">
				<button
					type="button"
					onclick={onclose}
					class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={taskSaving || !taskTitle.trim()}
					class="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{taskSaving ? 'Adding…' : 'Add Task'}
				</button>
			</div>
		</form>
	{/if}
</Sheet>
