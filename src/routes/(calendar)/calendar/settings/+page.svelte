<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	export let data;
	export let form: ActionData;

	$: settings = data.userSettings;
	$: success = form?.success;
	$: message = form?.message;

	const timeZones = [
		{ value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
		{ value: 'America/Anchorage', label: 'Alaska (AKST)' },
		{ value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
		{ value: 'America/Denver', label: 'Mountain Time (MT)' },
		{ value: 'America/Phoenix', label: 'Arizona (MST)' },
		{ value: 'America/Chicago', label: 'Central Time (CT)' },
		{ value: 'America/New_York', label: 'Eastern Time (ET)' },
		{ value: 'America/Indiana/Indianapolis', label: 'Indiana (EST)' },
		{ value: 'America/Detroit', label: 'Detroit (EST)' },
		{ value: 'America/Toronto', label: 'Toronto (EST)' },
		{ value: 'America/Vancouver', label: 'Vancouver (PST)' },
		{ value: 'America/Mexico_City', label: 'Mexico City (CST)' },
		{ value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
		{ value: 'America/Buenos_Aires', label: 'Buenos Aires (ART)' },
		{ value: 'Europe/London', label: 'London (GMT/BST)' },
		{ value: 'Europe/Paris', label: 'Paris (CET)' },
		{ value: 'Europe/Berlin', label: 'Berlin (CET)' },
		{ value: 'Europe/Madrid', label: 'Madrid (CET)' },
		{ value: 'Europe/Rome', label: 'Rome (CET)' },
		{ value: 'Europe/Amsterdam', label: 'Amsterdam (CET)' },
		{ value: 'Europe/Brussels', label: 'Brussels (CET)' },
		{ value: 'Europe/Zurich', label: 'Zurich (CET)' },
		{ value: 'Europe/Vienna', label: 'Vienna (CET)' },
		{ value: 'Europe/Stockholm', label: 'Stockholm (CET)' },
		{ value: 'Europe/Oslo', label: 'Oslo (CET)' },
		{ value: 'Europe/Copenhagen', label: 'Copenhagen (CET)' },
		{ value: 'Europe/Helsinki', label: 'Helsinki (EET)' },
		{ value: 'Europe/Athens', label: 'Athens (EET)' },
		{ value: 'Europe/Warsaw', label: 'Warsaw (CET)' },
		{ value: 'Europe/Prague', label: 'Prague (CET)' },
		{ value: 'Europe/Budapest', label: 'Budapest (CET)' },
		{ value: 'Europe/Moscow', label: 'Moscow (MSK)' },
		{ value: 'Europe/Istanbul', label: 'Istanbul (TRT)' },
		{ value: 'Europe/Dubai', label: 'Dubai (GST)' },
		{ value: 'Asia/Kolkata', label: 'India (IST)' },
		{ value: 'Asia/Bangkok', label: 'Bangkok (ICT)' },
		{ value: 'Asia/Singapore', label: 'Singapore (SGT)' },
		{ value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
		{ value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
		{ value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
		{ value: 'Asia/Seoul', label: 'Seoul (KST)' },
		{ value: 'Australia/Sydney', label: 'Sydney (AEST)' },
		{ value: 'Australia/Melbourne', label: 'Melbourne (AEST)' },
		{ value: 'Australia/Perth', label: 'Perth (AWST)' },
		{ value: 'Pacific/Auckland', label: 'Auckland (NZST)' },
		{ value: 'UTC', label: 'UTC' }
	];

	const viewOptions = [
		{ value: 'dayView', label: 'Day View' },
		{ value: 'weekView', label: 'Week View' },
		{ value: 'monthView', label: 'Month View' },
		{ value: 'listView', label: 'List View' }
	];

	let loading = false;
</script>

<div class="mx-auto max-w-2xl p-6">
	<h1 class="mb-6 text-2xl font-bold text-slate-900">Calendar Settings</h1>

	{#if success}
		<div class="mb-4 rounded-lg bg-green-50 p-4 text-green-700 border border-green-200">
			{message}
		</div>
	{:else if form && !form.success}
		<div class="mb-4 rounded-lg bg-red-50 p-4 text-red-700 border border-red-200">
			{form.message}
		</div>
	{/if}

	<form
		method="POST"
		action="?/default"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update();
			};
		}}
		class="space-y-6"
	>
		<div class="space-y-2">
			<label for="weekStart" class="block text-sm font-medium text-slate-700">Week Starts On</label>
			<select
				id="weekStart"
				name="weekStart"
				class="w-full rounded-lg border border-slate-300 px-4 py-2.5"
				value={settings.weekStart}
			>
				<option value="sunday" selected={settings.weekStart === 'sunday'}>Sunday</option>
				<option value="monday" selected={settings.weekStart === 'monday'}>Monday</option>
			</select>
		</div>

		<div class="space-y-2">
			<label for="timeZone" class="block text-sm font-medium text-slate-700">Time Zone</label>
			<select
				id="timeZone"
				name="timeZone"
				class="w-full rounded-lg border border-slate-300 px-4 py-2.5"
				value={settings.timeZone}
			>
				{#each timeZones as tz}
					<option value={tz.value} selected={settings.timeZone === tz.value}>{tz.label}</option>
				{/each}
			</select>
		</div>

		<div class="space-y-2">
			<label for="defaultView" class="block text-sm font-medium text-slate-700">Default View</label>
			<select
				id="defaultView"
				name="defaultView"
				class="w-full rounded-lg border border-slate-300 px-4 py-2.5"
				value={settings.defaultView}
			>
				{#each viewOptions as view}
					<option value={view.value} selected={settings.defaultView === view.value}>{view.label}</option>
				{/each}
			</select>
		</div>

		<div class="space-y-2">
			<label for="color" class="block text-sm font-medium text-slate-700">Default Event Color</label>
			<input
				type="color"
				id="color"
				name="color"
				class="h-12 w-full rounded-lg border border-slate-300 p-1"
				value={settings.color || '#3b82f6'}
			/>
		</div>

		<div class="flex items-center gap-3">
			<input
				type="checkbox"
				id="syncEventsToFamilyCalendar"
				name="syncEventsToFamilyCalendar"
				class="h-5 w-5 rounded border-slate-300"
				checked={settings.syncEventsToFamilyCalendar}
			/>
			<label for="syncEventsToFamilyCalendar" class="text-sm font-medium text-slate-700">Sync events to family calendar</label>
		</div>

		<button
			type="submit"
			disabled={loading}
			class="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
		>
			{loading ? 'Saving...' : 'Save Settings'}
		</button>
	</form>
</div>
