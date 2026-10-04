<script lang="ts">
	import { enhance } from '$app/forms';
	import { DateTime } from 'luxon';
	import { pushToast } from '$lib/client/toasts';
	import type { ActionData, PageData } from './$types';
	import type { ImportPreviewItem } from './+page.server';

	export let data: PageData;
	export let form: ActionData;

	interface PreviewPayload {
		calendarId: string;
		calendarName: string;
		fileName: string;
		items: ImportPreviewItem[];
		duplicates: number;
		defaultSelection: string[];
		/** One row per uploaded export — the prototype's "What is in them". */
		files: { fileName: string; events: number; duplicates: number }[];
	}

	interface CommitReport {
		calendarId: string;
		calendarName: string;
		imported: number;
		selected: number;
		skipped: number;
		skippedDuplicates: number;
		failed: string[];
		/** What landed, by id — the batch an undo reverses. */
		importedEvents: { id: string; title: string; startIso: string }[];
	}

	interface UndoReport {
		calendarName: string;
		removed: number;
		/** Rows the import wrote that the user has since edited — left alone. */
		kept: { id: string; title: string }[];
		alreadyGone: number;
	}

	/** What ?/preview described, or null when we are not on the preview screen. */
	function previewOf(f: ActionData): PreviewPayload | null {
		// SAFETY: ActionData is the union of both actions' bags; `preview` only
		// exists on the ?/preview one, so the guard narrows it. The declared
		// shape is duplicated above rather than re-derived at runtime.
		return f && 'preview' in f ? (f.preview as PreviewPayload) : null;
	}

	/** What ?/commit landed, or null when there is no commit yet. */
	function reportOf(f: ActionData): CommitReport | null {
		if (!f || !('imported' in f)) return null;
		// SAFETY: ActionData is SvelteKit's untyped union of both action bags;
		// `imported` exists only on the ?/commit one, which is the shape above.
		return f as CommitReport;
	}

	/** What ?/undo put back, or null while the batch is still on the calendar. */
	function undoOf(f: ActionData): UndoReport | null {
		if (!f || !('removed' in f)) return null;
		// SAFETY: `removed` exists only on the ?/undo bag, which is the shape above.
		return f as UndoReport;
	}

	/**
	 * The uploads themselves, not a summary of them: the list can drop one with
	 * its ✕ and the form has to post only what is left. A file input's FileList
	 * cannot be edited, so the kept files are re-appended on submit.
	 */
	let chosenFiles: File[] = [];
	/** What the list draws: a name and a size per chosen file. */
	$: chosen = chosenFiles.map((file) => ({ name: file.name, size: file.size }));
	let fileInput: HTMLInputElement | undefined;
	/** A file is over the drop zone: the zone says so before anything is read. */
	let dragging = false;
	/** Back to the upload form after a finished (or abandoned) flow. */
	let dismissed = false;
	/** True while a POST is in flight (blocks double-submit). */
	let pending = false;
	/** A second in-flight flag: undo must not read as the commit still running. */
	let undoing = false;
	/**
	 * The user's own tick set, or null while they are still following the
	 * server's suggestion. Deriving `picked` from it means the duplicate-aware
	 * default arrives with the preview and needs no wiring.
	 */
	let override: Set<string> | null = null;
	/** Survives a failed commit so a re-try does not lose the selection. */
	let lastPreview: PreviewPayload | null = null;
	/** The commit report survives the undo POST, so the card can report it. */
	let lastReport: CommitReport | null = reportOf(form);

	$: preview = dismissed ? null : (previewOf(form) ?? lastPreview);
	$: report = dismissed ? null : (reportOf(form) ?? lastReport);
	$: undo = dismissed ? null : undoOf(form);
	$: items = preview?.items ?? [];
	$: duplicates = preview?.duplicates ?? 0;
	$: picked = override ?? new Set(preview?.defaultSelection ?? []);
	$: atDefault = override === null;
	$: files = preview?.files ?? [];
	/** What the drop zone says once files are chosen: one name, or a count. */
	$: chosenLabel =
		chosen.length === 0 ? '' : chosen.length === 1 ? chosen[0].name : `${chosen.length} files chosen`;
	$: totals = files.reduce(
		(acc, f) => ({ events: acc.events + f.events, duplicates: acc.duplicates + f.duplicates }),
		{ events: 0, duplicates: 0 }
	);

	/**
	 * Issue 082: the earliest event this commit wrote, as the day the calendar's
	 * `?date=` param takes. An import usually lands in a month the user is not
	 * looking at, so the success screen names one and links there — without it
	 * "the import worked" is not a claim anybody can check.
	 */
	$: earliestImported = report?.importedEvents?.length
		? report.importedEvents.reduce(
				(min, e) => (e.startIso < min ? e.startIso : min),
				report.importedEvents[0].startIso
			)
		: null;
	$: firstImportedDate = earliestImported ? earliestImported.slice(0, 10) : null;
	$: firstImportedDateLabel = firstImportedDate
		? DateTime.fromISO(firstImportedDate).toFormat('ccc, LLL d, yyyy')
		: '';

	function takeFiles(list: FileList | null | undefined) {
		chosenFiles = [...(list ?? [])];
	}

	function onFileChange(e: Event) {
		// SAFETY: this handler is only bound to the .ics file <input>,
		// so currentTarget is always that input element when it fires.
		const input = e.currentTarget as HTMLInputElement;
		takeFiles(input.files);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		takeFiles(e.dataTransfer?.files);
	}

	function removeChosen(name: string) {
		chosenFiles = chosenFiles.filter((file) => file.name !== name);
	}

	/**
	 * Replace whatever the input holds with the files still on the list. The
	 * input is never emptied (that would read as "nothing chosen"), so this is
	 * what keeps a removed file out of the POST.
	 */
	function postChosenFiles(formData: FormData) {
		formData.delete('files');
		for (const file of chosenFiles) formData.append('files', file, file.name);
	}

	function toggle(key: string, on: boolean) {
		const next = new Set(picked);
		if (on) next.add(key);
		else next.delete(key);
		override = next;
	}

	function selectAll() {
		override = new Set(items.map((i) => i.key));
	}

	function selectNone() {
		override = new Set();
	}

	/**
	 * Take one file out of the import, the prototype's per-file ✕. The rows stay
	 * on screen and unticked rather than vanishing: a family dropping three
	 * exports has to be able to change its mind.
	 */
	function dropFile(fileName: string) {
		const next = new Set(picked);
		for (const item of items) {
			if (item.fileName === fileName) next.delete(item.key);
		}
		override = next;
	}

	/** Back to the server's suggestion: duplicates unticked. */
	function useSuggested() {
		override = null;
	}

	/** The rows to hand the commit — exactly what the preview showed. */
	function pickedJson(): string {
		return JSON.stringify(items.filter((i) => picked.has(i.key)));
	}

	function startOver() {
		dismissed = true;
		override = null;
		chosenFiles = [];
		dragging = false;
		if (fileInput) fileInput.value = '';
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

	{#if form?.error}
		<div
			class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
			data-testid="import-error"
		>
			{form.error}
		</div>
	{/if}

	{#if report}
		<!-- Success: what landed, where, and the way to put a bad import back. -->
		<div
			class="mb-6 rounded-xl border border-green-200 bg-green-50 p-5"
			data-testid="import-success"
		>
			{#if undo}
				<!-- Undone: this is the end of the batch, so the undo goes away. -->
				<div data-testid="import-undone">
					<p class="text-lg font-semibold text-green-800">
						Removed {undo.removed} event{undo.removed === 1 ? '' : 's'} from your
						{undo.calendarName}
					</p>
					<ul class="mt-2 space-y-1 text-sm text-green-700">
						{#if undo.kept.length > 0}
							<li>
								Kept {undo.kept.length} you changed since the import:
								{undo.kept.map((k) => k.title).join(', ')}. Open it to undo that yourself.
							</li>
						{/if}
						{#if undo.alreadyGone > 0}
							<li>{undo.alreadyGone} were already off the calendar — nothing to remove.</li>
						{/if}
					</ul>
					<p class="mt-2 text-sm text-green-700">
						Your calendar is back to how it was before this import.
					</p>
				</div>
			{:else}
				<p class="text-lg font-semibold text-green-800">
					Added {report.imported} event{report.imported === 1 ? '' : 's'} to your
					{report.calendarName}
				</p>
				<ul class="mt-2 space-y-1 text-sm text-green-700">
					<li>You ticked {report.selected}.</li>
					{#if firstImportedDate}
						<!-- Issue 082: an import usually lands in some other month, and
						     "it worked" is not checkable without going there. -->
						<li>
							First one landed on
							<a href={`/calendar?date=${firstImportedDate}`} class="underline"
								>{firstImportedDateLabel}</a
							>.
						</li>
					{/if}
					{#if report.skippedDuplicates > 0}
						<li>
							Skipped {report.skippedDuplicates} already on the calendar when we checked again.
						</li>
					{/if}
					{#if report.failed.length > 0}
						<li>Couldn't save: {report.failed.join(', ')}.</li>
					{/if}
				</ul>

				<!-- Undo: the batch this commit wrote, carried back to the server.
				     Nothing here is guessed — the server only removes rows that still
				     look exactly like what this import put there. -->
				{#if report.importedEvents.length > 0}
					<form
						method="POST"
						action="?/undo"
						class="mt-4"
						use:enhance={() => {
							undoing = true;
							return async ({ result, update }) => {
								await update();
								undoing = false;
								if (result.type !== 'success') {
									pushToast({
										message: "Couldn't undo that import — try again, or delete from the calendar."
									});
									return;
								}
								const u = undoOf(form);
								pushToast({
									message: u
										? `Removed ${u.removed} event${u.removed === 1 ? '' : 's'} from your ${u.calendarName}.`
										: 'Nothing was removed.'
								});
							};
						}}
					>
						<input type="hidden" name="calendarId" value={report.calendarId} />
						<input type="hidden" name="batch" value={JSON.stringify(report.importedEvents)} />
						<button
							type="submit"
							disabled={undoing}
							class="rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
						>
							{undoing
								? 'Undoing…'
								: `Undo this import (${report.importedEvents.length} event${report.importedEvents.length === 1 ? '' : 's'})`}
						</button>
						<span class="ml-2 text-xs text-green-700">
							Removes what this import added. Anything you have edited since stays.
						</span>
					</form>
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
					onclick={startOver}
					class="inline-block rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
				>
					Import another file
				</button>
			</div>
		</div>
	{:else if preview}
		<!-- Preview: describe, mark, let the user choose. Nothing is written yet. -->
		<div class="mb-6 rounded-xl border border-slate-200 bg-white p-5">
			<div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
				<h2 class="text-sm font-semibold text-slate-900">
					{preview.items.length} event{preview.items.length === 1 ? '' : 's'} in {preview.fileName}
				</h2>
				<span class="text-xs text-slate-500"
					>Nothing has been added to {preview.calendarName} yet.</span
				>
			</div>

			{#if items.length === 0}
				<p class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
					That file parsed, but every event in it was cancelled or had no title and start time — so
					there is nothing to preview. Try the .ics from inside your export again.
				</p>
			{:else}
				<!--
					"What is in them": one row per export, with its own count and its
					own remove ✕. The prototype draws it before the preview because a
					static file can be counted; the app counts during the parse, so the
					card lands here — still nothing written.
				-->
				<section
					aria-label="What is in them"
					class="mb-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3"
				>
					<div class="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
						<h3 class="text-sm font-semibold text-slate-800">What is in them</h3>
						<span class="text-xs text-slate-500" data-testid="import-totals">
							{totals.events} event{totals.events === 1 ? '' : 's'} · {totals.duplicates}
							likely duplicate{totals.duplicates === 1 ? '' : 's'}
						</span>
					</div>
					<ul class="divide-y divide-slate-100">
						{#each files as file (file.fileName)}
							<li class="flex items-center gap-2 py-2 text-sm">
								<span
									class="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600"
									>ics</span
								>
								<span class="min-w-0 flex-1 truncate font-medium text-slate-800">{file.fileName}</span>
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
									onclick={() => dropFile(file.fileName)}
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

				{#if duplicates > 0}
					<p
						class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
					>
						{duplicates} look{duplicates === 1 ? 's' : ''} like {duplicates === 1
							? 'it is'
							: 'they are'}
						already on {preview.calendarName} — same title, same start. Left unticked; tick
						{duplicates === 1 ? 'it' : 'them'} only if you want a second copy.
					</p>
				{/if}

				<div class="mb-2 flex flex-wrap items-center gap-2 text-xs">
					<button
						type="button"
						onclick={selectAll}
						class="rounded-lg border border-slate-300 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
					>
						Select all
					</button>
					<button
						type="button"
						onclick={selectNone}
						class="rounded-lg border border-slate-300 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
					>
						Select none
					</button>
					{#if !atDefault}
						<button
							type="button"
							onclick={useSuggested}
							class="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 font-medium text-amber-800 hover:bg-amber-100"
						>
							Back to suggested
						</button>
					{/if}
					<span class="ml-auto text-slate-500">{picked.size} of {items.length} selected</span>
				</div>

				<ul
					class="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200"
				>
					{#each items as item (item.key)}
						<li class="flex items-start gap-3 px-3 py-2.5 {item.duplicate ? 'bg-amber-50/60' : ''}">
							<input
								type="checkbox"
								checked={picked.has(item.key)}
								onchange={(e) => toggle(item.key, e.currentTarget.checked)}
								class="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 {item.duplicate
									? 'border-rose-300 bg-rose-100'
									: ''}"
								aria-label="Import {item.title}"
							/>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium {item.duplicate ? 'text-slate-600' : 'text-slate-900'}">
									{item.title}
								</p>
								<p class="text-xs text-slate-600">{item.whenText}</p>
								{#if item.location}
									<p class="truncate text-xs text-slate-500">📍 {item.location}</p>
								{/if}
								{#if item.duplicateReason === 'already-on-calendar'}
									<p class="mt-0.5 text-xs font-medium text-amber-700">
										Likely duplicate — already on {preview.calendarName}
									</p>
								{:else if item.duplicateReason === 'earlier-in-file'}
									<p class="mt-0.5 text-xs font-medium text-amber-700">
										Likely duplicate — appears earlier in this file
									</p>
								{:else if item.duplicateReason === 'earlier-in-import'}
									<p class="mt-0.5 text-xs font-medium text-amber-700">
										Likely duplicate — appears earlier in this import
									</p>
								{/if}
							</div>
							<!-- The prototype badges every row; the words above say why. -->
							{#if item.duplicate}
								<span
									class="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700"
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

		<form
			method="POST"
			action="?/commit"
			class="space-y-4"
			use:enhance={() => {
				pending = true;
				return async ({ result, update }) => {
					pending = false;
					await update();
					if (result.type !== 'success') {
						pushToast({ message: 'Nothing was added — read the note above.' });
						return;
					}
					const r = reportOf(form);
					if (r) lastReport = r;
					pushToast({
						message: r
							? `Added ${r.imported} event${r.imported === 1 ? '' : 's'} to your ${r.calendarName}.`
							: 'Nothing was added.'
					});
				};
			}}
		>
			<input type="hidden" name="calendarId" value={preview.calendarId} />
			<input type="hidden" name="picked" value={pickedJson()} />
			<div class="flex flex-wrap gap-2">
				<button
					type="submit"
					disabled={picked.size === 0 || pending}
					class="flex-1 rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
				>
					{pending
						? 'Adding…'
						: picked.size === 0
							? 'Tick the events you want'
							: `Add ${picked.size} event${picked.size === 1 ? '' : 's'}`}
				</button>
				<a
					href="/calendar/import"
					class="rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
				>
					Start over
				</a>
			</div>
		</form>
	{:else}
		<form
			method="POST"
			action="?/preview"
			enctype="multipart/form-data"
			use:enhance={({ formData }) => {
				postChosenFiles(formData);
				pending = true;
				return async ({ result, update }) => {
					pending = false;
					await update();
					if (result.type !== 'success') {
						pushToast({ message: 'Nothing was added — read the note above.' });
						return;
					}
					const p = previewOf(form);
					if (p) lastPreview = p;
				};
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
					class="w-full rounded-lg border border-slate-300 px-4 py-2.5"
				>
					{#each data.calendars as cal}
						<option value={cal.id}>{cal.name}</option>
					{/each}
				</select>
			</div>

			<!--
				The drop zone `import.html` draws: several exports at once, named,
				with the promise that decides whether anyone trusts it with a whole
				family's calendar.
			-->
			<label
				class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors {dragging
					? 'border-primary-500 bg-primary-50'
					: 'border-slate-300 bg-slate-50 hover:border-primary-400 hover:bg-primary-50/40'}"
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
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
					{chosenLabel || 'Drop or choose .ics files'}
				</span>
				<span class="text-xs text-slate-400"
					>{chosenLabel ? 'Ready to preview' : 'Up to 500 events · max 5 MB each · 10 files'}</span
				>
				<span class="text-xs text-slate-400">
					Files are read in the browser and sent as text — nothing is uploaded to a third party.
				</span>
				<input
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

			{#if chosen.length > 0}
				<ul class="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
					{#each chosen as file, index (file.name + index)}
						<li class="flex items-center gap-2 px-3 py-2 text-sm" data-testid="chosen-file">
							<span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500"
								>ics</span
							>
							<span class="min-w-0 flex-1 truncate font-medium text-slate-800">{file.name}</span>
							<span class="text-xs text-slate-400">{Math.max(1, Math.round(file.size / 1024))} KB</span>
							<button
								type="button"
								onclick={() => removeChosen(file.name)}
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
				disabled={chosen.length === 0 || pending}
				class="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
			>
				{pending ? 'Reading file…' : 'Preview events'}
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
	<section
		aria-label="Where do they go"
		class="mt-4 rounded-xl border border-slate-200 bg-white p-5"
	>
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
			row with <code class="text-xs">recurrence_frequency</code> set — not 18 rows. That is why the family
			calendar stays small no matter how much you import.
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
</div>
