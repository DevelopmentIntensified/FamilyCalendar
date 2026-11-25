<!--
	The /account page body: the breadcrumbs, the "Account Settings" header and
	Back link, the rail, the one banner, and the section the hash names.

	The server never sees a fragment, so the first paint carries the profile
	section (Q-077); any other section is fetched once through the screen's state
	class and cached for the visit. Pending sections show skeletons, a failed
	fetch offers a retry, and the banner above the card reads the action's answer
	(`account.form.rules.ts`).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import Skeleton from '$lib/kernel/ui/Skeleton.svelte';
	import { createToasts } from '$lib/kernel/client/toasts.svelte';
	import { createAccountApi } from '../account.api';
	import type { AccountPagePaint } from '../account.contract';
	import { accountBanner, type AccountActionForm } from '../account.form.rules';
	import { resolveAccountSection } from '../account.sections.rules';
	import {
		AccountScreenState,
		type AccountFormEnhancer
	} from '../account.state.svelte';
	import AccountSidebar from './AccountSidebar.svelte';

	interface Props {
		data: AccountPagePaint;
		form: AccountActionForm | null;
		enhance: AccountFormEnhancer;
		/** The hash to open; the browser's own hash is read on mount when absent. */
		hash?: string;
	}

	let { data, form, enhance, hash }: Props = $props();

	const toasts = createToasts();
	const now = $derived(new Date(data.now));
	const state = new AccountScreenState(createAccountApi(), toasts, data.section, now);
	const banner = $derived(accountBanner(form));

	// The hash is the page's one piece of client routing: read it once, then
	// follow fragment changes without a reload.
	onMount(() => {
		const apply = () => void state.select(resolveAccountSection(location.hash));
		void state.select(resolveAccountSection(hash ?? location.hash));
		window.addEventListener('hashchange', apply);
		return () => window.removeEventListener('hashchange', apply);
	});

	const model = $derived(state.model());

	// The ten sections load as one chunk, on demand: the first paint ships the
	// chrome, the rail, the banner and (server-rendered) the default section
	// only (ADR 0010 — initial JS may only shrink).
	const sectionBody = import('./AccountSectionBody.svelte');
</script>

<svelte:head>
	<title>Account Settings - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 px-4 py-8 pt-20">
	<div class="mx-auto max-w-6xl">
		<nav class="mb-4 text-sm">
			<ol class="flex flex-wrap items-center space-x-2 text-slate-500">
				<li class="flex items-center">
					<a href="/calendar" class="transition-colors hover:text-primary-600">Calendar</a>
				</li>
				<li class="flex items-center">
					<svg class="mx-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5l7 7-7 7"
						/>
					</svg>
					<span class="font-medium text-slate-900">Account</span>
				</li>
			</ol>
		</nav>

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

		<div
			class="mt-6 grid grid-cols-1 items-start gap-4 min-[1000px]:grid-cols-[15rem_minmax(0,1fr)]"
		>
			<AccountSidebar
				activeSection={state.active}
				user={data.user}
				onSelect={(section) => void state.select(section)}
			/>

			<div class="min-w-0">
				{#if banner?.kind === 'success'}
					<div class="mb-4 rounded-xl bg-green-50 p-4 text-sm text-green-800">
						{banner.message}
					</div>
				{:else if banner?.kind === 'error'}
					<div class="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
						{banner.message}
						{#if banner.guestNeedsClaim}
							<a href="/claim" class="ml-1 font-semibold underline"
								>Open the save-your-calendar flow →</a
							>
						{/if}
					</div>
				{/if}

				<!-- The placeholder's bars take the warm canvas token (`#f8f6f3`): the
				     kernel skeleton's slate-200 is not in the marketing colour set
				     and /account is audited for zero deviations (`#129`). -->
				<div class="rounded-[1.25rem] border border-slate-200 bg-white p-6">
					{#if state.loading === state.active}
						<Skeleton
							lines={5}
							label="Loading section"
							class="[&_[data-skeleton-line]]:bg-[#f8f6f3]"
						/>
					{:else if state.error}
						<div class="space-y-3">
							<p class="text-sm text-red-700">{state.error}</p>
							<button
								type="button"
								onclick={() => state.load(state.active)}
								class="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
							>
								Try again
							</button>
						</div>
					{:else if model}
						{#await sectionBody}
							<Skeleton
								lines={5}
								label="Loading section"
								class="[&_[data-skeleton-line]]:bg-[#f8f6f3]"
							/>
						{:then SectionBody}
							<SectionBody.default
								{model}
								{form}
								{now}
								{enhance}
								exporting={state.exporting}
								onExport={() => state.exportData()}
							/>
						{/await}
					{:else}
						<Skeleton
							lines={5}
							label="Loading section"
							class="[&_[data-skeleton-line]]:bg-[#f8f6f3]"
						/>
					{/if}
				</div>
			</div>
		</div>
	</div>
	<Toaster items={toasts.items} ondismiss={toasts.dismiss} />
</div>
