<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let fileName = '';

	function onFileChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		fileName = input.files?.[0]?.name ?? '';
	}
</script>

<div class="mx-auto max-w-2xl p-6">
	<a href="/account#calendar" class="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
		</svg>
		Back to settings
	</a>

	<h1 class="mb-1 text-2xl font-bold text-slate-900">Import a calendar</h1>
	<p class="mb-6 text-sm text-slate-600">
		Bring events in from Google Calendar, Apple Calendar, Outlook, or any app that exports
		<strong>.ics</strong> files.
	</p>

	{#if form?.success}
		<div class="mb-6 rounded-xl border border-green-200 bg-green-50 p-5">
			<p class="text-lg font-semibold text-green-800">🎉 Imported {form.imported} event{form.imported === 1 ? '' : 's'}</p>
			<p class="mt-1 text-sm text-green-700">
				{#if form.skippedDuplicates > 0}
					Skipped {form.skippedDuplicates} duplicate{form.skippedDuplicates === 1 ? '' : 's'} that were already on this calendar.
				{:else}
					No duplicates found.
				{/if}
			</p>
			<a href="/calendar" class="mt-3 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
				View your calendar
			</a>
		</div>
	{:else}
		{#if form?.error}
			<div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{form.error}</div>
		{/if}

		<form method="POST" enctype="multipart/form-data" use:enhance class="space-y-5">
			<div>
				<label for="calendarId" class="mb-1 block text-sm font-medium text-slate-700">Import into</label>
				<select id="calendarId" name="calendarId" required class="w-full rounded-lg border border-slate-300 px-4 py-2.5">
					{#each data.calendars as cal}
						<option value={cal.id}>{cal.name}</option>
					{/each}
				</select>
			</div>

			<label
				class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition-colors hover:border-primary-400 hover:bg-primary-50/40"
			>
				<svg class="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
				</svg>
				<span class="text-sm font-medium text-slate-700">
					{fileName || 'Drop or choose an .ics file'}
				</span>
				<span class="text-xs text-slate-400">{fileName ? 'Ready to import' : 'Up to 500 events · max 5 MB'}</span>
				<input type="file" name="file" accept=".ics,text/calendar" class="sr-only" required onchange={onFileChange} />
			</label>

			<button
				type="submit"
				disabled={!fileName}
				class="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
			>
				Import events
			</button>
		</form>
	{/if}

	<div class="mt-8 rounded-xl border border-slate-200 bg-white p-5">
		<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">How to export from</h2>
		<ul class="space-y-2 text-sm text-slate-600">
			<li><strong class="text-slate-800">Google:</strong> Settings → Import & Export → Export → download .zip → unzip → use the .ics inside.</li>
			<li><strong class="text-slate-800">Apple:</strong> Calendar app → File → Export → Export…</li>
			<li><strong class="text-slate-800">Outlook:</strong> File → Save Calendar → choose iCalendar format.</li>
		</ul>
		<p class="mt-3 text-xs text-slate-400">
			Recurring rules import as daily / weekly / monthly / yearly repeats, including
			specific weekdays (e.g. Mon/Wed/Fri) and occurrence-count limits. Exotic rules
			(monthly BYDAY, timezone definitions outside common US zones) are simplified.
		</p>
	</div>
</div>
