<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { pushToast } from '$lib/client/toasts';
	import { relativeTime } from '$lib/utils/dateUtils';
	import {
		notificationGlyph,
		notificationLabel,
		notificationTone,
		type NotificationRow
	} from '$lib/utils/notificationTypes';
	import {
		getPushState,
		getServerPublicKey,
		isPushSupported,
		pushFailureText,
		subscribeToPush,
		unsubscribeFromPush,
		type PushState
	} from '$lib/utils/pushClient';

	let open = false;
	let loading = false;
	let loadError = false;
	let unreadCount = 0;
	// Rows arrive guarded from /api/notifications (issue 073), so `type` is the
	// known type or null and the label tables here are the shared ones.
	let notifications: NotificationRow[] = [];

	async function fetchSummary() {
		try {
			const res = await fetch('/api/notifications');
			if (!res.ok) return;
			const data = await res.json();
			unreadCount = data.unreadCount ?? 0;
		} catch {
			// bell stays silent on transient failures
		}
	}

	async function fetchList() {
		loading = true;
		loadError = false;
		try {
			const res = await fetch('/api/notifications');
			if (!res.ok) {
				loadError = true;
				return;
			}
			const data = await res.json();
			notifications = data.notifications ?? [];
			unreadCount = data.unreadCount ?? 0;
		} catch {
			loadError = true;
		} finally {
			loading = false;
		}
	}

	function toggle() {
		open = !open;
		if (open) fetchList();
	}

	function closeDropdown(e: MouseEvent) {
		// Non-Element event targets (e.g. document) count as outside clicks.
		const target = e.target instanceof Element ? e.target : null;
		if (!target?.closest('[data-testid="notification-bell-container"]')) {
			open = false;
		}
	}

	async function markRead(notification: NotificationRow) {
		open = false;
		if (!notification.readAt) {
			notification.readAt = new Date().toISOString();
			unreadCount = Math.max(0, unreadCount - 1);
			const ok = await post({ id: notification.id });
			if (!ok) {
				notification.readAt = null;
				unreadCount += 1;
				pushToast({ message: "Couldn't mark that alert read — it stays in your list." });
			}
		}
		if (notification.link) goto(notification.link);
	}

	async function markAllRead() {
		const before = notifications;
		notifications = notifications.map((n) => ({
			...n,
			readAt: n.readAt ?? new Date().toISOString()
		}));
		unreadCount = 0;
		if (!(await post({ all: true }))) {
			notifications = before;
			unreadCount = before.filter((n) => !n.readAt).length;
			pushToast({ message: "Couldn't mark everything read — try again." });
		}
	}

	/** POSTs a read-mark and reports whether the server took it. */
	async function post(body: { id: string } | { all: true }): Promise<boolean> {
		try {
			const res = await fetch('/api/notifications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			return res.ok;
		} catch {
			return false;
		}
	}

	let pushState: PushState | null = null;
	let pushServerReady = false;
	let pushBusy = false;
	let pushFeedback: '' | 'success' | 'error' = '';
	let pushFeedbackText = '';
	let pushFeedbackTimer: ReturnType<typeof setTimeout> | undefined;

	function showPushFeedback(value: '' | 'success' | 'error', text = '') {
		pushFeedback = value;
		pushFeedbackText = text;
		clearTimeout(pushFeedbackTimer);
		if (value) pushFeedbackTimer = setTimeout(() => (pushFeedback = ''), 3000);
	}

	async function enablePush() {
		pushBusy = true;
		showPushFeedback('');
		const result = await subscribeToPush();
		pushState = await getPushState();
		pushBusy = false;
		if (!result.ok) console.error('[push] enable failed:', result.reason);
		showPushFeedback(
			result.ok ? 'success' : 'error',
			result.ok ? 'Push notifications enabled.' : pushFailureText(result.reason)
		);
	}

	async function disablePush() {
		pushBusy = true;
		await unsubscribeFromPush();
		pushState = await getPushState();
		pushBusy = false;
	}

	onMount(() => {
		// Unread count refresh: poll every 60s while mounted so the badge
		// stays live in-session (opening the dropdown does a full refresh).
		// Reuses the single /api/notifications GET — no dedicated count
		// endpoint exists yet.
		fetchSummary();
		const poll = setInterval(() => void fetchSummary(), 60_000);
		return () => clearInterval(poll);
	});

	onMount(() => {
		void (async () => {
			if (!(await isPushSupported())) return;
			const [state, publicKey] = await Promise.all([getPushState(), getServerPublicKey()]);
			pushState = state;
			pushServerReady = publicKey !== null;
		})();
	});
</script>

<svelte:window on:click={closeDropdown} />

<div class="relative" data-testid="notification-bell-container">
	<button
		on:click={toggle}
		class="relative flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
		aria-expanded={open}
		aria-haspopup="true"
		aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
	>
		<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
			/>
		</svg>
		{#if unreadCount > 0}
			<span
				class="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white"
			>
				{unreadCount > 99 ? '99+' : unreadCount}
			</span>
		{/if}
	</button>

	{#if open}
		<div
			transition:slide={{ duration: 150 }}
			class="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white py-2 shadow-lg"
		>
			<p class="border-b border-slate-100 px-4 pb-2 text-sm font-semibold text-slate-900">
				Notifications
			</p>
			{#if loading}
				<p class="px-4 py-4 text-sm text-slate-500">Loading…</p>
			{:else if loadError}
				<div class="flex items-center justify-between gap-2 px-4 py-3 text-sm">
					<span class="text-slate-500">Couldn't load notifications.</span>
					<button
						on:click={fetchList}
						class="text-sm font-medium text-primary-600 hover:text-primary-700"
					>
						Retry
					</button>
				</div>
			{:else if notifications.length === 0}
				<p class="px-4 py-4 text-sm text-slate-500">
					No notifications yet — all quiet on the home front.
				</p>
			{:else}
				<ul class="max-h-80 overflow-y-auto">
					{#each notifications as notification (notification.id)}
						<li>
							<button
								on:click={() => markRead(notification)}
								class="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-100 {notification.readAt
									? ''
									: 'bg-slate-50'}"
							>
								<span
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold {notificationTone(
										notification.rawType ?? notification.type
									)}"
									aria-hidden="true"
								>
									{notificationGlyph(notification.rawType ?? notification.type)}
								</span>
								<span class="min-w-0 flex-1">
									<span
										class="block truncate text-sm {notification.readAt
											? 'text-slate-600'
											: 'font-bold text-slate-900'}"
									>
										{notification.message}
									</span>
									<span class="mt-0.5 flex items-center gap-2">
										<span
											class="inline-flex h-4 items-center rounded-full px-1.5 text-[10px] font-bold {notificationTone(
												notification.rawType ?? notification.type
											)}"
										>
											{notificationLabel(notification.rawType ?? notification.type)}
										</span>
										<span class="truncate text-xs text-slate-400"
											>{relativeTime(notification.createdAt)}</span
										>
									</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			{#if unreadCount > 0}
				<div class="mt-2 border-t border-slate-100 pt-2">
					<button
						on:click={markAllRead}
						class="w-full px-4 py-2 text-left text-sm font-medium text-primary-600 hover:bg-primary-50"
					>
						Mark all read
					</button>
				</div>
			{/if}
			{#if pushState && (pushState === 'denied' || (pushState !== 'unsupported' && pushServerReady))}
				<div class="mt-2 border-t border-slate-100 pt-2 text-sm">
					{#if pushState === 'unsubscribed'}
						<button
							on:click={enablePush}
							disabled={pushBusy}
							class="w-full px-4 py-2 text-left text-sm font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
						>
							{pushBusy ? 'Enabling…' : 'Enable push notifications'}
						</button>
						{#if pushFeedback === 'success'}
							<p class="px-4 pb-1.5 pt-1 text-xs text-green-600">Push notifications enabled.</p>
						{:else if pushFeedback === 'error'}
							<p class="px-4 pb-1.5 pt-1 text-xs text-red-500">{pushFeedbackText}</p>
						{/if}
					{:else if pushState === 'subscribed'}
						<div class="flex items-center justify-between px-4 py-2">
							<span class="text-slate-500">
								<span class="text-green-600" aria-hidden="true">✓</span> Push notifications on
							</span>
							<button
								on:click={disablePush}
								disabled={pushBusy}
								class="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50"
							>
								Turn off
							</button>
						</div>
					{:else if pushState === 'denied'}
						<p class="px-4 py-2 text-slate-400">Notifications blocked in browser settings.</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
