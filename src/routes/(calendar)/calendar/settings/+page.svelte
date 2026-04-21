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

	<div class="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6">
		<div class="mb-4 flex items-center gap-3">
			<svg class="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2 2 4-4M5 3l4 4M17 5l-4 4M6 7l2 2M8 6l-2 2m0 4v4m2-4h4M21 13v4m-2 2h4m-5-16l-2 2-4 4M3 21l4-4m0 0h12v-6M3 9h12" />
			</svg>
			<h2 class="text-lg font-semibold text-slate-900">Family Master</h2>
		</div>
		<p class="mb-4 text-sm text-slate-600">Upgrade to unlock unlimited families, infinite retention, 1GB attachments, and more head-of-household tools.</p>
		<div class="flex flex-wrap gap-3">
			<a
				href="/pricing"
				class="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
			>
				Upgrade to Family Master
			</a>
			<a
				href="/pricing?plan=annual"
				class="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
			>
				Annual - $90/yr
			</a>
			<a
				href="/pricing?plan=lifetime"
				class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
			>
				Lifetime - $150
			</a>
		</div>
	</div>

	<div class="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-6">
		<div class="mb-4 flex items-center gap-3">
			<svg class="h-5 w-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path d="M11 3.055C9.346 4.296 8.289 6.026 8.289 8c0 2.485 1.628 4.59 3.881 5.586A5.213 5.213 0 0112 17c2.485 0 4.486-1.554 5.039-3.704A5.213 5.213 0 0112 5c0-.518.078-1.015.219-1.484C10.722 4.792 9.505 4.5 8.5 4.5c-1.917 0-3.5 1.583-3.5 3.5 0 .65.183 1.255.495 1.78C3.918 9.464 3 10.846 3 12.5c0 2.21 1.79 4 4 4h3v-3c0-2.933-2.398-5.307-5.307-5.307A5.5 5.5 0 013 9.5c0 3.037 2.463 5.5 5.5 5.5A5.5 5.5 0 0112 14c2.485 0 4.486-1.554 5.039-3.704A5.213 5.213 0 0118 15c1.657 0 3-1.343 3-3s-1.343-3-3-3h-3c-.518 0-1.016.078-1.485.22" />
			</svg>
			<h2 class="text-lg font-semibold text-slate-900">Ad Preferences</h2>
		</div>
		<p class="mb-4 text-sm text-slate-600">Family Master includes limited ads (3-4 per month) to keep pricing low. Control how you see them here.</p>
		
		<form method="POST" action="?/ads" use:enhance class="space-y-4">
			<div class="flex items-center justify-between rounded-lg bg-white p-4">
				<div>
					<h3 class="font-medium text-slate-900">Show ads as calendar events</h3>
					<p class="text-sm text-slate-500">When enabled, sponsored events appear on your calendar with a subtle marker.</p>
				</div>
				<label class="relative inline-flex cursor-pointer items-center">
					<input
						type="checkbox"
						name="showAdsAsEvents"
						value="true"
						checked={settings.showAdsAsEvents ?? true}
						class="peer sr-only"
					/>
					<div class="h-6 w-11 rounded-full bg-slate-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-amber-500 peer-checked:after:translate-x-full peer-checked:after:bg-white rtl:peer-checked:after:-translate-x-full"></div>
				</label>
			</div>

			<div class="flex items-center justify-between rounded-lg bg-white p-4">
				<div>
					<h3 class="font-medium text-slate-900">Show ad markers</h3>
					<p class="text-sm text-slate-500">Show visual indicators on sponsored content.</p>
				</div>
				<label class="relative inline-flex cursor-pointer items-center">
					<input
						type="checkbox"
						name="showAdMarkers"
						value="true"
						checked={settings.showAdMarkers ?? true}
						class="peer sr-only"
					/>
					<div class="h-6 w-11 rounded-full bg-slate-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-amber-500 peer-checked:after:translate-x-full peer-checked:after:bg-white rtl:peer-checked:after:-translate-x-full"></div>
				</label>
			</div>

			<div class="flex items-center justify-between rounded-lg bg-white p-4">
				<div>
					<h3 class="font-medium text-slate-900">Personalized ads</h3>
					<p class="text-sm text-slate-500">Allow relevant ads based on your activity.</p>
				</div>
				<label class="relative inline-flex cursor-pointer items-center">
					<input
						type="checkbox"
						name="personalizedAds"
						value="true"
						checked={settings.personalizedAds ?? true}
						class="peer sr-only"
					/>
					<div class="h-6 w-11 rounded-full bg-slate-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-amber-500 peer-checked:after:translate-x-full peer-checked:after:bg-white rtl:peer-checked:after:-translate-x-full"></div>
				</label>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="w-full rounded-lg bg-slate-600 px-4 py-2 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
			>
				{loading ? 'Saving...' : 'Save Ad Preferences'}
			</button>
		</form>

		<div class="mt-4 text-sm text-slate-500">
			<p>Ads help keep Family Master affordable. We never share your data with advertisers.</p>
			<a href="/privacy" class="font-medium text-amber-600 hover:text-amber-700">Privacy Policy</a>
		</div>
	</div>
</div>