<!--
	The root chrome: decides whether this route gets the app chrome at all
	(`shellChromeForRoute`), then renders the navbar, the page body, the tab bar
	and the toast host.

	It lives in the ROOT layout because `account`, `familyHub` and `calendarPage`
	are screens and a screen may not import another screen (R1) — the root layout
	is the only host every screen already has. Chrome mode is app-only today
	(calendar + family groups); account and admin widen the rule at their ports,
	and marketing keeps its own header.

	The badge is read once per chrome mount, not per navigation, because the
	chrome survives calendar ↔ family transitions. The offline REPLAY
	(`initOfflineSync`) is initialized here too, so a group switch no longer
	re-initializes it. No fetch happens on a non-app route, and no chrome renders
	for a route without a session (the root load has already redirected).

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { AlertsBell } from '$lib/domains/alerts/ui';
	import { initOfflineSync } from '$lib/kernel/client/offlineQueue';
	import { createToasts } from '$lib/kernel/client/toasts.svelte';
	import { systemClock } from '$lib/kernel/time/clock';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import type { ShellPorts, ShellUserSummary } from '../shell.contract';
	import { shellChromeForRoute } from '../shell.frame.rules';
	import { purgeShellDataCache } from '../shell.api';
	import { ShellBadgeState } from '../shell.badge.state.svelte.js';
	import ShellNavbar from './ShellNavbar.svelte';
	import ShellTabBar from './ShellTabBar.svelte';

	interface Props {
		/** `page.route.id`; null on a 404, which therefore gets no chrome. */
		routeId: string | null;
		pathname: string;
		/** `page.url.search`, for the bug link's `?from=`. */
		search: string;
		user: ShellUserSummary | null;
		ports: ShellPorts;
		/** `goto`, handed in by the route so this file never imports `$app/*`. */
		navigate: (href: string) => void | Promise<void>;
		children: Snippet;
	}

	let { routeId, pathname, search, user, ports, navigate, children }: Props = $props();

	const chrome = $derived(shellChromeForRoute(routeId));
	const toasts = createToasts();
	const badge = new ShellBadgeState(ports.badge, { now: () => systemClock.now().getTime() });

	onMount(() => {
		initOfflineSync();
		if (chrome !== 'app' || !user) return;
		void badge.refresh();
		const onVisibility = (): void => {
			if (document.visibilityState === 'visible') void badge.refreshIfStale();
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});
</script>

{#if chrome === 'app' && user}
	<div class="flex min-h-screen flex-col">
		{#snippet bell()}
			<AlertsBell {navigate} />
		{/snippet}
		<ShellNavbar {pathname} {search} {user} bell={bell} onLogoutSubmit={purgeShellDataCache} />
		{@render children()}
		<ShellTabBar {pathname} unreadCount={badge.count} />
		<Toaster items={toasts.items} ondismiss={toasts.dismiss} />
	</div>
{:else}
	{@render children()}
{/if}
