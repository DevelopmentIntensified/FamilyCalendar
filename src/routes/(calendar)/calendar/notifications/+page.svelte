<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { pushToast } from '$lib/client/toasts';
	import { relativeTime } from '$lib/utils/dateUtils';
	import {
		filterNotifications,
		groupNotifications,
		notificationCounts,
		notificationGlyph,
		notificationLabel,
		notificationTone,
		type NotificationFilter,
		type NotificationRow
	} from '$lib/utils/notificationTypes';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let filter: NotificationFilter = $state('all');
	let markingAll = $state(false);

	// Server rows are the source of truth; these two are what we render, so a
	// read-mark can land instantly and then be reconciled by the reload.
	let rows: NotificationRow[] = $state(data.notifications);
	let unreadCount: number = $state(data.unreadCount);

	$effect(() => {
		rows = data.notifications;
		unreadCount = data.unreadCount;
	});

	const counts = $derived(notificationCounts(rows));
	const groups = $derived(groupNotifications(filterNotifications(rows, filter)));

	async function postNotifications(body: { id: string } | { all: true }): Promise<boolean> {
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

	function markLocallyRead(id: string) {
		rows = rows.map((r) =>
			r.id === id && !r.readAt ? { ...r, readAt: new Date().toISOString() } : r
		);
		unreadCount = Math.max(0, unreadCount - 1);
	}

	async function markAllRead() {
		if (markingAll) return;
		markingAll = true;
		const before = rows;
		const beforeCount = unreadCount;
		rows = rows.map((r) => (r.readAt ? r : { ...r, readAt: new Date().toISOString() }));
		unreadCount = 0;
		markingAll = false;
		if (await postNotifications({ all: true })) {
			pushToast({ message: 'Everything marked as read.' });
			await invalidateAll();
		} else {
			rows = before;
			unreadCount = beforeCount;
			pushToast({ message: "Couldn't mark everything read — try again." });
		}
	}

	/**
	 * A modified click (new tab, new window) is left to the browser: opening a
	 * tab must not race a read-mark, and the anchor is a real link either way.
	 */
	function onRowClick(event: MouseEvent, row: NotificationRow) {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) {
			return;
		}
		event.preventDefault();
		void openRow(row);
	}

	async function openRow(row: NotificationRow) {
		if (row.readAt) {
			if (row.link) await goto(row.link);
			return;
		}
		markLocallyRead(row.id);
		const ok = await postNotifications({ id: row.id });
		if (ok) {
			await invalidateAll();
		} else {
			pushToast({ message: "Couldn't mark that alert read — opening it anyway." });
		}
		if (row.link) await goto(row.link);
	}
</script>

{#snippet rowInner(row: NotificationRow)}
	<span class="w-2 shrink-0 pt-1.5">
		{#if !row.readAt}
			<span class="block h-2 w-2 rounded-full bg-primary-600" data-testid="unread-dot"></span>
		{/if}
	</span>
	<span
		class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold {notificationTone(
			row.rawType
		)}"
		aria-hidden="true"
	>
		{notificationGlyph(row.rawType)}
	</span>
	<span class="min-w-0 flex-1">
		<span
			class="block text-sm leading-snug {row.readAt
				? 'text-slate-600'
				: 'font-semibold text-slate-900'}"
		>
			<span class="font-semibold">{row.actorName}</span>
			{row.message}
		</span>
		<span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
			<span
				class="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-bold {notificationTone(
					row.rawType
				)}"
			>
				{notificationLabel(row.rawType)}
			</span>
			<span class="text-xs text-slate-400">{relativeTime(row.createdAt)}</span>
		</span>
	</span>
{/snippet}

<div class="mx-auto w-full max-w-2xl px-4 py-6">
	<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-slate-900">Alerts</h1>
			<p class="text-sm text-slate-500" data-testid="unread-count">
				{unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
			</p>
		</div>
		{#if unreadCount > 0}
			<button
				type="button"
				onclick={markAllRead}
				disabled={markingAll}
				class="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50"
			>
				{markingAll ? 'Marking…' : 'Mark all read'}
			</button>
		{/if}
	</div>

	{#if rows.length === 0}
		<div class="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
			<p class="text-3xl" aria-hidden="true">🔔</p>
			<p class="mt-3 text-sm font-semibold text-slate-700">No alerts yet</p>
			<p class="mt-1 text-sm text-slate-400">
				When family members assign you tasks, accept, decline, or complete them — or add you to
				their family — you'll see it here.
			</p>
		</div>
	{:else}
		<div class="mb-4 flex flex-wrap gap-2">
			{#each [{ key: 'all', label: 'All', n: counts.all }, { key: 'needs_you', label: 'Needs you', n: counts.needsYou }, { key: 'unread', label: 'Unread', n: counts.unread }] as chip (chip.key)}
				<button
					type="button"
					onclick={() => (filter = chip.key as NotificationFilter)}
					aria-pressed={filter === chip.key}
					class="h-9 rounded-full border px-3 text-xs font-semibold transition-colors {filter ===
					chip.key
						? 'border-primary-600 bg-primary-600 text-white'
						: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}"
				>
					{chip.label} <span class="opacity-70">{chip.n}</span>
				</button>
			{/each}
		</div>

		{#if groups.needsYou.length === 0 && groups.news.length === 0}
			<p
				class="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-400"
			>
				Nothing matches this filter.
			</p>
		{/if}

		{#each [{ key: 'needs_you', title: 'Needs you', rows: groups.needsYou }, { key: 'news', title: 'Just news', rows: groups.news }] as section (section.key)}
			{#if section.rows.length}
				<section aria-labelledby={`alerts-${section.key}`} class="mb-4">
					<div class="mb-1 px-1">
						<h2 id={`alerts-${section.key}`} class="text-sm font-bold text-slate-900">
							{section.title}
							<span class="font-normal text-slate-400">{section.rows.length}</span>
						</h2>
					</div>
					<ul
						aria-label={section.title}
						class="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
					>
						{#each section.rows as row (row.id)}
							<li
								data-unread={row.readAt ? 'false' : 'true'}
								class={row.readAt ? '' : 'bg-slate-50'}
							>
								{#if row.link}
									<a
										href={row.link}
										onclick={(e) => onRowClick(e, row)}
										class="flex items-start gap-3 px-3 py-3 no-underline hover:bg-slate-100"
									>
										{@render rowInner(row)}
									</a>
								{:else}
									<button
										type="button"
										onclick={() => onRowClick(new MouseEvent('click'), row)}
										class="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-slate-100"
									>
										{@render rowInner(row)}
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/each}
	{/if}
</div>
