<script lang="ts">
	/**
	 * Event checklist: real API-backed rows when editing an event,
	 * pending titles when creating (parent binds `pendingTitles` and
	 * flushes them to the API after the event exists).
	 */
	export let eventId: string | null = null;
	export let pendingTitles: string[] = [];

	// Two-way: lets the parent warn before deleting an event with tasks.
	export let attachedCount = 0;

	let eventTasks: any[] = [];
	let showChecklistInput = false;
	let checklistTitle = '';
	let checklistBusy = false;
	let tasksLoadedFor: string | null = null;

	$: attachedCount = eventTasks.length;

	$: if (eventId && eventId !== tasksLoadedFor) {
		tasksLoadedFor = eventId;
		fetchTasks(eventId);
	}

	async function fetchTasks(id: string) {
		try {
			const res = await fetch(`/api/tasks?eventId=${id}`);
			if (res.ok) {
				eventTasks = (await res.json()).tasks ?? [];
			}
		} catch (e) {
			console.error('Failed to load event tasks:', e);
		}
	}

	function addItem() {
		const title = checklistTitle.trim();
		if (!title || checklistBusy) return;
		if (!eventId) {
			pendingTitles = [...pendingTitles, title];
			checklistTitle = '';
			return;
		}
		createRow(title);
	}

	async function createRow(title: string) {
		checklistBusy = true;
		try {
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title, eventId })
			});
			if (res.ok) {
				const json = await res.json();
				eventTasks = [...eventTasks, json.task];
				checklistTitle = '';
			}
		} finally {
			checklistBusy = false;
		}
	}

	function removePending(index: number) {
		pendingTitles = pendingTitles.filter((_, i) => i !== index);
	}

	async function toggleItem(task: any) {
		if (checklistBusy) return;
		checklistBusy = true;
		try {
			const res = await fetch(`/api/tasks/${task.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ toggleComplete: true })
			});
			if (res.ok) {
				const json = await res.json();
				eventTasks = eventTasks.map((t) => (t.id === task.id ? json.task : t));
			}
		} finally {
			checklistBusy = false;
		}
	}

	async function deleteItem(taskId: string) {
		if (checklistBusy) return;
		checklistBusy = true;
		try {
			const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
			if (res.ok) {
				eventTasks = eventTasks.filter((t) => t.id !== taskId);
			}
		} finally {
			checklistBusy = false;
		}
	}
</script>

<div class="border-t border-slate-100 px-5 py-3">
	<div class="mb-1 flex items-center justify-between">
		<h4 class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
			Checklist{#if eventTasks.length > 0} · {eventTasks.filter((t) => t.completedAt).length}/{eventTasks.length}{/if}
		</h4>
		{#if !showChecklistInput}
			<button
				type="button"
				class="rounded px-1.5 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary-600"
				on:click={() => (showChecklistInput = true)}
			>
				+ Add task
			</button>
		{/if}
	</div>

	<ul class="space-y-0.5">
		{#each pendingTitles as title, i (i)}
			<li class="flex items-center gap-2 rounded px-1 py-1">
				<span class="h-4 w-4 shrink-0 rounded-full border border-dashed border-slate-300"></span>
				<span class="min-w-0 flex-1 truncate text-sm text-slate-700">{title}</span>
				<button
					type="button"
					class="shrink-0 rounded p-0.5 text-slate-300 hover:text-red-500"
					aria-label="Remove task"
					on:click={() => removePending(i)}
				>
					<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</li>
		{/each}
		{#each eventTasks as task (task.id)}
			<li class="group flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
				<button
					type="button"
					disabled={checklistBusy}
					on:click={() => toggleItem(task)}
					class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border {task.completedAt
						? 'border-primary-500 bg-primary-500 text-white'
						: 'border-slate-300 hover:border-primary-400'}"
					aria-label={task.completedAt ? 'Mark incomplete' : 'Complete'}
				>
					{#if task.completedAt}
						<svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					{/if}
				</button>
				<span class="min-w-0 flex-1 truncate text-sm {task.completedAt ? 'text-slate-400 line-through' : 'text-slate-700'}">
					{task.title}
				</span>
				<button
					type="button"
					disabled={checklistBusy}
					on:click={() => deleteItem(task.id)}
					class="shrink-0 rounded p-0.5 text-slate-300 opacity-0 transition-all hover:text-red-500 group-hover:opacity-100"
					aria-label="Remove task"
				>
					<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</li>
		{/each}
	</ul>

	{#if showChecklistInput}
		<div class="mt-1.5 flex gap-1.5">
			<input
				type="text"
				bind:value={checklistTitle}
				placeholder="Add a task..."
				on:keydown={(e) => e.key === 'Enter' && addItem()}
				class="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
			/>
			<button
				type="button"
				disabled={checklistBusy || !checklistTitle.trim()}
				on:click={addItem}
				class="rounded-lg bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
			>
				Add
			</button>
			<button
				type="button"
				class="rounded-lg px-2 text-sm text-slate-400 hover:text-slate-600"
				on:click={() => {
					showChecklistInput = false;
					checklistTitle = '';
				}}
			>
				Done
			</button>
		</div>
	{/if}
</div>
