<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { DateTime } from 'luxon';
	import type { PageData } from './$types';

	export let data: PageData;

	$: notifications = data.notifications;
	$: unreadCount = data.unreadCount;

	const typeIcons: Record<string, string> = {
		assignment_accepted: '👍',
		assignment_declined: '👋',
		task_completed: '✅'
	};

	function relativeTime(iso: string): string {
		return DateTime.fromISO(iso).toRelative() ?? '';
	}

	async function markAllRead() {
		await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ all: true })
		}).catch(() => {});
		// Server rows are the source of truth: re-run this page load even if
		// the POST raced so the list and count mirror the DB.
		await invalidateAll().catch(() => {});
	}

	async function openNotification(notification: {
		id: string;
		readAt?: string | null;
		link?: string | null;
	}) {
		const shouldMark = !notification.readAt;
		if (shouldMark) {
			await fetch('/api/notifications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: notification.id })
			}).catch(() => {});
		}
		if (notification.link) {
			goto(notification.link);
		} else if (shouldMark) {
			await invalidateAll().catch(() => {});
		}
	}
</script>

<div class="mx-auto w-full max-w-2xl px-4 py-6">
	<div class="mb-4 flex items-center justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-slate-900">Notifications</h1>
			{#if unreadCount > 0}
				<p class="text-sm text-slate-500">{unreadCount} unread</p>
			{/if}
		</div>
		{#if unreadCount > 0}
			<button
				on:click={markAllRead}
				class="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50"
			>
				Mark all read
			</button>
		{/if}
	</div>

	{#if notifications.length === 0}
		<div class="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
			<p class="text-3xl" aria-hidden="true">🔔</p>
			<p class="mt-3 text-sm font-semibold text-slate-700">No notifications yet</p>
			<p class="mt-1 text-sm text-slate-400">
				When family members accept, decline, or complete your tasks, you'll see it here.
			</p>
		</div>
	{:else}
		<ul class="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			{#each notifications as notification (notification.id)}
				{@const unread = !notification.readAt}
				<li>
					<button
						on:click={() => openNotification(notification)}
						class="flex w-full items-start gap-3 px-4 py-3.5 text-left {unread
							? 'bg-slate-50'
							: ''}"
					>
						<span class="mt-0.5 text-lg leading-5" aria-hidden="true"
							>{typeIcons[notification.type] ?? '🔔'}</span
						>
						<span class="min-w-0 flex-1">
							<span
								class="block text-sm {unread ? 'font-semibold text-slate-900' : 'text-slate-600'}"
							>
								{notification.message}
							</span>
							<span class="mt-0.5 block text-xs text-slate-400">
								{notification.actorName} · {relativeTime(notification.createdAt)}
							</span>
						</span>
						{#if unread}
							<span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary-600" aria-hidden="true"></span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>