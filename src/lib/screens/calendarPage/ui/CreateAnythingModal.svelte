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

	Layout is legacy `EventFormModal`'s: the tabs ride inside the form's padded
	body (`lead`), and the action bar is the sheet's footer, so it stays put
	while the body scrolls. The Task half and the tasks checklist are their own
	chunks (the Event half never needs tasks' UI barrel), and this whole modal
	loads after the page's `load` event (see `CalendarPage`'s `afterLoad`).
-->
<script lang="ts">
	import { onMount } from 'svelte';
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
	import Sheet from '$lib/kernel/ui/Sheet.svelte';
	import type { CalendarCreateSeed } from '../calendarPage.contract';
	import type { CalendarPageState } from '../calendarPage.state.svelte';

	interface Props {
		state: CalendarPageState;
		seed: CalendarCreateSeed | null;
		start: DateTime | null;
		parseEvent: CalendarParseEvent | null;
		/** The person's `autoParseEventDetails` switch (legacy `=== false` = off). */
		autoParse?: boolean;
		onclose: () => void;
	}

	let { state: page, seed, start, parseEvent, autoParse = true, onclose }: Props = $props();

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

	const shell = page.shell;
	const client = createApiClient();
	const tasksApi = createTasksApi(client);

	const form = new CalendarEventFormState(page.api, parseEvent, {
		event: null,
		calendars: shell.calendars,
		familyMembers: shell.roster.map((member) => ({
			userId: member.userId,
			firstName: member.firstName,
			lastName: member.lastName ?? ''
		})),
		defaultCalendarId: shell.settings.defaultCalendarId,
		initialDate: start?.toISODate() ?? undefined,
		autoParse
	});

	// The timed slot a grid tap names: legacy prefilled the start (and the end
	// of a painted range) instead of making the person type it again.
	if (start && (start.hour !== 0 || start.minute !== 0)) {
		form.patch({ startTime: start.toFormat('HH:mm') });
	}

	// A consumed deep link drives Quick Add and its own parse, exactly as the
	// share target did. Legacy's `goto` re-ran the page load after the seed and
	// rebuilt the form, so only Quick Add and the parse's fields survived: the
	// Description stays empty for a deep link (a selection's text still fills it).
	if (seed) {
		form.quickAdd = seed.quickAdd;
		form.onQuickAddInput(seed.quickAdd);
		if (seed.note) form.patch({ description: '' });
	}

	// A deep link's focus reset: legacy's `goto` blurred whatever held focus, so
	// the sheet opened with nothing focused (the sheet's trap runs before this).
	onMount(() => {
		if (seed?.note && document.activeElement instanceof HTMLElement) document.activeElement.blur();
	});

	async function reportPhrase() {
		await form.reportPhrase(async (phrase, matched) => {
			const result = await client.request('POST', '/api/report-phrase', {
				phrase,
				source: 'event_parse',
				matched
			});
			return result.ok;
		});
	}

	const submitBlockedReason = $derived(
		form.endBeforeStart || form.endDateBeforeStart ? 'End must be after start' : undefined
	);

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

	/**
	 * A create confirms itself and clears the sheet for the next one (legacy
	 * `EventFormModal` cleared `createCount` after every successful POST; the
	 * sheet stays open so "add something else" costs no extra tap).
	 */
	function saved(outcome: CalendarSaveOutcome) {
		page.toasts.success(calendarSavedToast(outcome.body.title));
		form.reset();
		void page.refresh();
	}

	function createAll() {
		void form.createAllParsed().then((outcomes) => {
			if (outcomes.length > 0) {
				page.toasts.success(
					`Created ${outcomes.length} event${outcomes.length === 1 ? '' : 's'}.`
				);
				void page.refresh();
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
			page.toasts.success('Task added.');
			onclose();
			await page.refresh();
		} catch {
			taskError = "Hmm, that didn't take. Try again.";
		} finally {
			taskSaving = false;
		}
	}
</script>

{#snippet tabs()}
	<div
		class="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1"
		role="tablist"
		aria-label="What are you adding?"
	>
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
{/snippet}

<Sheet {title} {subtitle} open onclose={onclose} variant="bottom" testid="create-anything">
	{#if entryType === 'event'}
		<CalendarEventForm
			state={form}
			api={page.api}
			onsave={saved}
			ondeletescope={() => {}}
			oncreateall={createAll}
			onreportphrase={reportPhrase}
			onclose={onclose}
			lead={tabs}
			inlineActions={false}
		>
			{#snippet checklist({ eventId })}
				{#await import('$lib/domains/tasks/ui') then { EventTaskChecklist }}
					<EventTaskChecklist {eventId} />
				{/await}
			{/snippet}
		</CalendarEventForm>
	{:else}
		<form onsubmit={saveTask} class="space-y-3 p-5">
			{@render tabs()}
			{#await import('./TaskFields.svelte') then { default: TaskFields }}
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
			{/await}
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

	{#snippet footer()}
		{#if entryType === 'event'}
			<CalendarEventActionBar
				isEdit={false}
				submitting={form.saving}
				canSubmit={form.canSubmit}
				{submitBlockedReason}
				ondelete={() => {}}
				{onclose}
				onclear={() => form.reset()}
			/>
		{/if}
	{/snippet}
</Sheet>
