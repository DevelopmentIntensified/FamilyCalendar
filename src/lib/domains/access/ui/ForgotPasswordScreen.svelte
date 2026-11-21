<!--
	`/forgot-password`'s page body: the address form and the settled
	"If an account exists for <email>…" panel. One request, one answer — the
	page never says whether the address had an account (#245).

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { createAuthApi } from '../access.api';
	import {
		EMAIL_LABEL,
		FORGOT_BUSY,
		FORGOT_HEADING,
		FORGOT_SENT_HEADING,
		FORGOT_SENT_PREFIX,
		FORGOT_SENT_SUFFIX,
		FORGOT_SIGN_IN_LINK,
		FORGOT_SIGN_IN_SENTENCE,
		FORGOT_SUBMIT
	} from '../access.auth.rules';
	import { ForgotPasswordState } from '../access.recovery.state.svelte';
	import AuthAlert from './AuthAlert.svelte';
	import AuthCard from './AuthCard.svelte';

	const recovery = new ForgotPasswordState(createAuthApi());
</script>

<svelte:head>
	<title>Forgot Password - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50">
	<div class="flex flex-col items-center px-4 pt-16">
		<AuthCard>
			<div class="mb-8 text-center">
				<h1 class="text-3xl font-bold text-slate-900">{FORGOT_HEADING}</h1>
				<p class="mt-2 text-slate-600">
					{FORGOT_SIGN_IN_SENTENCE}
					<a href="/login" class="text-primary-600 hover:text-primary-700">{FORGOT_SIGN_IN_LINK}</a>
				</p>
			</div>

			{#if recovery.error}
				<AuthAlert kind="error" variant="compact" text={recovery.error} />
			{/if}

			{#if recovery.sent}
				<div class="text-center">
					<div class="mb-4 text-6xl">📧</div>
					<h2 class="mb-2 text-xl font-semibold text-slate-900">{FORGOT_SENT_HEADING}</h2>
					<p class="text-slate-600">
						{FORGOT_SENT_PREFIX} <strong>{recovery.email}</strong>{FORGOT_SENT_SUFFIX}
					</p>
				</div>
			{:else}
				<form
					onsubmit={(event) => {
						event.preventDefault();
						recovery.submit();
					}}
					class="space-y-5"
				>
					<div>
						<label for="email" class="block text-sm font-medium text-slate-700">{EMAIL_LABEL}</label>
						<input
							id="email"
							type="email"
							autocomplete="email"
							value={recovery.email}
							oninput={(event) => (recovery.email = event.currentTarget.value)}
							class="mt-1.5 block w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
							required
						/>
					</div>

					<button
						type="submit"
						disabled={recovery.waiting}
						class="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:bg-slate-300"
					>
						{recovery.waiting ? FORGOT_BUSY : FORGOT_SUBMIT}
					</button>
				</form>
			{/if}
		</AuthCard>
	</div>
</div>
