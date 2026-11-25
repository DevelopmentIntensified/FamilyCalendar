<!--
	The one code screen both sign-in and sign-up show after the mail leaves:
	the envelope badge, "Check Your Email", the address it went to, the 8-digit
	code field, the submit and the resend control with its "Sent again ✓" pill.

	`label` set renders the labelled field the login page used; unset renders
	the plain centred input the signup page used.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { RESEND_CONFIRMATION, RESEND_SENTENCE } from '../access.auth.rules';
	import AuthInput from './AuthInput.svelte';

	interface Props {
		email: string;
		heading: string;
		/** The sentence before the bold address. */
		sentPrefix: string;
		code: string;
		onCodeChange?: (value: string) => void;
		label?: string;
		placeholder: string;
		submitLabel: string;
		busyLabel: string;
		waiting: boolean;
		resent: boolean;
		onSubmit: () => void;
		onResend: () => void;
	}

	let {
		email,
		heading,
		sentPrefix,
		code,
		onCodeChange,
		label,
		placeholder,
		submitLabel,
		busyLabel,
		waiting,
		resent,
		onSubmit,
		onResend
	}: Props = $props();

	const submitClasses =
		'flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500';
</script>

<section class="text-center">
	<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#BEDAE3]/50">
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="h-7 w-7 text-slate-700"
			aria-hidden="true"
		>
			<rect width="20" height="16" x="2" y="4" rx="2" /><path
				d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"
			/>
		</svg>
	</div>
	<h2 class="mb-2 text-xl font-semibold text-slate-900">{heading}</h2>
	<p class="mb-6 text-sm text-slate-600">
		{sentPrefix}
		<strong class="font-semibold text-slate-900">{email}</strong>
	</p>

	<form
		onsubmit={(event) => {
			event.preventDefault();
			onSubmit();
		}}
		class="space-y-4"
	>
		{#if label}
			<AuthInput
				id="code"
				{label}
				{placeholder}
				autocomplete="one-time-code"
				inputmode="numeric"
				center
				value={code}
				onValueChange={onCodeChange}
				required
			/>
		{:else}
			<input
				id="code"
				type="text"
				value={code}
				oninput={(event) => onCodeChange?.(event.currentTarget.value)}
				{placeholder}
				autocomplete="one-time-code"
				inputmode="numeric"
				required
				class="block w-full rounded-[10px] border border-slate-300 bg-white px-4 py-3 text-center text-lg tracking-[0.3em] text-slate-900 placeholder-slate-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
			/>
		{/if}
		<button type="submit" disabled={waiting} aria-busy={waiting} class={submitClasses}>
			{waiting ? busyLabel : submitLabel}
		</button>
	</form>

	<div class="mt-4 flex items-center justify-center gap-2">
		<button
			type="button"
			onclick={onResend}
			class="min-h-[44px] rounded px-1 text-sm text-slate-600 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
		>
			{RESEND_SENTENCE}
		</button>
		{#if resent}
			<span class="rounded-full bg-[#C4E9DA]/60 px-2.5 py-1 text-xs font-medium text-slate-800"
				>{RESEND_CONFIRMATION}</span
			>
		{/if}
	</div>
</section>
