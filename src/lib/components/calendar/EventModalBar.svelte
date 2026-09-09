<script lang="ts">
	interface Props {
		showDeleteConfirm: boolean;
		showDuplicateConfirm: boolean;
		attachedTaskCount: number;
		isRecurring: boolean;
		eventTitle: string;
		duplicating: boolean;
		onDeleteScope: (scope?: 'this' | 'all') => void;
		onCancelDelete: () => void;
		onConfirmDuplicate: () => void;
		onCancelDuplicate: () => void;
		onBeginDelete: () => void;
		onBeginDuplicate: () => void;
		onEdit: () => void;
	}

	let {
		showDeleteConfirm,
		showDuplicateConfirm,
		attachedTaskCount,
		isRecurring,
		eventTitle,
		duplicating,
		onDeleteScope,
		onCancelDelete,
		onConfirmDuplicate,
		onCancelDuplicate,
		onBeginDelete,
		onBeginDuplicate,
		onEdit
	}: Props = $props();
</script>

<div
	class="relative flex shrink-0 items-center gap-2 border-t border-slate-100 px-2.5 py-2 sm:px-6 sm:py-3.5"
	style="padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 0.5rem)"
>
	<!-- Delete confirmation -->
	{#if showDeleteConfirm}
		<div class="absolute inset-x-3 bottom-full z-10 mb-2 sm:inset-x-6">
			<div class="rounded-xl border border-red-200 bg-red-50 p-4 shadow-xl">
				<p class="text-sm font-medium text-red-700">Delete this event?</p>
				{#if attachedTaskCount > 0}
					<p class="mt-1 text-xs text-red-600">
						⚠️ {attachedTaskCount} attached task(s) will also be deleted.
					</p>
				{/if}
				<div class="mt-3 flex flex-wrap items-center gap-2">
					{#if isRecurring}
						<button
							type="button"
							onclick={() => onDeleteScope('this')}
							class="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
						>
							This occurrence
						</button>
						<button
							type="button"
							onclick={() => onDeleteScope('all')}
							class="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
						>
							Whole series
						</button>
					{:else}
						<button
							type="button"
							onclick={() => onDeleteScope()}
							class="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
						>
							Delete
						</button>
					{/if}
					<button
						type="button"
						onclick={onCancelDelete}
						class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	{/if}
	<!-- Duplicate confirmation -->
	{#if showDuplicateConfirm}
		<div class="absolute inset-x-3 bottom-full z-10 mb-2 sm:inset-x-6">
			<div class="rounded-xl border border-primary-200 bg-primary-50 p-4 shadow-xl">
				<p class="text-sm font-medium text-primary-700">Duplicate this event?</p>
				<p class="mt-1 text-xs text-primary-600">
					A copy titled "{eventTitle} (copy)" will be created.
				</p>
				<div class="mt-3 flex flex-wrap items-center gap-2">
					<button
						type="button"
						onclick={onConfirmDuplicate}
						class="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
					>
						{duplicating ? 'Copying...' : 'Duplicate'}
					</button>
					<button
						type="button"
						onclick={onCancelDuplicate}
						class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	{/if}
	<button
		type="button"
		onclick={onBeginDelete}
		class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50 sm:w-auto sm:gap-1.5 sm:px-4 sm:text-sm sm:font-medium"
		aria-label="Delete event"
	>
		<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
			/>
		</svg>
		<span class="hidden sm:inline">Delete</span>
	</button>
	<button
		type="button"
		onclick={onBeginDuplicate}
		disabled={duplicating}
		class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:gap-1.5 sm:px-4 sm:text-sm sm:font-medium"
		aria-label="Duplicate event"
	>
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
			/>
		</svg>
		<span class="hidden sm:inline">{duplicating ? 'Copying...' : 'Duplicate'}</span>
	</button>
	<button
		type="button"
		onclick={onEdit}
		class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white transition-colors hover:bg-primary-700 sm:w-auto sm:flex-1 sm:gap-1.5 sm:px-4 sm:text-sm sm:font-medium"
		aria-label="Edit event"
	>
		<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
			/>
		</svg>
		<span class="hidden sm:inline">Edit Event</span>
	</button>
</div>
