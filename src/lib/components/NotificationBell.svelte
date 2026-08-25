<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { DateTime } from 'luxon';
	import {
		getPushState,
		getServerPublicKey,
		isPushSupported,
		subscribeToPush,
		unsubscribeFromPush,
		type PushState
	} from '$lib/utils/pushClient';

	interface Notification {
		id: string;
		type: 'assignment_accepted' | 'assignment_declined' | 'task_completed';
		actorName: string;
		message: string;
		link?: string | null;
		readAt?: string | null;
		createdAt: string;
	}

	let open = false;
	let loading = false;
	let unreadCount = 0;
	let notifications: Notification[] = [];

	const typeIcons: Record<Notification['type'], string> = {
		assignment_accepted: '👍',
		assignment_declined: '👋',
		task_completed: '✅'
	};

	function relativeTime(iso: string): string {
		return DateTime.fromISO(iso).toRelative() ?? '';
	}

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
		try {
			const res = await fetch('/api/notifications');
			if (!res.ok) return;
			const data = await res.json();
			notifications = data.notifications ?? [];
			unreadCount = data.unreadCount ?? 0;
		} finally {
			loading = false;
		}
	}

	function toggle() {
		open = !open;
		if (open) fetchList();
	}

	function closeDropdown(e: MouseEvent) {
		const target = e.target as HTMLElement | null;
		if (!target?.closest?.('[data-testid="notification-bell-container"]')) {
			open = false;
		}
	}

	async function markRead(notification: Notification) {
		if (!notification.readAt) {
			notification.readAt = new Date().toISOString();
			unreadCount = Math.max(0, unreadCount - 1);
			fetch('/api/notifications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: notification.id })
			}).catch(() => {});
		}
		open = false;
		if (notification.link) goto(notification.link);
	}

	async function markAllRead() {
		notifications = notifications.map((n) => ({
			...n,
			readAt: n.readAt ?? new Date().toISOString()
		}));
		unreadCount = 0;
		await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ all: true })
		}).catch(() => {});
	}

	let pushState: PushState | null = null;
	let pushServerReady = false;
	let pushBusy = false;
	let pushFeedback: '' | 'success' | 'error' = '';
	let pushFeedbackTimer: ReturnType<typeof setTimeout> | undefined;

	function showPushFeedback(value: '' | 'success' | 'error') {
		pushFeedback = value;
		clearTimeout(pushFeedbackTimer);
		if (value) pushFeedbackTimer = setTimeout(() => (pushFeedback = ''), 3000);
	}

	async function enablePush() {
		pushBusy = true;
		showPushFeedback('');
		const result = await subscribeToPush();
		pushState = await getPushState();
		pushBusy = false;
		showPushFeedback(result.ok ? 'success' : 'error');
	}

	async function disablePush() {
		pushBusy = true;
		await unsubscribeFromPush();
		pushState = await getPushState();
		pushBusy = false;
	}

	onMount(async () => {
		fetchSummary();
		if (!(await isPushSupported())) return;
		const [state, publicKey] = await Promise.all([getPushState(), getServerPublicKey()]);
		pushState = state;
		pushServerReady = publicKey !== null;
	});
</script>

<svelte:window on:click={closeDropdown} />

<div class="relative" data-testid="notification-bell-container">
	<button
		on:click={toggle}
		class="relative rounded-full p-2 text-slate-600 hover:bg-slate-100"
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
				class="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white"
			>
				{unreadCount > 99 ? '99+' : unreadCount}
			</span>
		{/if}
	</button>

	{#if open}
		<div
			transition:slide={{ duration: 150 }}
			class="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white py-2 shadow-lg"
		>
			<p class="border-b border-slate-100 px-4 pb-2 text-sm font-semibold text-slate-900">
				Notifications
			</p>
			{#if loading}
				<p class="px-4 py-4 text-sm text-slate-500">Loading…</p>
			{:else if notifications.length === 0}
				<p class="px-4 py-4 text-sm text-slate-500">No notifications yet.</p>
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
								<span class="text-base leading-5">{typeIcons[notification.type] ?? '🔔'}</span>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm {notification.readAt ? 'text-slate-600' : 'font-bold text-slate-900'}">
										{notification.message}
									</span>
									<span class="block text-xs text-slate-400">{relativeTime(notification.createdAt)}</span>
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		{#if unreadCount > 0}
			<div class="border-t border-slate-100 mt-2 pt-2">
				<button
					on:click={markAllRead}
					class="w-full px-4 py-2 text-left text-sm font-medium text-primary-600 hover:bg-primary-50"
				>
					Mark all read
				</button>
			</div>
		{/if}
		{#if pushState && (pushState === 'denied' || (pushState !== 'unsupported' && pushServerReady))}
			<div class="border-t border-slate-100 mt-2 pt-2 text-sm">
				{#if pushState === 'unsubscribed'}
					<button
						on:click={enablePush}
						disabled={pushBusy}
						class="w-full px-4 py-2 text-left text-sm font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
					>
						{pushBusy ? 'Enabling…' : 'Enable push notifications'}
					</button>
					{#if pushFeedback === 'success'}
						<p class="px-4 pt-1 pb-1.5 text-xs text-green-600">Push notifications enabled.</p>
					{:else if pushFeedback === 'error'}
						<p class="px-4 pt-1 pb-1.5 text-xs text-red-500">Couldn't enable notifications.</p>
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
