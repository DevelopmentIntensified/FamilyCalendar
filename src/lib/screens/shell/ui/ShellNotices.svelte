<!--
	The one top notice of the calendar frame, decided by `shellNoticeFor`
	(`../shell.notices.rules`): just-claimed, unverified email, just-merged, or
	the Anonymous Account countdown. Only the countdown cannot be dismissed.

	The verify notice is self-sufficient — code input, Resend and the inline
	error live here — because a user who navigated away has nowhere else to enter
	the code. Its copy, the red urgent countdown and the ✅ merge sentence are the
	legacy layout's (`(calendar)/calendar/+layout.svelte:149-264`).

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { ShellNoticeKind, ShellNoticeModel } from '../shell.contract';
	import { shellMergeSummary } from '../shell.notices.rules';
	import type { ShellVerifyState } from '../shell.verify.state.svelte.js';

	interface Props {
		notice: ShellNoticeModel;
		verify: ShellVerifyState;
		/** Dismissal is not offered for the countdown (the contract says so). */
		onDismiss: (kind: Exclude<ShellNoticeKind, 'anonymous'>) => void;
	}

	let { notice, verify, onDismiss }: Props = $props();

	function submitCode(event: SubmitEvent): void {
		event.preventDefault();
		void verify.submit();
	}
</script>

{#if notice.kind === 'claimed'}
	<div
		class="flex w-full items-center justify-center gap-3 border-b border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800"
		role="status"
		transition:fade={{ duration: 150 }}
		data-testid="shell-notice-claimed"
	>
		<span>✅ Email added — your calendar now syncs across devices.</span>
		<button
			type="button"
			class="rounded-full p-1 font-semibold hover:bg-green-100"
			aria-label="Dismiss"
			onclick={() => onDismiss('claimed')}
		>
			✕
		</button>
	</div>
{:else if notice.kind === 'verify'}
	<div
		class="w-full border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800"
		role="status"
		transition:fade={{ duration: 150 }}
		data-testid="shell-notice-verify"
	>
		<div class="mx-auto flex max-w-xl flex-col items-center gap-2">
			<span class="text-center">
				Your email isn't verified yet — enter the code we sent to unlock family features like
				member search.
			</span>
			<form class="flex w-full flex-wrap items-center justify-center gap-2" onsubmit={submitCode}>
				<input
					type="text"
					bind:value={verify.code}
					placeholder="Verification code"
					autocomplete="one-time-code"
					inputmode="numeric"
					aria-label="Verification code"
					class="min-w-0 max-w-40 flex-1 basis-32 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-center text-sm tracking-[0.2em] text-slate-900 placeholder-slate-400 focus:border-primary-500 focus:outline-none"
				/>
				<button
					type="submit"
					disabled={!verify.canSubmit}
					class="min-h-[44px] rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
				>
					{verify.busy ? 'Verifying…' : 'Verify'}
				</button>
				<button
					type="button"
					onclick={() => void verify.resend()}
					disabled={verify.busy}
					class="min-h-[44px] rounded px-1 text-sm underline disabled:opacity-50"
				>
					Resend
				</button>
				<button
					type="button"
					class="rounded-full p-1 font-semibold hover:bg-amber-100"
					aria-label="Dismiss"
					onclick={() => onDismiss('verify')}
				>
					✕
				</button>
			</form>
			{#if verify.resent}
				<span class="rounded-full bg-[#C4E9DA]/60 px-2.5 py-1 text-xs font-medium text-slate-800"
					>Sent again ✓</span
				>
			{/if}
			{#if verify.error}
				<span class="text-center text-xs font-medium text-red-700">{verify.error}</span>
			{/if}
		</div>
	</div>
{:else if notice.kind === 'merged'}
	<div
		class="flex w-full items-center justify-center gap-3 border-b border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800"
		role="status"
		transition:fade={{ duration: 150 }}
		data-testid="shell-notice-merged"
	>
		<span>✅ {shellMergeSummary(notice.events, notice.tasks)}</span>
		<button
			type="button"
			class="rounded-full p-1 font-semibold hover:bg-green-100"
			aria-label="Dismiss"
			onclick={() => onDismiss('merged')}
		>
			✕
		</button>
	</div>
{:else}
	<div
		class="w-full px-4 py-2.5 text-center text-sm {notice.urgent
			? 'border-b border-red-200 bg-red-50 text-red-800'
			: 'border-b border-amber-200 bg-amber-50 text-amber-800'}"
		role="status"
		data-testid="shell-notice-anonymous"
	>
		{#if notice.urgent}
			⚠️ Guest calendar — inactive accounts are deleted after 90 days.
			<strong>{notice.daysLeft} day{notice.daysLeft === 1 ? '' : 's'} left.</strong>
			<a href="/claim" class="font-semibold underline">Save your data with an email</a>
		{:else}
			You're using a guest calendar — your events can't sync to other devices.
			<a href="/claim" class="font-semibold underline">Add an email to save them</a>
			<span class="text-amber-600">(deleted after 90 days of inactivity)</span>
		{/if}
	</div>
{/if}
