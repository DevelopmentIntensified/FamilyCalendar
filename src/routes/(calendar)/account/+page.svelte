<script lang="ts">
	import { page } from '$app/stores';
	import type { ActionData, PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import AccountSidebar from '$lib/components/account/AccountSidebar.svelte';
	import AccountProfileSection from '$lib/components/account/AccountProfileSection.svelte';
	import AccountCalendarSection from '$lib/components/account/AccountCalendarSection.svelte';
	import AccountSubscriptionSection from '$lib/components/account/AccountSubscriptionSection.svelte';
	import AccountEmailSection from '$lib/components/account/AccountEmailSection.svelte';
	import AccountSecuritySection from '$lib/components/account/AccountSecuritySection.svelte';
	import AccountDangerSection from '$lib/components/account/AccountDangerSection.svelte';

	export let data: PageData;
	export let form: ActionData;

	$: user = data.user;
	$: success = form?.success;
	$: message = form?.message;

	$: activeSection = $page.url.hash.replace('#', '') || 'profile';
</script>

<svelte:head>
	<title>Account Settings - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8 pt-20">
	<div class="mx-auto max-w-6xl">
		<Breadcrumbs crumbs={[{ label: 'Calendar', href: '/calendar' }, { label: 'Account' }]} />

		<div class="rounded-xl border border-slate-200 bg-white shadow-sm">
			<div
				class="flex flex-col border-b border-slate-200 p-6 lg:flex-row lg:items-center lg:justify-between"
			>
				<div>
					<h1 class="text-2xl font-bold text-slate-900">Account Settings</h1>
					<p class="mt-1 text-sm text-slate-500">Manage your account settings and preferences</p>
				</div>
				<a
					href="/calendar"
					class="mt-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-primary-600 lg:mt-0"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
						/>
					</svg>
					Back to Calendar
				</a>
			</div>

			<div class="flex flex-col lg:flex-row">
				<AccountSidebar {activeSection} />

				<div class="flex-1 p-6">
					{#if success && message}
						<div class="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">
							{message}
						</div>
					{:else if form && !form.success}
						<div class="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-800">
							{form.message}
							{#if 'guestNeedsClaim' in form && form.guestNeedsClaim}
								<a href="/claim" class="ml-1 font-semibold underline"
									>Open the save-your-calendar flow →</a
								>
							{/if}
						</div>
					{/if}

					{#if activeSection === 'profile'}
						<AccountProfileSection {user} />
					{:else if activeSection === 'calendar'}
						<AccountCalendarSection
							userSettings={data.userSettings}
							calendars={data.calendars ?? []}
							verseTranslations={data.verseTranslations ?? []}
						/>
					{:else if activeSection === 'subscription'}
						<AccountSubscriptionSection
							subscription={data.subscription}
							planLimits={data.planLimits}
							aiUsage={data.aiUsage}
							planPricing={data.planPricing}
						/>
					{:else if activeSection === 'email'}
						<AccountEmailSection {user} />
					{:else if activeSection === 'security'}
						<AccountSecuritySection />
					{:else if activeSection === 'danger'}
						<AccountDangerSection userId={user.id} />
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
