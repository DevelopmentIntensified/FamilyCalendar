<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		DEFAULT_NOTIFICATION_PREFERENCES,
		NOTIFICATION_PREFERENCES,
		notificationSaveOutcome,
		type NotificationPreferenceId,
		type NotificationPreferences
	} from './accountNotifications';

	interface Props {
		/** What the loader read. `null` means it has not answered yet, which is
		 *  not the same as "no preferences" — that case arrives as the approved
		 *  defaults. */
		preferences?: NotificationPreferences | null;
	}

	let { preferences = null }: Props = $props();

	let current = $state<NotificationPreferences | null>(preferences ? { ...preferences } : null);

	// A client-side navigation re-runs the load, so the loader's answer is the
	// truth again. It does not re-run on a toggle, which is why the optimistic
	// flip below survives.
	$effect(() => {
		current = preferences ? { ...preferences } : null;
	});

	/** The switch being saved, and the value it is being saved with. */
	let saving = $state<NotificationPreferenceId | null>(null);
	/** What the in-flight save is asking for, while it is in flight. */
	let intent = $state<{ id: NotificationPreferenceId; value: boolean } | null>(null);

	/** Always rendered, so a live region exists before its first message. */
	let status = $state('');
	let statusIsError = $state(false);

	function valueOf(id: NotificationPreferenceId): boolean {
		return current ? current[id] : DEFAULT_NOTIFICATION_PREFERENCES[id];
	}

	/**
	 * The optimistic flip, then the save.
	 *
	 * The switch is the form's submit button, so what it POSTs is its `value`.
	 * That value is derived — never written imperatively — from `intent` while a
	 * save is in flight, so a re-render racing the submission cannot post the
	 * value the switch already holds instead of the one being saved. With no JS
	 * the same markup posts the same thing and the page simply reloads.
	 */
	function toggle(id: NotificationPreferenceId) {
		const next = !valueOf(id);
		// Ack first, ask later: the switch and the receipt both move now, and
		// `notificationSaveOutcome` decides what stays if the save refuses.
		const outcome = notificationSaveOutcome(
			{ ...DEFAULT_NOTIFICATION_PREFERENCES, ...current },
			{ id, value: next },
			true
		);
		intent = { id, value: next };
		current = outcome.preferences;
		status = outcome.status;
		statusIsError = false;
	}

	/**
	 * The value this row's next click saves — which, while a save is in flight, is
	 * the value that save already carries.
	 */
	function savedValueOf(id: NotificationPreferenceId, on: boolean): string {
		if (intent?.id === id) return String(intent.value);
		return String(!on);
	}
</script>

<div id="notifications">
	<h2 class="mb-4 text-lg font-semibold text-slate-900">Notifications</h2>

	<!-- Nothing loaded yet is a skeleton, never an empty card: four rows are
	     coming, and their height should not jump when they arrive. -->
	{#if current === null}
		<div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
			{#each NOTIFICATION_PREFERENCES as pref (pref.id)}
				<div data-testid="notification-skeleton" class="flex items-center gap-3 py-2.5">
					<span class="h-[1.375rem] w-10 shrink-0 animate-pulse rounded-full bg-slate-200"></span>
					<span class="min-w-0 flex-1">
						<span class="block h-3.5 w-32 animate-pulse rounded bg-slate-200"></span>
						<span class="mt-1.5 block h-2.5 w-20 animate-pulse rounded bg-slate-100"></span>
					</span>
				</div>
			{/each}
		</div>
	{:else}
		<div class="rounded-xl border border-slate-200 bg-slate-50 px-4">
			{#each NOTIFICATION_PREFERENCES as pref, index (pref.id)}
				{@const on = current[pref.id]}
				{@const hintId = `notification-hint-${pref.id}`}
				<!-- One form per row, its own action: flipping "Task completed" and
				     flipping "AI event suggestions" are two acts with two receipts,
				     and a failed save of one cannot rewrite the other. -->
				<form
					method="POST"
					action="?/setNotificationPreference"
					class="flex items-center gap-3 py-2.5 {index === 0
						? ''
						: 'border-t border-slate-100'}"
					use:enhance={() => {
						const inFlight = intent;
						saving = inFlight?.id ?? null;
						return async ({ result, update }) => {
							saving = null;
							if (inFlight && current) {
								// A failed save puts the switch back where the server
								// still has it, and says which row failed.
								const outcome = notificationSaveOutcome(
									current,
									inFlight,
									result.type !== 'failure'
								);
								current = outcome.preferences;
								status = outcome.status;
								statusIsError = outcome.isError;
							}
							intent = null;
							if (result.type !== 'failure') await update({ reset: false });
						};
					}}
				>
					<input type="hidden" name="preference" value={pref.id} />

					<!-- A submit button, so it is keyboard operable and works with no
					     JS at all; `name`/`value` are what put the value being saved
					     into the payload. -->
					<button
						type="submit"
						name="value"
						value={savedValueOf(pref.id, on)}
						role="switch"
						aria-checked={on}
						aria-label={pref.label}
						aria-describedby={hintId}
						data-testid={`notification-switch-${pref.id}`}
						data-saving={saving === pref.id ? 'true' : undefined}
						onclick={() => toggle(pref.id)}
						class="relative h-[1.375rem] w-10 shrink-0 rounded-full border-0 p-0 transition-colors {on
							? 'bg-primary-600'
							: 'bg-slate-300'} {saving === pref.id ? 'opacity-70' : ''}"
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

		<!-- The receipt: what changed, said the moment it is pressed. Named after
		     the row rather than "Saved", so a screen reader user knows which switch
		     it belongs to. -->
		<p
			data-testid="notification-status"
			role="status"
			aria-live="polite"
			class="mt-2 min-h-[1.25rem] text-xs {statusIsError ? 'text-red-600' : 'text-slate-500'}"
		>
			{status}
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