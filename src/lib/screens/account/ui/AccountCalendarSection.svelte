<!--
	Calendar settings: week start, the full IANA zone list (UTC when the browser
	has no `Intl.supportedValuesOf`), default view, the default calendar, the
	colour, the family-sync checkbox, the smart-parsing switch, the sponsorship
	opt-in with its consent trail, Save, and the ICS import link.

	Fields re-sync from the loader only when the settings identity changes (a
	post-submit reload), never on a user edit — a `$effect` reading the model, not
	each keystroke.
-->
<script lang="ts">
	import {
		ACCOUNT_CALENDAR_VIEWS,
		ACCOUNT_NO_CONSENT_COPY,
		accountConsentLabel,
		accountTimeZones
	} from '../account.calendar.rules';
	import type { AccountSectionModel } from '../account.contract';
	import type { AccountFormEnhancer } from '../account.state.svelte';

	type AccountCalendarModel = Extract<AccountSectionModel, { section: 'calendar' }>;

	interface Props {
		model: AccountCalendarModel;
		enhance: AccountFormEnhancer;
	}

	let { model, enhance }: Props = $props();

	const timeZones = accountTimeZones();
	const viewOptions = ACCOUNT_CALENDAR_VIEWS;

	let calendarLoading = $state(false);

	let weekStart = $state(model.settings.weekStart ?? 'sunday');
	let timeZone = $state(model.settings.timeZone ?? 'UTC');
	let defaultView = $state(model.settings.defaultView ?? 'dayView');
	let defaultCalendarId = $state(model.settings.defaultCalendarId ?? '');
	$effect(() => {
		weekStart = model.settings.weekStart ?? 'sunday';
		timeZone = model.settings.timeZone ?? 'UTC';
		defaultView = model.settings.defaultView ?? 'dayView';
		defaultCalendarId = model.settings.defaultCalendarId ?? '';
	});
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
				// reset: false — a reset would flash every field back to its
				// markup default before the reload re-paints.
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
					{#each timeZones as zone (zone.value)}
						<option value={zone.value}>{zone.label}</option>
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
					{#each viewOptions as view (view.value)}
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
					{#each model.calendars as calendar (calendar.id)}
						<option value={calendar.id}>{calendar.name}</option>
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
					value={model.settings.color || '#3b82f6'}
				/>
			</div>

			<div class="flex items-end pb-1">
				<label class="flex cursor-pointer items-center gap-3">
					<input
						type="checkbox"
						name="syncEventsToFamilyCalendar"
						class="h-5 w-5 rounded border-slate-300"
						checked={model.settings.syncEventsToFamilyCalendar}
					/>
					<span class="text-sm font-medium text-slate-700">Share new events to family calendar</span>
				</label>
			</div>
		</div>

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
					checked={model.settings.autoParseEventDetails ?? true}
				/>
			</label>
		</div>

		<div class="mt-6 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Sponsorship</h3>

			<label class="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white p-3">
				<span>
					<span class="block text-sm font-medium text-slate-800">Show sponsored items</span>
					<span class="mt-0.5 block text-xs text-slate-500"
						>Opt in to sponsored items on your calendar. Off by default — while it is off, nothing
						sponsored is shown and nothing is shared with advertisers.</span
					>
				</span>
				<input
					type="checkbox"
					name="showAdsAsEvents"
					value="true"
					class="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300"
					checked={model.settings.showAdsAsEvents ?? false}
				/>
			</label>

			<div class="rounded-lg bg-white p-3">
				<p class="text-xs font-medium text-slate-500">Consent history</p>
				{#if model.consentHistory.length === 0}
					<p class="text-xs text-slate-400">{ACCOUNT_NO_CONSENT_COPY}</p>
				{:else}
					<ul class="mt-1 space-y-1">
						{#each model.consentHistory as entry (entry.recordedAt)}
							<li class="text-xs text-slate-500">
								{accountConsentLabel(entry.decision, entry.recordedAt)}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
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
