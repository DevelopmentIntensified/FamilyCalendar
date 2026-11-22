<!--
	The app chrome: decides whether this route gets it at all
	(`shellChromeForRoute`), then renders the navbar, the page body, the tab bar
	and the toast host.

	The three app-chrome layouts (`(calendar)/calendar`, `(calendar)/account`,
	`(family)`) render it; the root layout does not, so a bare page — `/claim`,
	`/merge-guest`, marketing, admin — ships neither the navbar nor the bell
	(ADR 0010). A group layout passes `$app/state`'s page in: the chrome needs
	only its route id, pathname and search, and keeping `$app/*` out of this
	file keeps it renderable in unit tests.

	The bell is alerts' component, handed in by the layout as a snippet — the
	same rule `ShellNavbar`/`ShellMobileMenu` follow. Importing it here would
	mean importing `alerts/ui`'s *entry* from the chrome, and that entry's other
	components (the feed, its toolbar and rows) then ride every page's first
	paint: measured at 9.9 KB gzip on all twelve app pages (ADR 0010).

	The badge is read once per chrome mount, not per navigation, because the
	chrome survives calendar ↔ family transitions. The offline REPLAY
	(`initOfflineSync`) is initialized here too, so a group switch no longer
	re-initializes it. No fetch happens on a non-app route, and no chrome renders
	for a route without a session (the root load has already redirected).

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { initOfflineSync } from '$lib/kernel/client/offlineQueue';
	import { sharedToasts } from '$lib/kernel/client/toasts.svelte';
	import { systemClock } from '$lib/kernel/time/clock';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import type { ShellPorts, ShellUserSummary } from '../shell.contract';
	import { shellChromeForRoute } from '../shell.frame.rules';
	import { purgeShellDataCache } from '../shell.api';
	import { ShellBadgeState } from '../shell.badge.state.svelte.js';
	import ShellNavbar from './ShellNavbar.svelte';
	import ShellTabBar from './ShellTabBar.svelte';

	interface Props {
		/** `$app/state`'s page: `route.id` is null on a 404, which gets no chrome. */
		page: { readonly route: { readonly id: string | null }; readonly url: URL };
		user: ShellUserSummary | null;
		ports: ShellPorts;
		/** Alerts' bell, handed in by the group layout (its entry, not this file's). */
		bell?: Snippet;
		children: Snippet;
	}

	let { page, user, ports, bell, children }: Props = $props();

	const routeId = $derived(page.route.id);
	const pathname = $derived(page.url.pathname);
	/** The bug link's `?from=`. */
	const search = $derived(page.url.search);
	const chrome = $derived(shellChromeForRoute(routeId));
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
		<ShellNavbar {pathname} {search} {user} {bell} onLogoutSubmit={purgeShellDataCache} />
		{@render children()}
		<ShellTabBar {pathname} unreadCount={badge.count} />
		<Toaster items={sharedToasts.items} ondismiss={sharedToasts.dismiss} />
	</div>
{:else}
	{@render children()}
{/if}
