<!--
	The nav bell: unread badge (capped at 99+), the dropdown feed, mark-read
	then navigate, mark all read, and the push section. Replaces
	`src/lib/components/NotificationBell.svelte`; the shell owns where it sits.

	The unread count is polled from the one `GET /api/notifications` every 60 s
	while mounted (Q-022 keeps the wire). Opening the dropdown does a full read.

	The dropdown body (rows, mark-all, push) is `AlertsBellPanel.svelte`, lazily
	imported on open: the closed bell every app page ships is the trigger and the
	badge, and the panel's relative-age formatter + push block stay out of first
	paint (ADR 0010).

	Data and seams come in as props, so the component never builds an api in a
	test: `api`, `toasts`, `env`, `navigate`, `now`, `zone`, `schedule`. The
	nav passes `goto`; a standalone mount falls back to a full page load.

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { systemClock } from '$lib/kernel/time/clock';
	import { systemScheduler } from '$lib/kernel/time/scheduler';
	import { createToasts, type Toasts } from '$lib/kernel/client/toasts.svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import { createAlertsApi, type AlertsApi } from '../alerts.api';
	import { browserPushEnvironment, type PushEnvironment } from '../alerts.push.api';
	import { AlertsBellState, type AlertsBellApi } from '../alerts.bell.state.svelte.js';
	import { browserAlertZone } from '../alerts.state.svelte.js';

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
		{#await import('./AlertsBellPanel.svelte') then { default: AlertsBellPanel }}
			<AlertsBellPanel {state} />
		{/await}
	{/if}
</div>

{#if !toasts}
	<Toaster items={ownToasts.items} ondismiss={ownToasts.dismiss} />
{/if}
