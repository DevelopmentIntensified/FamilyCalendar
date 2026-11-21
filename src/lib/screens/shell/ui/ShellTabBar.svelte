<!--
	The phone tab bar: all six destinations, the Alerts badge, and the class-only
	hide while an on-screen keyboard is open.

	Both navs read the ONE list (`shellNavItems`) and the ONE active rule
	(`shellActiveHref`) — the duplicate copy is what let Groceries be reachable
	on a laptop and nowhere on a phone (issue 065). Alerts keeps its tab here
	even though the desktop header shows a bell (`bellInstead`).

	The responsive surface is `md:hidden`; the badge count is a prop, so this
	component never fetches (the chrome's badge state owns the read). While the
	keyboard is open the bar only gains a class — it never unmounts, so a screen
	reader keeps seeing the navigation (`BottomNav.svelte:88-118`).

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { shellActiveHref, shellNavItems } from '../shell.nav.rules';
	import { shellIsKeyboardOpen } from '../shell.frame.rules';

	interface Props {
		pathname: string;
		/** The Alerts unread count; the accessible name carries it untruncated. */
		unreadCount: number;
	}

	let { pathname, unreadCount }: Props = $props();

	const items = shellNavItems;
	const activeHref = $derived(shellActiveHref(pathname));
	const alertsHref = '/calendar/notifications';

	let keyboardOpen = $state(false);

	function syncKeyboard(): void {
		keyboardOpen = shellIsKeyboardOpen(
			window.innerHeight,
			typeof window.visualViewport === 'undefined' ? null : window.visualViewport.height
		);
	}

	onMount(() => {
		syncKeyboard();
		window.visualViewport?.addEventListener('resize', syncKeyboard);
		window.visualViewport?.addEventListener('scroll', syncKeyboard);
		window.addEventListener('resize', syncKeyboard);
		return () => {
			window.visualViewport?.removeEventListener('resize', syncKeyboard);
			window.visualViewport?.removeEventListener('scroll', syncKeyboard);
			window.removeEventListener('resize', syncKeyboard);
		};
	});

	/** The badge text: two digits, then `99+`. */
	const badgeText = $derived(unreadCount > 99 ? '99+' : String(unreadCount));

	/** The full label is the accessible name; only `shortLabel` tabs need one. */
	function ariaLabel(href: string, label: string, shortLabel?: string): string | undefined {
		if (href === alertsHref && unreadCount > 0) return `Alerts (${unreadCount} unread)`;
		return shortLabel ? label : undefined;
	}
</script>

<nav
	class="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-sm md:hidden print:hidden {keyboardOpen
		? 'pointer-events-none opacity-0 transition-opacity'
		: 'transition-opacity'}"
	aria-label="Primary navigation"
	data-testid="shell-tab-bar"
>
	<div
		class="grid"
		style="padding-bottom: env(safe-area-inset-bottom); grid-template-columns: repeat({items.length}, minmax(0, 1fr))"
	>
		{#each items as item (item.href)}
			{@const on = activeHref === item.href}
			<a
				href={item.href}
				data-sveltekit-preload-data="hover"
				aria-current={on ? 'page' : undefined}
				aria-label={ariaLabel(item.href, item.label, item.shortLabel)}
				class="flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 py-2.5"
			>
				<span
					class="relative flex h-7 items-center justify-center rounded-full transition-colors {on
						? 'bg-primary-50 text-primary-600'
						: 'text-slate-400'}"
				>
					<svg
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- icons are static in-file literals, never user input -->
						{@html item.icon}
					</svg>
					{#if item.href === alertsHref && unreadCount > 0}
						<span
							class="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-semibold leading-none text-white"
						>
							{badgeText}
						</span>
					{/if}
				</span>
				<span
					class="w-full truncate px-0.5 text-center text-[11px] font-medium leading-none {on
						? 'text-primary-600'
						: 'text-slate-500'}"
				>
					{item.shortLabel ?? item.label}
				</span>
			</a>
		{/each}
	</div>
</nav>
