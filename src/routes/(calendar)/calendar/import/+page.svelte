<script lang="ts">
	import { enhance } from '$app/forms';
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
	}

	interface CommitReport {
		calendarName: string;
		imported: number;
		selected: number;
		skipped: number;
		skippedDuplicates: number;
		failed: string[];
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

	let fileName = '';
	let fileInput: HTMLInputElement | undefined;
	/** Back to the upload form after a finished (or abandoned) flow. */
	let dismissed = false;
	/** True while a POST is in flight (blocks double-submit). */
	let pending = false;
	/**
	 * The user's own tick set, or null while they are still following the
	 * server's suggestion. Deriving `picked` from it means the duplicate-aware
	 * default arrives with the preview and needs no wiring.
	 */
	let override: Set<string> | null = null;
	/** Survives a failed commit so a re-try does not lose the selection. */
	let lastPreview: PreviewPayload | null = null;

	$: preview = dismissed ? null : (previewOf(form) ?? lastPreview);
	$: report = dismissed ? null : reportOf(form);
	$: items = preview?.items ?? [];
	$: duplicates = preview?.duplicates ?? 0;
	$: picked = override ?? new Set(preview?.defaultSelection ?? []);
	$: atDefault = override === null;

	function onFileChange(e: Event) {
		// SAFETY: this handler is only bound to the .ics file <input>,
		// so currentTarget is always that input element when it fires.
		const input = e.currentTarget as HTMLInputElement;
		fileName = input.files?.[0]?.name ?? '';
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
		fileName = '';
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
		<!-- Success: what landed, where, and the way to fix a bad import. -->
		<div
			class="mb-6 rounded-xl border border-green-200 bg-green-50 p-5"
			data-testid="import-success"
		>
			<p class="text-lg font-semibold text-green-800">
				Added {report.imported} event{report.imported === 1 ? '' : 's'} to your
				{report.calendarName}
			</p>
			<ul class="mt-2 space-y-1 text-sm text-green-700">
				<li>You ticked {report.selected}.</li>
				{#if report.skippedDuplicates > 0}
					<li>
						Skipped {report.skippedDuplicates} already on the calendar when we checked again.
					</li>
				{/if}
				{#if report.failed.length > 0}
					<li>Couldn't save: {report.failed.join(', ')}.</li>
				{/if}
			</ul>
			<div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
				<strong>Something look wrong?</strong>
				<a href="/calendar" class="underline">Open the calendar</a>, tap
				<strong>Select</strong> in the toolbar, tick the events and delete them in bulk.
			</div>
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
								class="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
								aria-label="Import {item.title}"
							/>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-slate-900">{item.title}</p>
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
								{/if}
							</div>
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
			use:enhance={() => {
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

			<label
				class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition-colors hover:border-primary-400 hover:bg-primary-50/40"
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
					{fileName || 'Drop or choose an .ics file'}
				</span>
				<span class="text-xs text-slate-400"
					>{fileName ? 'Ready to preview' : 'Up to 500 events · max 5 MB'}</span
				>
				<input
					type="file"
					name="file"
					accept=".ics,text/calendar"
					class="sr-only"
					required
					bind:this={fileInput}
					onchange={onFileChange}
				/>
			</label>

			<button
				type="submit"
				disabled={!fileName || pending}
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
</div>
