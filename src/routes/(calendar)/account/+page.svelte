<script lang="ts">
	import { page } from '$app/stores';
	import type { ActionData, PageData } from './$types';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import AccountSidebar from '$lib/components/account/AccountSidebar.svelte';
	import AccountProfileSection from '$lib/components/account/AccountProfileSection.svelte';
	import AccountFamiliesSection from '$lib/components/account/AccountFamiliesSection.svelte';
	import AccountNotificationsSection from '$lib/components/account/AccountNotificationsSection.svelte';
	import AccountCalendarSection from '$lib/components/account/AccountCalendarSection.svelte';
	import AccountDashboardSection from '$lib/components/account/AccountDashboardSection.svelte';
	import AccountSubscriptionSection from '$lib/components/account/AccountSubscriptionSection.svelte';
	import AccountEmailSection from '$lib/components/account/AccountEmailSection.svelte';
	import AccountSecuritySection from '$lib/components/account/AccountSecuritySection.svelte';
	import AccountApiTokensSection from '$lib/components/account/AccountApiTokensSection.svelte';
	import AccountDangerSection from '$lib/components/account/AccountDangerSection.svelte';
	import { resolveAccountSection } from '$lib/components/account/accountSections';

	export let data: PageData;
	export let form: ActionData;

	$: user = data.user;
	$: success = form?.success;
	$: message = form?.message;

	// 105: the hash names a section from the one list the sidebar renders, so the
	// nav and the page cannot disagree about which sections exist.
	$: activeSection = resolveAccountSection($page.url.hash);
</script>

<svelte:head>
	<title>Account Settings - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8 pt-20">
	<div class="mx-auto max-w-6xl">
		<Breadcrumbs crumbs={[{ label: 'Calendar', href: '/calendar' }, { label: 'Account' }]} />

		<!-- 129: the approved page is unframed — no 12px card around the header
		     and the grid. The header is a divider, the main column reads as the
		     prototype's .sec, and the mounted section rides in a rail__card. -->
		<div
			class="mt-4 flex flex-col border-b border-slate-200 pb-6 min-[1000px]:flex-row min-[1000px]:items-center min-[1000px]:justify-between"
		>
			<div>
				<h1 class="text-2xl font-bold text-slate-900">Account Settings</h1>
				<p class="mt-1 text-sm text-slate-500">Manage your account settings and preferences</p>
			</div>
			<a
				href="/calendar"
				class="mt-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-primary-600 min-[1000px]:mt-0"
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

		<!-- 129: grid `15rem minmax(0,1fr)` at 1000px, as the prototype spells it. -->
		<div
			class="mt-6 grid grid-cols-1 items-start gap-4 min-[1000px]:grid-cols-[15rem_minmax(0,1fr)]"
		>
			<AccountSidebar {activeSection} {user} />

			<div class="min-w-0">
				{#if success && message}
					<div class="mb-4 rounded-xl bg-green-50 p-4 text-sm text-green-800">
						{message}
					</div>
				{:else if form && !form.success}
					<div class="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
						{form.message}
						{#if 'guestNeedsClaim' in form && form.guestNeedsClaim}
							<a href="/claim" class="ml-1 font-semibold underline"
								>Open the save-your-calendar flow →</a
							>
						{/if}
					</div>
				{/if}

				<div class="rounded-[1.25rem] border border-slate-200 bg-white p-6">
					{#if activeSection === 'profile'}
						<AccountProfileSection {user} />
					{:else if activeSection === 'families'}
						<AccountFamiliesSection families={data.families ?? []} />
					{:else if activeSection === 'notifications'}
						<AccountNotificationsSection preferences={data.notificationPreferences ?? null} />
					{:else if activeSection === 'calendar'}
						<AccountCalendarSection
							userSettings={data.userSettings}
							calendars={data.calendars ?? []}
							verseTranslations={data.verseTranslations ?? []}
							consentHistory={data.consentHistory ?? []}
						/>
					{:else if activeSection === 'dashboard'}
						<AccountDashboardSection
							hiddenDashboardModules={data.userSettings?.hiddenDashboardModules ?? []}
						/>
					{:else if activeSection === 'subscription'}
						<AccountSubscriptionSection
							subscription={data.subscription}
							planLimits={data.planLimits}
							aiUsage={data.aiUsage}
							planPricing={data.planPricing}
							families={data.families ?? []}
						/>
					{:else if activeSection === 'email'}
						<AccountEmailSection {user} />
					{:else if activeSection === 'security'}
						<AccountSecuritySection />
					{:else if activeSection === 'api'}
						<AccountApiTokensSection tokens={data.apiTokens ?? []} {form} />
					{:else if activeSection === 'danger'}
						<AccountDangerSection userId={user.id} />
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
