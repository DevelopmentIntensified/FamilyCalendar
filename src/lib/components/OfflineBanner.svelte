<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { getPendingCount, isOnline, subscribeToOnlineStatus } from '$lib/utils/offline';

	let online = isOnline();
	let pendingCount = 0;
	let syncedCount: number | null = null;

	let syncTimer: ReturnType<typeof setTimeout>;
	let refreshTimer: ReturnType<typeof setTimeout>;

	async function updatePendingCount(announceSync = false): Promise<void> {
		const previous = pendingCount;
		pendingCount = await getPendingCount();
		if (announceSync && previous > 0 && pendingCount === 0) {
			syncedCount = previous;
			clearTimeout(syncTimer);
			syncTimer = setTimeout(() => {
				syncedCount = null;
			}, 4000);
		}
	}

	const unsubscribe = subscribeToOnlineStatus((value) => {
		online = value;
		if (!value) {
			clearTimeout(syncTimer);
			syncedCount = null;
		} else {
			clearTimeout(refreshTimer);
			refreshTimer = setTimeout(() => updatePendingCount(true), 2000);
		}
	});

	onMount(() => {
		updatePendingCount();
	});

	onDestroy(() => {
		unsubscribe();
		clearTimeout(syncTimer);
		clearTimeout(refreshTimer);
	});
</script>

{#if !online || pendingCount > 0 || syncedCount !== null}
	<div
		class="w-full border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900"
		role="status"
	>
		<p>
			You're offline — showing your recent events and tasks (this month, last month, next month).
			Months or tasks you haven't visited recently aren't available offline. Changes you make now
			will sync automatically when you're back online.
		</p>
		{#if pendingCount > 0}
			<p class="mt-1 font-medium">
				{pendingCount}
				{pendingCount === 1 ? 'change' : 'changes'} waiting to sync.
			</p>
		{:else if syncedCount !== null}
			<p class="mt-1 font-medium">
				Synced {syncedCount} {syncedCount === 1 ? 'change' : 'changes'}.
			</p>
		{/if}
	</div>
{/if}
