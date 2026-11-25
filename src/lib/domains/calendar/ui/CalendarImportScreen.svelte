<!--
	Import a calendar: `/calendar/import`. Ported from the legacy page's markup;
	the flow itself (files, preview, ticks, commit, undo, toasts) lives in
	`CalendarImportState`, so this component only draws the three states and the
	two statement cards.

	Nothing is written until the commit, and the success card names the EARLIEST
	landed day the way the legacy page did (issue 082).

	Doc: ../../README.md#invariants
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { createApiClient } from '$lib/kernel/client/apiClient';
	import { createToasts } from '$lib/kernel/client/toasts.svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import { createCalendarApi } from '../calendar.api';
	import type { CalendarImportTargetsResponse } from '../calendar.contract';
	import { CalendarImportState } from '../calendar.import.state.svelte';

	interface Props {
		readonly data: CalendarImportTargetsResponse;
	}

	let { data }: Props = $props();

	const toasts = createToasts();
	const flow = new CalendarImportState(createCalendarApi(createApiClient()), toasts, {
		calendars: untrack(() => data.calendars)
	});

	let fileInput = $state<HTMLInputElement | null>(null);

	function onFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		flow.choose(input.files ? Array.from(input.files) : []);
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		flow.dragging = false;
		flow.choose(event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : []);
	}
</script>

<div class="mx-auto max-w-2xl p-6">
	<a
		href="/account#calendar"
		class="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
	>
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
		</svg>
		Back to settings
	</a>

	<h1 class="mb-1 text-2xl font-bold text-slate-900">Import a calendar</h1>
	<p class="mb-6 text-sm text-slate-600">
		Bring events in from Google Calendar, Apple Calendar, Outlook, or any app that exports
		<strong>.ics</strong> files. You'll see every event before anything is added.
	</p>

	{#if flow.error}
		<div
			class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
			data-testid="import-error"
		>
			{flow.error}
		</div>
	{/if}

	{#if flow.region === 'done' && flow.report}
		<!-- Success: what landed, where, and the way to put a bad import back. -->
		<div
			class="mb-6 rounded-xl border border-green-200 bg-green-50 p-5"
			data-testid="import-success"
		>
			{#if flow.undoReport}
				<!-- Undone: this is the end of the batch, so the undo goes away. -->
				<div data-testid="import-undone">
					<p class="text-lg font-semibold text-green-800">
						Removed {flow.undoReport.removed} event{flow.undoReport.removed === 1 ? '' : 's'} from
						your
						{flow.undoReport.calendarName}
					</p>
					<ul class="mt-2 space-y-1 text-sm text-green-700">
						{#if flow.undoReport.kept.length > 0}
							<li>
								Kept {flow.undoReport.kept.length} you changed since the import:
								{flow.undoReport.kept.map((kept) => kept.title).join(', ')}. Open it to undo that
								yourself.
							</li>
						{/if}
						{#if flow.undoReport.alreadyGone > 0}
							<li>
								{flow.undoReport.alreadyGone} were already off the calendar — nothing to remove.
							</li>
						{/if}
					</ul>
					<p class="mt-2 text-sm text-green-700">
						Your calendar is back to how it was before this import.
					</p>
				</div>
			{:else}
				<p class="text-lg font-semibold text-green-800">
					Added {flow.report.imported} event{flow.report.imported === 1 ? '' : 's'} to your
					{flow.report.calendarName}
				</p>
				<ul class="mt-2 space-y-1 text-sm text-green-700">
					<li>You ticked {flow.report.selected}.</li>
					{#if flow.earliestDay}
						<!-- Issue 082: an import usually lands in some other month, and
						     "it worked" is not checkable without going there. -->
						<li>
							First one landed on
							<a href={`/calendar?date=${flow.earliestDay}`} class="underline"
								>{flow.earliestDayLabel}</a
							>.
						</li>
					{/if}
					{#if flow.report.skippedDuplicates > 0}
						<li>
							Skipped {flow.report.skippedDuplicates} already on the calendar when we checked again.
						</li>
					{/if}
					{#if flow.report.failed.length > 0}
						<li>Couldn't save: {flow.report.failed.join(', ')}.</li>
					{/if}
				</ul>

				<!-- Undo: the batch this commit wrote, carried back to the server.
				     Nothing here is guessed — the server only removes rows that still
				     look exactly like what this import put there. -->
				{#if flow.report.importedEvents.length > 0}
					<button
						type="button"
						onclick={() => void flow.undo()}
						disabled={flow.undoing}
						class="mt-4 rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
					>
						{flow.undoing
							? 'Undoing…'
							: `Undo this import (${flow.report.importedEvents.length} event${flow.report
										.importedEvents.length === 1
										? ''
										: 's'})`}
					</button>
					<span class="ml-2 text-xs text-green-700">
						Removes what this import added. Anything you have edited since stays.
					</span>
				{/if}

				<div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
					<strong>Need to pick and choose instead?</strong>
					<a href="/calendar" class="underline">Open the calendar</a>, tap
					<strong>Select</strong> in the toolbar, tick the events and delete them in bulk.
				</div>
			{/if}
			<div class="mt-4 flex flex-wrap gap-2">
				<a
					href="/calendar"
					class="inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
				>
					View your calendar
				</a>
				<button
					type="button"
					onclick={() => {
						flow.startOver();
						if (fileInput) fileInput.value = '';
					}}
					class="inline-block rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
				>
					Import another file
				</button>
			</div>
		</div>
	{:else if flow.region === 'preview' && flow.previewData}
		<!-- Preview: describe, mark, let the user choose. Nothing is written yet. -->
		<div class="mb-6 rounded-xl border border-slate-200 bg-white p-5">
			<div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
				<h2 class="text-sm font-semibold text-slate-900">
					{flow.items.length} event{flow.items.length === 1 ? '' : 's'} in
					{flow.previewData.fileName}
				</h2>
				<span class="text-xs text-slate-500">
					Nothing has been added to {flow.previewData.calendarName} yet.
				</span>
			</div>

			{#if flow.items.length === 0}
				<p class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
					That file parsed, but every event in it was cancelled or had no title and start time — so
					there is nothing to preview. Try the .ics from inside your export again.
				</p>
			{:else}
				<!--
					"What is in them": one row per export, with its own count and its
					own remove ✕. A static file can be counted; the app counts during
					the parse, so the card lands here — still nothing written.
				-->
				<section
					aria-label="What is in them"
					class="mb-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3"
				>
					<div class="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
						<h3 class="text-sm font-semibold text-slate-800">What is in them</h3>
						<span class="text-xs text-slate-500" data-testid="import-totals">
							{flow.totals.events} event{flow.totals.events === 1 ? '' : 's'} · {flow.totals
								.duplicates}
							likely duplicate{flow.totals.duplicates === 1 ? '' : 's'}
						</span>
					</div>
					<ul class="divide-y divide-slate-100">
						{#each flow.filesSummary as file (file.fileName)}
							<li class="flex items-center gap-2 py-2 text-sm">
								<span
									class="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600"
									>ics</span
								>
								<span class="min-w-0 flex-1 truncate font-medium text-slate-800"
									>{file.fileName}</span
								>
								<span class="text-xs tabular-nums text-slate-500"
									>{file.events} event{file.events === 1 ? '' : 's'}</span
								>
								{#if file.duplicates > 0}
									<span class="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700"
										>{file.duplicates} dupe{file.duplicates === 1 ? '' : 's'}</span
									>
								{:else}
									<span
										class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700"
										>no dupes</span
									>
								{/if}
								<button
									type="button"
									onclick={() => flow.dropFile(file.fileName)}
									aria-label="Remove {file.fileName} from this import"
									class="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
								>
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
								</button>
							</li>
						{/each}
					</ul>
					<p class="mt-2 text-xs text-slate-500">Nothing is written until you confirm.</p>
				</section>

				{#if flow.duplicates > 0}
					<p
						class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
					>
						{flow.duplicates} look{flow.duplicates === 1 ? 's' : ''} like {flow.duplicates === 1
							? 'it is'
							: 'they are'}
						already on {flow.previewData.calendarName} — same title, same start. Left unticked;
						tick
						{flow.duplicates === 1 ? 'it' : 'them'} only if you want a second copy.
					</p>
				{/if}

				<div class="mb-2 flex flex-wrap items-center gap-2 text-xs">
					<button
						type="button"
						onclick={() => flow.selectAll()}
						class="rounded-lg border border-slate-300 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
					>
						Select all
					</button>
					<button
						type="button"
						onclick={() => flow.selectNone()}
						class="rounded-lg border border-slate-300 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
					>
						Select none
					</button>
					{#if !flow.atDefault}
						<button
							type="button"
							onclick={() => flow.useSuggested()}
							class="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 font-medium text-amber-800 hover:bg-amber-100"
						>
							Back to suggested
						</button>
					{/if}
					<span class="ml-auto text-slate-500">
						{flow.selectedCount} of {flow.items.length} selected
					</span>
				</div>

				<ul
					class="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200"
				>
					{#each flow.items as entry (entry.key)}
						<li
							class="flex items-start gap-3 px-3 py-2.5 {entry.duplicate ? 'bg-amber-50/60' : ''}"
						>
							<input
								type="checkbox"
								checked={flow.pickedKeys.has(entry.key)}
								onchange={(event) => flow.toggle(entry.key, event.currentTarget.checked)}
								class="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 {entry.duplicate
									? 'border-rose-300 bg-rose-100'
									: ''}"
								aria-label="Import {entry.title}"
							/>
							<div class="min-w-0 flex-1">
								<p
									class="truncate text-sm font-medium {entry.duplicate
										? 'text-slate-600'
										: 'text-slate-900'}"
								>
									{entry.title}
								</p>
								<p class="text-xs text-slate-600">{entry.whenText}</p>
								{#if entry.location}
									<p class="truncate text-xs text-slate-500">📍 {entry.location}</p>
								{/if}
								{#if entry.duplicateReason === 'already-on-calendar'}
									<p class="mt-0.5 text-xs font-medium text-amber-700">
										Likely duplicate — already on {flow.previewData.calendarName}
									</p>
								{:else if entry.duplicateReason === 'earlier-in-file'}
									<p class="mt-0.5 text-xs font-medium text-amber-700">
										Likely duplicate — appears earlier in this file
									</p>
								{:else if entry.duplicateReason === 'earlier-in-import'}
									<p class="mt-0.5 text-xs font-medium text-amber-700">
										Likely duplicate — appears earlier in this import
									</p>
								{/if}
							</div>
							<!-- The prototype badges every row; the words above say why. -->
							{#if entry.duplicate}
								<span class="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700"
									>already there</span
								>
							{:else}
								<span
									class="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700"
									>new</span
								>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				onclick={() => void flow.commit()}
				disabled={flow.selectedCount === 0 || flow.pending}
				class="flex-1 rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
			>
				{flow.pending
					? 'Adding…'
					: flow.selectedCount === 0
						? 'Tick the events you want'
						: `Add ${flow.selectedCount} event${flow.selectedCount === 1 ? '' : 's'}`}
			</button>
			<a
				href="/calendar/import"
				class="rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
			>
				Start over
			</a>
		</div>
	{:else}
		<form
			onsubmit={(event) => {
				event.preventDefault();
				void flow.preview();
			}}
			class="space-y-5"
		>
			<div>
				<label for="calendarId" class="mb-1 block text-sm font-medium text-slate-700"
					>Import into</label
				>
				<select
					id="calendarId"
					name="calendarId"
					required
					bind:value={flow.calendarId}
					class="w-full rounded-lg border border-slate-300 px-4 py-2.5"
				>
					{#each flow.calendars as calendar (calendar.id)}
						<option value={calendar.id}>{calendar.name}</option>
					{/each}
				</select>
			</div>

			<!--
				The drop zone `import.html` draws: several exports at once, named,
				with the promise that decides whether anyone trusts it with a whole
				family's calendar.
			-->
			<label
				class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors {flow.dragging
					? 'border-primary-500 bg-primary-50'
					: 'border-slate-300 bg-slate-50 hover:border-primary-400 hover:bg-primary-50/40'}"
				ondragover={(event) => {
					event.preventDefault();
					flow.dragging = true;
				}}
				ondragleave={() => (flow.dragging = false)}
				ondrop={onDrop}
				data-testid="import-drop-zone"
			>
				<svg class="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1.5"
						d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4"
					/>
				</svg>
				<span class="text-sm font-medium text-slate-700">
					{flow.chosenLabel || 'Drop or choose .ics files'}
				</span>
				<span class="text-xs text-slate-400"
					>{flow.chosenLabel ? 'Ready to preview' : 'Up to 500 events · max 5 MB each · 10 files'}</span
				>
				<span class="text-xs text-slate-400">
					Files are read in the browser and sent as text — nothing is uploaded to a third party.
				</span>
				<input
					id="import-files"
					type="file"
					name="files"
					accept=".ics,text/calendar"
					multiple
					class="sr-only"
					required
					bind:this={fileInput}
					onchange={onFileChange}
				/>
			</label>

			{#if flow.chosen.length > 0}
				<ul class="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
					{#each flow.chosen as file, index (file.name + index)}
						<li class="flex items-center gap-2 px-3 py-2 text-sm" data-testid="chosen-file">
							<span
								class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500"
								>ics</span
							>
							<span class="min-w-0 flex-1 truncate font-medium text-slate-800">{file.name}</span>
							<span class="text-xs text-slate-400"
								>{Math.max(1, Math.round(file.size / 1024))} KB</span
							>
							<button
								type="button"
								onclick={() => flow.removeChosen(file.name)}
								aria-label="Remove {file.name}"
								class="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
							>
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			<button
				type="submit"
				disabled={flow.chosen.length === 0 || flow.pending}
				class="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
			>
				{flow.pending ? 'Reading file…' : 'Preview events'}
			</button>
			<p class="text-center text-xs text-slate-400">
				Nothing is added until you tick the events you want and confirm.
			</p>
		</form>
	{/if}

	<div class="mt-8 rounded-xl border border-slate-200 bg-white p-5">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
			How to export from
		</h2>
		<ul class="space-y-2 text-sm text-slate-600">
			<li>
				<strong class="text-slate-800">Google:</strong> Settings → Import & Export → Export → download
				.zip → unzip → use the .ics inside.
			</li>
			<li><strong class="text-slate-800">Apple:</strong> Calendar app → File → Export → Export…</li>
			<li>
				<strong class="text-slate-800">Outlook:</strong> File → Save Calendar → choose iCalendar format.
			</li>
		</ul>
		<p class="mt-3 text-xs text-slate-400">
			Recurring rules import as daily / weekly / monthly / yearly repeats, including specific
			weekdays (e.g. Mon/Wed/Fri) and occurrence-count limits. Exotic rules (monthly BYDAY, timezone
			definitions outside common US zones) are simplified.
		</p>
	</div>

	<!--
		The side rail `import.html` draws (issue 126). Each card is a statement
		about this import surface rather than a control: what survives the
		conversion, what the plan allows, and why the page has a navbar slot.
	-->
	<section aria-label="Where do they go" class="mt-4 rounded-xl border border-slate-200 bg-white p-5">
		<h2 class="mb-2 text-sm font-semibold text-slate-900">Where do they go</h2>
		<div class="flex flex-wrap gap-1.5">
			<span class="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800"
				>Recurrences kept</span
			>
			<span class="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800"
				>Alarms dropped</span
			>
			<span class="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800"
				>Duplicates skipped</span
			>
		</div>
		<p class="mt-3 text-sm leading-relaxed text-slate-600">
			An iCalendar <code class="text-xs">RRULE</code> becomes one <code class="text-xs">events</code>
			row with <code class="text-xs">recurrence_frequency</code> set — not 18 rows. That is why the
			family calendar stays small no matter how much you import.
		</p>
	</section>

	<section
		aria-label="Plan gate"
		class="mt-4 rounded-xl border border-transparent bg-gradient-to-br from-rose-50 to-white p-5"
	>
		<h2 class="mb-2 text-sm font-semibold text-slate-900">Plan gate</h2>
		<p class="text-sm leading-relaxed text-slate-600">
			Import is gated on <code class="text-xs">subscriptionTypes.exportImportEnabled</code>, read on
			every load. On a plan without it the whole page is replaced by an upsell — but the page is in
			the navbar regardless, so a user on a free plan finds a button that leads to a paywall with no
			warning.
		</p>
	</section>

	<section
		aria-label="Is it a power feature?"
		class="mt-4 rounded-xl border border-slate-200 bg-white p-5"
	>
		<h2 class="mb-2 text-sm font-semibold text-slate-900">Is it a power feature?</h2>
		<p class="text-sm leading-relaxed text-slate-600">
			It is the single biggest reason families switch — everyone arrives from Google Calendar. So it
			earns the navbar slot.
		</p>
		<p class="mt-2 text-sm leading-relaxed text-slate-600">
			But it is a one-time event, and it is treated as a destination. The preview is the actual
			product; the drop zone is just the way in.
		</p>
	</section>

	<Toaster items={toasts.items} ondismiss={toasts.dismiss} />
</div>
