<!--
	Notifications: four switches, each its own form and its own action, so one
	failed save cannot rewrite another row. The switch is a native submit button
	with `role="switch"` and `aria-checked` (keyboard-operable, and the same
	payload without JS); the flip is optimistic with a receipt, and a failed save
	puts it back where the server still has it.

	Skeletons render before the loader answers (`preferences` is null), and the
	receipt is a `role="status"` region that is always mounted.
-->
<script lang="ts">
	import Skeleton from '$lib/kernel/ui/Skeleton.svelte';
	import { DEFAULT_ALERT_PREFERENCES, type AlertPreferences } from '$lib/domains/alerts';
	import type { AccountNotificationOptionModel } from '../account.contract';
	import { AccountNotificationsState } from '../account.notifications.state.svelte';
	import type { AccountFormEnhancer } from '../account.state.svelte';

	interface Props {
		/** What the section's read answered; null means it has not answered yet. */
		preferences: AlertPreferences | null;
		options: AccountNotificationOptionModel[];
		enhance: AccountFormEnhancer;
	}

	let { preferences, options, enhance }: Props = $props();

	const state = new AccountNotificationsState(preferences ?? DEFAULT_ALERT_PREFERENCES);

	// A reload's answer is truth again; the optimistic flip survives a toggle
	// because the prop does not change on one.
	$effect(() => {
		if (preferences) state.reset(preferences);
	});
</script>

<div id="notifications">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">Notifications</h2>

	{#if !preferences || options.length === 0}
		<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
			<Skeleton shape="toggle" lines={4} label="Loading notification preferences" />
		</div>
	{:else}
		<div class="rounded-xl border border-slate-200 bg-slate-50 px-4">
			{#each options as pref, index (pref.id)}
				{@const on = state.valueOf(pref.id)}
				{@const hintId = `notification-hint-${pref.id}`}
				<form
					method="POST"
					action="?/setNotificationPreference"
					class="flex items-center gap-3 py-2.5 {index === 0 ? '' : 'border-t border-slate-100'}"
					use:enhance={() => {
						return async ({ result, update }) => {
							state.settle(result.type !== 'failure');
							if (result.type !== 'failure') await update({ reset: false });
						};
					}}
				>
					<input type="hidden" name="preference" value={pref.id} />

					<button
						type="submit"
						name="value"
						value={state.nextValue(pref.id, on) ? 'true' : 'false'}
						role="switch"
						aria-checked={on}
						aria-label={pref.label}
						aria-describedby={hintId}
						data-testid={`notification-switch-${pref.id}`}
						data-saving={state.pendingId === pref.id ? 'true' : undefined}
						onclick={() => state.press(pref.id)}
						class="relative h-[1.375rem] w-10 shrink-0 rounded-full border-0 p-0 transition-colors {on
							? 'bg-primary-600'
							: 'bg-slate-300'} {state.pendingId === pref.id ? 'opacity-70' : ''}"
					>
						<span
							aria-hidden="true"
							class="absolute left-[0.1875rem] top-[0.1875rem] h-4 w-4 rounded-full bg-white shadow-sm transition-transform {on
								? 'translate-x-[1.125rem]'
								: 'translate-x-0'}"
						></span>
					</button>

					<span class="min-w-0 flex-1">
						<span class="block text-sm font-semibold text-slate-800">{pref.label}</span>
						<span id={hintId} class="mt-0.5 block text-[11px] text-slate-400">{pref.hint}</span>
					</span>
				</form>
			{/each}
		</div>

		<p
			data-testid="notification-status"
			role="status"
			aria-live="polite"
			class="mt-2 min-h-[1.25rem] text-xs {state.statusIsError ? 'text-red-600' : 'text-slate-500'}"
		>
			{state.status}
		</p>
	{/if}

	<p data-testid="notification-note" class="mt-3.5 text-xs leading-relaxed text-slate-500">
		These map to <code class="rounded bg-slate-100 px-1 py-0.5 text-slate-600"
			>activeSubscriptions.notificationMethods</code
		>, a JSON column — not to a row per event type, so there is no migration path if a sixth
		type is added later.
	</p>

	<a
		href="/calendar/notifications"
		class="mt-3.5 inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900"
	>
		See the alerts
	</a>
</div>
