<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import type { ActionData, PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import PlanTypeSelector from '$lib/components/PlanTypeSelector.svelte';

	export let data: PageData;
	export let form: ActionData;

	$: user = data.user;
	$: success = form?.success;
	$: message = form?.message;

	let profileLoading = false;
	let emailLoading = false;
	let logoutAllLoading = false;
	let deleteLoading = false;
	let calendarLoading = false;
	let showDeleteConfirmation = false;

	$: activeSection = $page.url.hash.replace('#', '') || 'profile';

	const sections = [
		{ id: 'profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
		{ id: 'calendar', label: 'Calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
		{ id: 'subscription', label: 'Subscription', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
		{ id: 'email', label: 'Email', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
		{ id: 'security', label: 'Security', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
		{ id: 'danger', label: 'Danger Zone', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' }
	];

	const timeZones = (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'])
		.map((v) => ({ value: v, label: v.replace(/_/g, ' ') }))
		.sort((a, b) => a.label.localeCompare(b.label));

	const viewOptions = [
		{ value: 'dayView', label: 'Day View' },
		{ value: 'weekView', label: 'Week View' },
		{ value: 'monthView', label: 'Month View' },
		{ value: 'listView', label: 'List View' }
	];

	let selectedTranslation: string = data.userSettings.verseTranslation ?? 'kjv';
	$: selectedAttribution = data.verseTranslations?.find(
		(t) => t.id === selectedTranslation
	)?.attribution;
</script>

<svelte:head>
	<title>Account Settings - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8 pt-20">
	<div class="mx-auto max-w-6xl">
		<Breadcrumbs crumbs={[
			{ label: 'Calendar', href: '/calendar' },
			{ label: 'Account' }
		]} />

		<div class="rounded-xl border border-slate-200 bg-white shadow-sm">
			<div class="flex flex-col border-b border-slate-200 p-6 lg:flex-row lg:items-center lg:justify-between">
				<div>
					<h1 class="text-2xl font-bold text-slate-900">Account Settings</h1>
					<p class="mt-1 text-sm text-slate-500">Manage your account settings and preferences</p>
				</div>
				<a href="/calendar" class="mt-4 inline-flex items-center gap-2 text-sm text-slate-600 lg:mt-0 hover:text-primary-600">
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
					</svg>
					Back to Calendar
				</a>
			</div>

			<div class="flex flex-col lg:flex-row">
				<nav class="w-full border-b border-slate-200 p-4 lg:w-64 lg:border-b-0 lg:border-r">
					<ul class="space-y-1">
						{#each sections as section}
							<li>
								<a
									href="#{section.id}"
									class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors
										{activeSection === section.id
											? 'bg-primary-50 text-primary-700'
											: section.id === 'danger'
												? 'text-red-600 hover:bg-red-50'
												: 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}"
								>
									<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={section.icon} />
									</svg>
									{section.label}
								</a>
							</li>
						{/each}
					</ul>
				</nav>

				<div class="flex-1 p-6">
					{#if success && message}
						<div class="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">
							{message}
						</div>
					{:else if form && !form.success}
						<div class="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-800">
							{form.message}
							{#if 'guestNeedsClaim' in form && form.guestNeedsClaim}
								<a href="/claim" class="ml-1 font-semibold underline">Open the save-your-calendar flow →</a>
							{/if}
						</div>
					{/if}

					{#if activeSection === 'profile'}
						<div id="profile">
							<h2 class="mb-4 text-lg font-semibold text-slate-900">Profile Information</h2>
							<form
								method="POST"
								action="?/updateProfile"
								use:enhance={() => {
									profileLoading = true;
									return async ({ update }) => {
										profileLoading = false;
										await update();
									};
								}}
								class="space-y-4"
							>
								<div class="grid gap-4 sm:grid-cols-2">
									<div class="space-y-2">
										<label for="firstName" class="block text-sm font-medium text-slate-700">First Name</label>
										<input
											type="text"
											id="firstName"
											name="firstName"
											value={user.firstName}
											class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
											required
										/>
									</div>
									<div class="space-y-2">
										<label for="lastName" class="block text-sm font-medium text-slate-700">Last Name</label>
										<input
											type="text"
											id="lastName"
											name="lastName"
											value={user.lastName}
											class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
											required
										/>
									</div>
								</div>
								<button
									type="submit"
									disabled={profileLoading}
									class="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
								>
									{profileLoading ? 'Saving...' : 'Update Profile'}
								</button>
							</form>
						</div>
					{:else if activeSection === 'calendar'}
						<div id="calendar">
							<h2 class="mb-4 text-lg font-semibold text-slate-900">Calendar Settings</h2>
							<form
								method="POST"
								action="?/saveCalendarSettings"
								use:enhance={() => {
									calendarLoading = true;
									return async ({ update }) => {
										calendarLoading = false;
										await update();
									};
								}}
								class="space-y-4"
							>
								<div class="grid gap-4 sm:grid-cols-2">
									<div class="space-y-2">
										<label for="weekStart" class="block text-sm font-medium text-slate-700">Week Starts On</label>
										<select id="weekStart" name="weekStart" class="w-full rounded-lg border border-slate-300 px-4 py-2.5">
											<option value="sunday" selected={data.userSettings.weekStart === 'sunday'}>Sunday</option>
											<option value="monday" selected={data.userSettings.weekStart === 'monday'}>Monday</option>
										</select>
									</div>

									<div class="space-y-2">
										<label for="timeZone" class="block text-sm font-medium text-slate-700">Time Zone</label>
										<select id="timeZone" name="timeZone" class="w-full rounded-lg border border-slate-300 px-4 py-2.5">
											{#each timeZones as tz}
												<option value={tz.value} selected={data.userSettings.timeZone === tz.value}>{tz.label}</option>
											{/each}
										</select>
									</div>

									<div class="space-y-2">
										<label for="defaultView" class="block text-sm font-medium text-slate-700">Default View</label>
										<select id="defaultView" name="defaultView" class="w-full rounded-lg border border-slate-300 px-4 py-2.5">
											{#each viewOptions as view}
												<option value={view.value} selected={data.userSettings.defaultView === view.value}>{view.label}</option>
											{/each}
										</select>
									</div>

									<div class="space-y-2">
										<label for="defaultCalendarId" class="block text-sm font-medium text-slate-700">Default Calendar</label>
										<select id="defaultCalendarId" name="defaultCalendarId" class="w-full rounded-lg border border-slate-300 px-4 py-2.5">
											<option value="">None (use first available)</option>
											{#each data.calendars || [] as cal}
												<option value={cal.id} selected={data.userSettings.defaultCalendarId === cal.id}>{cal.name}</option>
											{/each}
										</select>
									</div>

									<div class="space-y-2">
										<label for="color" class="block text-sm font-medium text-slate-700">Default Event Color</label>
										<input
											type="color"
											id="color"
											name="color"
											class="h-11 w-full rounded-lg border border-slate-300 p-1"
											value={data.userSettings.color || '#3b82f6'}
										/>
									</div>

									<div class="flex items-end pb-1">
										<label class="flex cursor-pointer items-center gap-3">
											<input
												type="checkbox"
												name="syncEventsToFamilyCalendar"
												class="h-5 w-5 rounded border-slate-300"
												checked={data.userSettings.syncEventsToFamilyCalendar}
											/>
											<span class="text-sm font-medium text-slate-700">Share new events to family calendar</span>
										</label>
									</div>
								</div>

								<!-- Smart parsing toggles -->
								<div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
									<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Smart event creation</h3>

									<label class="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white p-3">
										<span>
											<span class="block text-sm font-medium text-slate-800">Auto-parse event details</span>
											<span class="mt-0.5 block text-xs text-slate-500">Read dates, times and places as you type a description.</span>
										</span>
										<input
											type="checkbox"
											name="autoParseEventDetails"
											value="true"
											class="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300"
											checked={data.userSettings.autoParseEventDetails ?? true}
										/>
									</label>

									<!--
									<label class="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white p-3">
										<span>
											<span class="block text-sm font-medium text-slate-800">Use cloud AI <span class="ml-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">recommended</span></span>
											<span class="mt-0.5 block text-xs text-slate-500">Better parsing via Cerebras. Falls back to on-device rules when off.</span>
										</span>
										<input
											type="checkbox"
											name="useCloudAI"
											value="true"
											class="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300"
											checked={data.userSettings.useCloudAI ?? true}
										/>
									</label>
-->
								</div>

								<!-- Daily verse -->
								<div class="mt-6 space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
									<h3 class="text-xs font-semibold uppercase tracking-wide text-amber-700">Daily verse</h3>

									<label class="flex cursor-pointer items-start justify-between gap-4 rounded-lg bg-white p-3">
										<span>
											<span class="block text-sm font-medium text-slate-800">Show daily verse</span>
											<span class="mt-0.5 block text-xs text-slate-500">An optional daily Bible verse on your dashboard.</span>
										</span>
										<input
											type="checkbox"
											name="showDailyVerse"
											value="true"
											class="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300"
											checked={data.userSettings.showDailyVerse ?? false}
										/>
									</label>

									<div class="space-y-2 rounded-lg bg-white p-3">
										<label for="verseTranslation" class="block text-sm font-medium text-slate-800">Translation</label>
										<select
											id="verseTranslation"
											name="verseTranslation"
											bind:value={selectedTranslation}
											class="w-full rounded-lg border border-slate-300 px-4 py-2.5"
										>
											{#each data.verseTranslations as translation (translation.id)}
												<option value={translation.id}>{translation.label}</option>
											{/each}
										</select>
										<p class="text-xs text-slate-400">{selectedAttribution}</p>
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
										<span class="block text-sm font-medium text-slate-800">Import from Google, Apple or Outlook</span>
										<span class="mt-0.5 block text-xs text-slate-500">Bring in an .ics export — up to 500 events at once.</span>
									</span>
									<svg class="h-5 w-5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
									</svg>
								</a>
							</form>
						</div>
					{:else if activeSection === 'email'}
						<div id="email">
							<h2 class="mb-4 text-lg font-semibold text-slate-900">Email Address</h2>
							<form
								method="POST"
								action="?/updateEmail"
								use:enhance={() => {
									emailLoading = true;
									return async ({ update }) => {
										emailLoading = false;
										await update();
									};
								}}
								class="space-y-4"
							>
								<div class="space-y-2">
									<label for="email" class="block text-sm font-medium text-slate-700">Email</label>
									<input
										type="email"
										id="email"
										name="email"
										value={user.email}
										class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
										required
									/>
								</div>
								<div class="flex items-center gap-2">
									<span class="text-sm {user.emailVerified ? 'text-green-600' : 'text-slate-500'}">
										Status: {user.emailVerified ? 'Verified' : 'Not Verified'}
									</span>
									{#if user.emailVerified}
										<svg class="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
										</svg>
									{/if}
								</div>
								<button
									type="submit"
									disabled={emailLoading}
									class="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
								>
									{emailLoading ? 'Updating...' : 'Update Email'}
								</button>
							</form>
						</div>
					{:else if activeSection === 'security'}
						<div id="security">
							<h2 class="mb-4 text-lg font-semibold text-slate-900">Security</h2>
							<form
								method="POST"
								action="?/logoutAllDevices"
								use:enhance={() => {
									logoutAllLoading = true;
									return async ({ update }) => {
										logoutAllLoading = false;
										await update();
									};
								}}
								class="space-y-4"
							>
								<p class="text-sm text-slate-600">
									Log out from all devices except the current one. This will invalidate all other sessions.
								</p>
								<button
									type="submit"
									disabled={logoutAllLoading}
									class="rounded-full bg-yellow-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-yellow-700 disabled:opacity-50"
								>
									{logoutAllLoading ? 'Logging out...' : 'Logout from All Other Devices'}
								</button>
							</form>
						</div>
					{:else if activeSection === 'danger'}
						<div id="danger">
							<h2 class="mb-4 text-lg font-semibold text-red-600">Danger Zone</h2>
							<p class="mb-4 text-sm text-slate-600">
								Permanently delete your account and all associated data. This action cannot be undone.
							</p>

							{#if !showDeleteConfirmation}
								<button
									type="button"
									on:click={() => (showDeleteConfirmation = true)}
									class="rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
								>
									Delete Account
								</button>
							{:else}
								<form
									method="POST"
									action="?/deleteAccount"
									use:enhance={() => {
										deleteLoading = true;
										return async ({ update }) => {
											deleteLoading = false;
											await update();
										};
									}}
									class="space-y-4 rounded-lg border border-red-200 bg-red-50 p-4"
								>
									<p class="text-sm text-red-600">
										This will permanently delete your account. To confirm, type your user ID: <code class="rounded bg-slate-100 px-1">{user.id}</code>
									</p>
									<div class="space-y-2">
										<label for="confirmation" class="block text-sm font-medium text-slate-700">Confirmation</label>
										<input
											type="text"
											id="confirmation"
											name="confirmation"
											placeholder="Enter your user ID to confirm"
											class="w-full rounded-lg border border-slate-300 px-4 py-2.5 transition-colors focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
											required
										/>
									</div>
									<div class="flex gap-3">
										<button
											type="submit"
											disabled={deleteLoading}
											class="rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
										>
											{deleteLoading ? 'Deleting...' : 'Confirm Deletion'}
										</button>
										<button
											type="button"
											on:click={() => (showDeleteConfirmation = false)}
											class="rounded-full bg-slate-200 px-6 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-300"
										>
											Cancel
										</button>
									</div>
								</form>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
