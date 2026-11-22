<!--
	The bell's dropdown body — the feed rows, "Mark all read" and the push
	section — in its own lazily imported chunk.

	`AlertsBell` renders it only while the dropdown is open (`{#if state.open}`
	around an `{#await import(…)}`), so the closed bell that every app page
	carries in its first paint costs the trigger and the badge, not the panel:
	the rows' relative-age formatter and the push block (ADR 0010; the same
	split the day dashboard's event sheet uses). State and behaviour stay in
	`AlertsBellState`; this file is markup only.

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import { slide } from 'svelte/transition';
	import { relativeFromNow } from '$lib/kernel/time/relative';
	import { alertGlyph, alertLabel, alertTone } from '../alerts.vocabulary.rules';
	import type { AlertsBellState } from '../alerts.bell.state.svelte.js';
	import PushToggle from './PushToggle.svelte';

	interface Props {
		state: AlertsBellState;
	}

	let { state }: Props = $props();
</script>

<div
	transition:slide={{ duration: 150 }}
	class="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white py-2 shadow-lg"
>
	<p class="border-b border-slate-100 px-4 pb-2 text-sm font-semibold text-slate-900">
		Notifications
	</p>
	{#if state.loading}
		<p class="px-4 py-4 text-sm text-slate-500">Loading…</p>
	{:else if state.loadError}
		<div class="flex items-center justify-between gap-2 px-4 py-3 text-sm">
			<span class="text-slate-500">Couldn't load notifications.</span>
			<button
				type="button"
				onclick={() => void state.load()}
				class="text-sm font-medium text-primary-600 hover:text-primary-700"
			>
				Retry
			</button>
		</div>
	{:else if state.rows.length === 0}
		<p class="px-4 py-4 text-sm text-slate-500">
			No notifications yet — all quiet on the home front.
		</p>
	{:else}
		<ul class="max-h-80 overflow-y-auto">
			{#each state.rows as row (row.id)}
				<li>
					<button
						type="button"
						onclick={() => void state.markRead(row)}
						class="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-100 {row.readAt
							? ''
							: 'bg-slate-50'}"
					>
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold {alertTone(
								row.rawType
							)}"
							aria-hidden="true"
						>
							{alertGlyph(row.rawType)}
						</span>
						<span class="min-w-0 flex-1">
							<span
								class="block truncate text-sm {row.readAt
									? 'text-slate-600'
									: 'font-bold text-slate-900'}"
							>
								{row.message}
							</span>
							<span class="mt-0.5 flex items-center gap-2">
								<span
									class="inline-flex h-4 items-center rounded-full px-1.5 text-[10px] font-bold {alertTone(
										row.rawType
									)}"
								>
									{alertLabel(row.rawType)}
								</span>
								<span class="truncate text-xs text-slate-400">
									{relativeFromNow(row.createdAt, state.now, state.zone)}
								</span>
							</span>
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if state.unreadCount > 0}
		<div class="mt-2 border-t border-slate-100 pt-2">
			<button
				type="button"
				onclick={() => void state.markAllRead()}
				class="w-full px-4 py-2 text-left text-sm font-medium text-primary-600 hover:bg-primary-50"
			>
				Mark all read
			</button>
		</div>
	{/if}
	<PushToggle
		state={state.pushState}
		serverReady={state.pushServerReady}
		busy={state.pushBusy}
		feedback={state.pushFeedback}
		onenable={() => void state.enablePush()}
		ondisable={() => void state.disablePush()}
	/>
</div>
