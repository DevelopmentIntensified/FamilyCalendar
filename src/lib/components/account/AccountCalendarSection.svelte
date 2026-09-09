<script lang="ts">
	import { enhance } from '$app/forms';
	import { DASHBOARD_MODULES } from '$lib/dashboardModules';

	interface Props {
		userSettings: {
			weekStart?: string | null;
			timeZone?: string | null;
			defaultView?: string | null;
			defaultCalendarId?: string | null;
			color?: string | null;
			syncEventsToFamilyCalendar?: boolean | null;
			autoParseEventDetails?: boolean | null;
			showDailyVerse?: boolean | null;
			verseTranslation?: string | null;
			hiddenDashboardModules?: string[] | null;
		} | null;
		calendars: { id: string; name: string }[];
		verseTranslations: { id: string; label: string; attribution: string }[];
	}

	let { userSettings, calendars, verseTranslations }: Props = $props();

	// SAFETY: Intl.supportedValuesOf is a newer API — probing for it and
	// falling back to UTC keeps older browsers working.
	function hasSupportedValuesOf(
		value: typeof Intl
	): value is typeof Intl & { supportedValuesOf: (key: 'timeZone') => string[] } {
		return typeof value.supportedValuesOf === 'function';
	}

	const timeZones = (hasSupportedValuesOf(Intl) ? Intl.supportedValuesOf('timeZone') : ['UTC'])
		.map((v) => ({ value: v, label: v.replace(/_/g, ' ') }))
		.sort((a, b) => a.label.localeCompare(b.label));

	const viewOptions = [
		{ value: 'dayView', label: 'Day View' },
		{ value: 'weekView', label: 'Week View' },
		{ value: 'monthView', label: 'Month View' },
		{ value: 'listView', label: 'List View' },
		{ value: 'dashboard', label: 'Dashboard (Day Dashboard)' }
	];

	let calendarLoading = $state(false);

	// Select state + reload sync: $effect re-runs only when userSettings
	// identity changes (post-submit reload), never on user edits.
	let weekStart = $state(userSettings?.weekStart ?? 'sunday');
	let timeZone = $state(userSettings?.timeZone ?? 'UTC');
	let defaultView = $state(userSettings?.defaultView ?? 'dayView');
	let defaultCalendarId = $state(userSettings?.defaultCalendarId ?? '');
	let selectedTranslation = $state('esv');
	$effect(() => {
		weekStart = userSettings?.weekStart ?? 'sunday';
		timeZone = userSettings?.timeZone ?? 'UTC';
		defaultView = userSettings?.defaultView ?? 'dayView';
		defaultCalendarId = userSettings?.defaultCalendarId ?? '';
		// Legacy rows may store 'kjv' (removed translation) — coerce so the
		// select never renders blank.
		selectedTranslation = verseTranslations?.some((t) => t.id === userSettings?.verseTranslation)
			? (userSettings?.verseTranslation ?? 'esv')
			: 'esv';
	});
	let selectedAttribution = $derived(
		verseTranslations?.find((t) => t.id === selectedTranslation)?.attribution
	);

	// Module visibility toggles: checked = show on dashboard. The server
	// action stores the inverse (hidden list) in userSettings.hiddenDashboardModules.
	let hiddenDashboardModules = $derived(userSettings?.hiddenDashboardModules ?? []);
</script>

<div id="calendar">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">Calendar Settings</h2>
	<form
		method="POST"
		action="?/saveCalendarSettings"
		use:enhance={() => {
			calendarLoading = true;
			return async ({ update }) => {
				calendarLoading = false;
				// reset: false — a form.reset() here would flash every
				// field back to defaults before the reload re-paints them.
				await update({ reset: false });
			};
		}}
		class="space-y-4"
	>
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-2">
				<label for="weekStart" class="block text-sm font-medium text-slate-700"
					>Week Starts On</label
				>
				<select
					id="weekStart"
					name="weekStart"
					bind:value={weekStart}
					class="w-full rounded-lg border border-slate-300 px-4 py-2.5"
				>
					<option value="sunday">Sunday</option>
					<option value="monday">Monday</option>
				</select>
			</div>

			<div class="space-y-2">
				<label for="timeZone" class="block text-sm font-medium text-slate-700">Time Zone</label>
				<select
					id="timeZone"
					name="timeZone"
					bind:value={timeZone}
					class="w-full rounded-lg border border-slate-300 px-4 py-2.5"
				>
					{#each timeZones as tz}
						<option value={tz.value}>{tz.label}</option>
					{/each}
				</select>
			</div>

			<div class="space-y-2">
				<label for="defaultView" class="block text-sm font-medium text-slate-700"
					>Default View</label
				>
				<select
					id="defaultView"
					name="defaultView"
					bind:value={defaultView}
					class="w-full rounded-lg border border-slate-300 px-4 py-2.5"
				>
					{#each viewOptions as view}
						<option value={view.value}>{view.label}</option>
					{/each}
				</select>
			</div>

			<div class="space-y-2">
				<label for="defaultCalendarId" class="block text-sm font-medium text-slate-700"
					>Default Calendar</label
				>
				<select
					id="defaultCalendarId"
					name="defaultCalendarId"
					bind:value={defaultCalendarId}
					class="w-full rounded-lg border border-slate-300 px-4 py-2.5"
				>
					<option value="">None (use first available)</option>
					{#each calendars as cal}
						<option value={cal.id}>{cal.name}</option>
					{/each}
				</select>
			</div>

			<div class="space-y-2">
				<label for="color" class="block text-sm font-medium text-slate-700"
					>Default Event Color</label
				>
				<input
					type="color"
					id="color"
					name="color"
					class="h-11 w-full rounded-lg border border-slate-300 p-1"
					value={userSettings?.color || '#3b82f6'}
				/>
			</div>

			<div class="flex items-end pb-1">
				<label class="flex cursor-pointer items-center gap-3">
					<input
						type="checkbox"
						name="syncEventsToFamilyCalendar"
						class="h-5 w-5 rounded border-slate-300"
						checked={userSettings?.syncEventsToFamilyCalendar}
					/>
					<span class="text-sm font-medium text-slate-700">Share new events to family calendar</span
					>
				</label>
			</div>
		</div>

		<!-- Smart parsing toggles -->
		<div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">
				Smart event creation
			</h3>

			<label class="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white p-3">
				<span>
					<span class="block text-sm font-medium text-slate-800">Auto-parse event details</span>
					<span class="mt-0.5 block text-xs text-slate-500"
						>Read dates, times and places as you type a description.</span
					>
				</span>
				<input
					type="checkbox"
					name="autoParseEventDetails"
					value="true"
					class="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300"
					checked={userSettings?.autoParseEventDetails ?? true}
				/>
			</label>
		</div>

		<!-- Daily verse -->
		<div class="mt-6 space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-amber-700">Daily verse</h3>

			<label class="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white p-3">
				<span>
					<span class="block text-sm font-medium text-slate-800">Show daily verse</span>
					<span class="mt-0.5 block text-xs text-slate-500"
						>An optional daily Bible verse on your dashboard.</span
					>
				</span>
				<input
					type="checkbox"
					name="showDailyVerse"
					value="true"
					class="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300"
					checked={userSettings?.showDailyVerse ?? false}
				/>
			</label>

			<div class="space-y-2 rounded-lg bg-white p-3">
				<label for="verseTranslation" class="block text-sm font-medium text-slate-800"
					>Translation</label
				>
				<select
					id="verseTranslation"
					name="verseTranslation"
					bind:value={selectedTranslation}
					class="w-full rounded-lg border border-slate-300 px-4 py-2.5"
				>
					{#each verseTranslations as translation (translation.id)}
						<option value={translation.id}>{translation.label}</option>
					{/each}
				</select>
				<p class="text-xs text-slate-400">{selectedAttribution}</p>
			</div>
		</div>

		<!-- Dashboard modules (per-user visibility) -->
		<div class="mt-6 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">
				Dashboard modules
			</h3>
			<p class="mb-1 text-xs text-slate-500">
				Choose which cards appear on your Day Dashboard. Family admins can also switch family cards
				off for everyone from the family page.
			</p>
			{#each DASHBOARD_MODULES as mod (mod.id)}
				<label
					class="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white p-3"
				>
					<span class="block text-sm font-medium text-slate-800">{mod.label}</span>
					<input
						type="checkbox"
						name="module_{mod.id}"
						value="on"
						class="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300"
						checked={!hiddenDashboardModules.includes(mod.id)}
					/>
				</label>
			{/each}
		</div>

		<button
			type="submit"
			disabled={calendarLoading}
			class="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
		>
			{calendarLoading ? 'Saving...' : 'Save Calendar Settings'}
		</button>

		<a
			href="/calendar/import"
			class="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-primary-300 hover:bg-primary-50/40"
		>
			<span>
				<span class="block text-sm font-medium text-slate-800"
					>Import from Google, Apple or Outlook</span
				>
				<span class="mt-0.5 block text-xs text-slate-500"
					>Bring in an .ics export — up to 500 events at once.</span
				>
			</span>
			<svg
				class="h-5 w-5 shrink-0 text-slate-400"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
		</a>
	</form>
</div>
