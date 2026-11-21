<!--
	The nav bell: unread badge (capped at 99+), the dropdown feed, mark-read
	then navigate, mark all read, and the push section. Replaces
	`src/lib/components/NotificationBell.svelte`; the shell owns where it sits.

	The unread count is polled from the one `GET /api/notifications` every 60 s
	while mounted (Q-022 keeps the wire). Opening the dropdown does a full read.

	Data and seams come in as props, so the component never builds an api in a
	test: `api`, `toasts`, `env`, `navigate`, `now`, `zone`, `schedule`. The
	nav passes `goto`; a standalone mount falls back to a full page load.

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { relativeFromNow } from '$lib/kernel/time/relative';
	import { systemClock } from '$lib/kernel/time/clock';
	import { systemScheduler } from '$lib/kernel/time/scheduler';
	import { createToasts, type Toasts } from '$lib/kernel/client/toasts.svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import { createAlertsApi, type AlertsApi } from '../alerts.api';
	import { alertGlyph, alertLabel, alertTone } from '../alerts.vocabulary.rules';
	import { browserPushEnvironment, type PushEnvironment } from '../alerts.push.api';
	import { AlertsBellState, type AlertsBellApi } from '../alerts.bell.state.svelte.js';
	import { browserAlertZone } from '../alerts.state.svelte.js';
	import PushToggle from './PushToggle.svelte';

	interface Props {
		api?: AlertsBellApi;
		toasts?: Toasts;
		env?: PushEnvironment;
		navigate?: (link: string) => void | Promise<void>;
		now?: Date;
		zone?: string;
		/** The badge poll interval; the legacy bell used 60 s. */
		pollMs?: number;
	}

	let {
		api = createAlertsApi(),
		toasts,
		env = browserPushEnvironment(),
		navigate,
		now = systemClock.now(),
		zone = browserAlertZone(),
		pollMs = 60_000
	}: Props = $props();

	// A standalone mount brings its own toaster; a caller (or a test) that
	// passes one renders it.
	const ownToasts = createToasts();
	const activeToasts: Toasts = toasts ?? ownToasts;

	const state = new AlertsBellState(api, activeToasts, {
		navigate: navigate ?? ((link: string) => void openLink(link)),
		now,
		zone,
		env,
		schedule: systemScheduler
	});

	/** Fallback navigation when no client router was handed in. */
	function openLink(link: string): void {
		if (typeof window !== 'undefined') window.location.assign(link);
	}

	function closeDropdown(event: MouseEvent): void {
		// Non-Element event targets (e.g. document) count as outside clicks.
		const target = event.target instanceof Element ? event.target : null;
		if (!target?.closest('[data-testid="notification-bell-container"]')) state.close();
	}

	onMount(() => {
		void state.refreshCount();
		const poll = setInterval(() => void state.refreshCount(), pollMs);
		void state.initPush();
		return () => clearInterval(poll);
	});
</script>

<svelte:window onclick={closeDropdown} />

<div class="relative" data-testid="notification-bell-container">
	<button
		type="button"
		onclick={() => state.toggle()}
		class="relative flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
		aria-expanded={state.open}
		aria-haspopup="true"
		aria-label={state.triggerLabel}
	>
		<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
			/>
		</svg>
		{#if state.unreadCount > 0}
			<span
				class="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white"
			>
				{state.badge}
			</span>
		{/if}
	</button>

	{#if state.open}
		<div
			transition:slide={{ duration: 150 }}
			class="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white py-2 shadow-lg"
		>
			<p class="border-b border-slate-100 px-4 pb-2 text-sm font-semibold text-slate-900">
				Notifications
			</p>
			{#if state.loading}
				<p class="px-4 py-4 text-sm text-slate-500">Loading…</p>
			{:else if state.loadError}
				<div class="flex items-center justify-between gap-2 px-4 py-3 text-sm">
					<span class="text-slate-500">Couldn't load notifications.</span>
					<button
						type="button"
						onclick={() => void state.load()}
						class="text-sm font-medium text-primary-600 hover:text-primary-700"
					>
						Retry
					</button>
				</div>
			{:else if state.rows.length === 0}
				<p class="px-4 py-4 text-sm text-slate-500">
					No notifications yet — all quiet on the home front.
				</p>
			{:else}
				<ul class="max-h-80 overflow-y-auto">
					{#each state.rows as row (row.id)}
						<li>
							<button
								type="button"
								onclick={() => void state.markRead(row)}
								class="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-100 {row.readAt
									? ''
									: 'bg-slate-50'}"
							>
								<span
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold {alertTone(
										row.rawType
									)}"
									aria-hidden="true"
								>
									{alertGlyph(row.rawType)}
								</span>
								<span class="min-w-0 flex-1">
									<span
										class="block truncate text-sm {row.readAt
											? 'text-slate-600'
											: 'font-bold text-slate-900'}"
									>
										{row.message}
									</span>
									<span class="mt-0.5 flex items-center gap-2">
										<span
											class="inline-flex h-4 items-center rounded-full px-1.5 text-[10px] font-bold {alertTone(
												row.rawType
											)}"
										>
											{alertLabel(row.rawType)}
										</span>
										<span class="truncate text-xs text-slate-400">
											{relativeFromNow(row.createdAt, state.now, state.zone)}
										</span>
									</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			{#if state.unreadCount > 0}
				<div class="mt-2 border-t border-slate-100 pt-2">
					<button
						type="button"
						onclick={() => void state.markAllRead()}
						class="w-full px-4 py-2 text-left text-sm font-medium text-primary-600 hover:bg-primary-50"
					>
						Mark all read
					</button>
				</div>
			{/if}
			<PushToggle
				state={state.pushState}
				serverReady={state.pushServerReady}
				busy={state.pushBusy}
				feedback={state.pushFeedback}
				onenable={() => void state.enablePush()}
				ondisable={() => void state.disablePush()}
			/>
		</div>
	{/if}
</div>

{#if !toasts}
	<Toaster items={ownToasts.items} ondismiss={ownToasts.dismiss} />
{/if}
