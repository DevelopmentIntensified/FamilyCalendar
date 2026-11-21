<!--
	The group frame below the chrome: one fixed banner stack (the offline banner
	plus at most one notice) whose measured height offsets `<main>`, the page
	body, and the calendar-only md footer.

	The stack is measured with `bind:clientHeight` on a plain `<div>` — the ONE
	bind in this module, and the reason the legacy `onVisibleChange` callback
	exists at all (#200: a `bind:` on a COMPONENT made Svelte 5.20.1 emit its
	legacy SSR settle loop and 500 every `/calendar` GET). Offline visibility now
	comes from the state class instead, so no component prop is bound.

	The family variant gets the same measured frame and no footer, which also
	fixes the legacy overlap: `(family)/+layout.svelte` fixed its banner at
	`top: calc(4rem + safe-area)` while `<main>` only had static padding.

	The calendar variant owns the once-per-user time-zone probe; the family
	variant renders no notices at all (legacy parity).

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import { systemScheduler } from '$lib/kernel/time/scheduler';
	import { isAnonymousAccount } from '$lib/domains/identity';
	import type { ShellFrameScope, ShellNoticeKind, ShellPorts } from '../shell.contract';
	import { shellBannerOffset } from '../shell.frame.rules';
	import { shellNoticeFor } from '../shell.notices.rules';
	import { ShellOfflineState } from '../shell.offline.state.svelte.js';
	import { ShellTimezoneState, type ShellZoneStorage } from '../shell.timezone.state.svelte.js';
	import { ShellVerifyState } from '../shell.verify.state.svelte.js';
	import ShellNotices from './ShellNotices.svelte';
	import ShellOfflineBanner from './ShellOfflineBanner.svelte';

	interface Props {
		variant: 'calendar' | 'family';
		/** The group's layout data; the calendar scope narrows to this shape. */
		scope: ShellFrameScope;
		/** `page.url.search` — the notices and the countdown's own params. */
		search?: string;
		ports: ShellPorts;
		/** Re-reads the group scope after a zone save or a successful verify. */
		refresh?: () => void;
		children: Snippet;
	}

	let { variant, scope, search = '', ports, refresh, children }: Props = $props();

	const user = $derived(scope.user);

	const isCalendar = variant === 'calendar';
	const offline = new ShellOfflineState(ports.offline, { schedule: systemScheduler });
	const verify = new ShellVerifyState(ports.verify, {
		schedule: systemScheduler,
		onVerified: () => refresh?.()
	});

	/** Per-mount dismissals; the countdown is never stored here (it cannot close). */
	let dismissed = $state<Partial<Record<ShellNoticeKind, boolean>>>({});

	const viewer = $derived({
		isAnonymous: isAnonymousAccount(user),
		emailVerified: user.emailVerified
	});
	const notice = $derived(
		isCalendar
			? shellNoticeFor({
					searchParams: new URLSearchParams(search),
					viewer,
					daysLeft: scope.daysLeft ?? 0,
					dismissed
				})
			: null
	);

	/** The stack's measured height; 0 before the first measurement (SSR). */
	let stackHeight = $state(0);
	const bannerCount = $derived((offline.visible ? 1 : 0) + (notice ? 1 : 0));
	const bannerOffset = $derived(shellBannerOffset(stackHeight, bannerCount));

	function dismiss(kind: Exclude<ShellNoticeKind, 'anonymous'>): void {
		dismissed = { ...dismissed, [kind]: true };
	}

	/** A storage that a locked-down browser cannot open reads as absent. */
	function browserStorage(): ShellZoneStorage | null {
		try {
			return typeof localStorage === 'undefined' ? null : localStorage;
		} catch {
			return null;
		}
	}

	onMount(() => {
		void offline.start();
		const zone = new ShellTimezoneState(ports.timezone, {
			userId: user.id,
			storage: browserStorage(),
			resolveZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone
		});
		void zone.probe(isCalendar ? (scope.settings?.timeZone ?? null) : undefined).then((saved) => {
			if (saved) refresh?.();
		});
		return () => offline.stop();
	});
</script>

<div
	class="fixed left-0 top-[calc(4rem+env(safe-area-inset-top))] z-40 flex w-full flex-col print:hidden"
	data-testid="calendar-banner-stack"
	bind:clientHeight={stackHeight}
>
	<ShellOfflineBanner state={offline} stacked />
	{#if notice}
		<ShellNotices {notice} {verify} onDismiss={dismiss} />
	{/if}
</div>
<main
	class="flex-grow pb-28 pt-[calc(4rem+env(safe-area-inset-top))] print:!mt-0 print:min-h-0 print:!pb-0 print:!pt-0 {isCalendar
		? 'md:pb-24'
		: 'md:pb-8'}"
	style:margin-top={bannerOffset ? `${bannerOffset}px` : undefined}
	data-testid="shell-main"
>
	<div in:fade|local={{ duration: 100 }}>
		{@render children()}
	</div>
</main>
{#if isCalendar}
	<footer
		class="fixed bottom-0 left-0 z-30 hidden w-full border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-500 md:block print:hidden"
		data-testid="shell-footer"
	>
		<div class="flex items-center justify-center gap-4">
			<span>&copy; {scope.year} FamilyPlanz</span>
			<span class="text-slate-300">|</span>
			<a href="/about" class="hover:text-primary-600">About</a>
			<a href="/privacy" class="hover:text-primary-600">Privacy</a>
			<a href="/contact" class="hover:text-primary-600">Contact</a>
		</div>
	</footer>
{/if}
