<!--
	`/forgot-password/reset`'s page body: the new-password form (refusing a
	missing token first, then a mismatch, then the length), the success panel
	and the 3-second return to `/login`.

	The token comes from the route's `?token=`, passed in — the screen never
	reads the URL.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { createAuthApi } from '../access.api';
	import {
		CONFIRM_PASSWORD_LABEL,
		NEW_PASSWORD_LABEL,
		RESET_BUSY,
		RESET_HEADING,
		RESET_SUCCESS_HEADING,
		RESET_SUCCESS_REDIRECT_COPY,
		RESET_SUBMIT,
		RESET_TITLE
	} from '../access.auth.rules';
	import { ResetPasswordState } from '../access.recovery.state.svelte';
	import AuthAlert from './AuthAlert.svelte';
	import AuthCard from './AuthCard.svelte';

	interface Props {
		token: string;
		redirect: (path: string) => void | Promise<void>;
	}

	let { token, redirect }: Props = $props();

	const recovery = new ResetPasswordState(createAuthApi(), token, (path) => redirect(path));

	onMount(() => {
		return () => recovery.dispose();
	});
</script>

<svelte:head>
	<title>{RESET_TITLE}</title>
</svelte:head>

<div class="min-h-screen bg-slate-50">
	<div class="flex flex-col items-center px-4 pt-16">
		<AuthCard>
			<div class="mb-8 text-center">
				<h1 class="text-3xl font-bold text-slate-900">{RESET_HEADING}</h1>
			</div>

			{#if recovery.error}
				<AuthAlert kind="error" variant="compact" text={recovery.error} />
			{/if}

			{#if recovery.success}
				<div class="text-center">
					<div class="mb-4 text-6xl">✅</div>
					<h2 class="mb-2 text-xl font-semibold text-slate-900">{RESET_SUCCESS_HEADING}</h2>
					<p class="text-slate-600">{RESET_SUCCESS_REDIRECT_COPY}</p>
				</div>
			{:else if recovery.token}
				<form
					onsubmit={(event) => {
						event.preventDefault();
						recovery.submit();
					}}
					class="space-y-5"
				>
					<div>
						<label for="password" class="block text-sm font-medium text-slate-700"
							>{NEW_PASSWORD_LABEL}</label
						>
						<input
							id="password"
							type="password"
							autocomplete="new-password"
							value={recovery.password}
							oninput={(event) => (recovery.password = event.currentTarget.value)}
							class="mt-1.5 block w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
							required
						/>
					</div>

					<div>
						<label for="confirm" class="block text-sm font-medium text-slate-700"
							>{CONFIRM_PASSWORD_LABEL}</label
						>
						<input
							id="confirm"
							type="password"
							autocomplete="new-password"
							value={recovery.confirmPassword}
							oninput={(event) => (recovery.confirmPassword = event.currentTarget.value)}
							class="mt-1.5 block w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
							required
						/>
					</div>

					<button
						type="submit"
						disabled={recovery.waiting}
						class="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:bg-slate-300"
					>
						{recovery.waiting ? RESET_BUSY : RESET_SUBMIT}
					</button>
				</form>
			{/if}
		</AuthCard>
	</div>
</div>
