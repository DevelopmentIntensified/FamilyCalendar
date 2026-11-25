<!--
	`/signup`'s page body: the Password / Email Link switch, the password
	form (names, address, password with its "At least 8 characters" hint, and
	the confirmation), the link form, and the shared code screen with the
	verified toast.

	Copy, states and interactions match the approved legacy page; behaviour
	lives in `SignupState`.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { createToasts } from '$lib/kernel/client/toasts.svelte';
	import { createAuthApi } from '../access.api';
	import {
		AUTH_METHOD_OPTIONS,
		CONFIRM_PASSWORD_LABEL,
		EMAIL_LABEL,
		FIRST_NAME_LABEL,
		LAST_NAME_LABEL,
		PASSWORD_HINT,
		PASSWORD_LABEL,
		SIGNUP_CODE_BUSY,
		SIGNUP_CODE_HEADING,
		SIGNUP_CODE_PLACEHOLDER,
		SIGNUP_CODE_SENT,
		SIGNUP_CODE_SUBMIT,
		SIGNUP_HEADING,
		SIGNUP_LINK_BUSY,
		SIGNUP_LINK_SUBMIT,
		SIGNUP_PASSWORD_BUSY,
		SIGNUP_PASSWORD_SUBMIT,
		SIGNUP_SIGNED_IN_COPY,
		authLandingLabel,
		authSiblingHref
	} from '../access.auth.rules';
	import type { SignupPageData } from '../access.pages.http.server';
	import { SignupState } from '../access.signup.state.svelte';
	import AuthAlert from './AuthAlert.svelte';
	import AuthCard from './AuthCard.svelte';
	import AuthInput from './AuthInput.svelte';
	import AuthPage from './AuthPage.svelte';
	import EmailCodeSection from './EmailCodeSection.svelte';
	import ModeToggle from './ModeToggle.svelte';

	interface Props {
		data: SignupPageData;
		redirect: (path: string) => void | Promise<void>;
	}

	let { data, redirect }: Props = $props();

	const toasts = createToasts();
	const signup = new SignupState(createAuthApi(), toasts, {
		redirectTo: data.redirectTo,
		isLoggedIn: data.isLoggedIn,
		redirect: (path) => redirect(path)
	});

	const loginHref = $derived(authSiblingHref('/login', data.redirectTo));

	onMount(() => {
		return () => signup.dispose();
	});

	const submitClasses =
		'flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500';
</script>

<AuthPage title="Sign Up - Family Planz">
	<AuthCard>
		<header class="mb-8 text-center">
			<h1 class="text-3xl font-bold tracking-tight text-slate-900">{SIGNUP_HEADING}</h1>
			{#if data.isLoggedIn}
				<p class="mt-2 text-pretty text-sm text-slate-600">{SIGNUP_SIGNED_IN_COPY}</p>
			{:else}
				<p class="mt-2 text-pretty text-sm text-slate-600">
					Already have an account?
					<a
						href={loginHref}
						class="rounded font-medium text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
						>Sign in</a
					>
				</p>
			{/if}
		</header>

		{#if data.isLoggedIn}
			<a href={data.redirectTo} class={submitClasses}>{authLandingLabel(data.redirectTo)}</a>
		{:else}
			{#if signup.error}
				<AuthAlert kind="error" text={signup.error} />
			{/if}

			{#if signup.sent}
				<EmailCodeSection
					email={signup.email}
					heading={SIGNUP_CODE_HEADING}
					sentPrefix={SIGNUP_CODE_SENT}
					placeholder={SIGNUP_CODE_PLACEHOLDER}
					submitLabel={SIGNUP_CODE_SUBMIT}
					busyLabel={SIGNUP_CODE_BUSY}
					waiting={signup.waiting}
					resent={signup.resent}
					code={signup.code}
					onCodeChange={(value) => (signup.code = value)}
					onSubmit={() => signup.submitCode()}
					onResend={() => signup.resend()}
				/>
			{:else}
				<ModeToggle
					value={signup.method}
					onValueChange={(value) => signup.setMethod(value)}
					groupLabel="Signup method"
					options={AUTH_METHOD_OPTIONS}
				/>

				{#if signup.method === 'password'}
					<form
						onsubmit={(event) => {
							event.preventDefault();
							signup.signUpWithPassword();
						}}
						class="space-y-5"
					>
						<div class="grid grid-cols-2 gap-4">
							<AuthInput
								id="firstName"
								label={FIRST_NAME_LABEL}
								autocomplete="given-name"
								value={signup.firstName}
								onValueChange={(value) => (signup.firstName = value)}
								required
							/>
							<AuthInput
								id="lastName"
								label={LAST_NAME_LABEL}
								autocomplete="family-name"
								value={signup.lastName}
								onValueChange={(value) => (signup.lastName = value)}
								required
							/>
						</div>

						<AuthInput
							id="email"
							type="email"
							autocomplete="email"
							label={EMAIL_LABEL}
							value={signup.email}
							onValueChange={(value) => (signup.email = value)}
							required
						/>

						<div>
							<AuthInput
								id="password"
								type="password"
								autocomplete="new-password"
								label={PASSWORD_LABEL}
								value={signup.password}
								onValueChange={(value) => (signup.password = value)}
								required
							/>
							<p class="mt-1 text-xs text-slate-500">{PASSWORD_HINT}</p>
						</div>

						<AuthInput
							id="confirmPassword"
							type="password"
							autocomplete="new-password"
							label={CONFIRM_PASSWORD_LABEL}
							value={signup.confirmPassword}
							onValueChange={(value) => (signup.confirmPassword = value)}
							required
						/>

						<button
							type="submit"
							disabled={signup.waiting}
							aria-busy={signup.waiting}
							class={submitClasses}
						>
							{signup.waiting ? SIGNUP_PASSWORD_BUSY : SIGNUP_PASSWORD_SUBMIT}
						</button>
					</form>
				{:else}
					<form
						onsubmit={(event) => {
							event.preventDefault();
							signup.sendLink();
						}}
						class="space-y-5"
					>
						<div class="grid grid-cols-2 gap-4">
							<AuthInput
								id="firstNameML"
								label={FIRST_NAME_LABEL}
								autocomplete="given-name"
								value={signup.firstName}
								onValueChange={(value) => (signup.firstName = value)}
								required
							/>
							<AuthInput
								id="lastNameML"
								label={LAST_NAME_LABEL}
								autocomplete="family-name"
								value={signup.lastName}
								onValueChange={(value) => (signup.lastName = value)}
								required
							/>
						</div>

						<AuthInput
							id="emailML"
							type="email"
							autocomplete="email"
							label={EMAIL_LABEL}
							value={signup.email}
							onValueChange={(value) => (signup.email = value)}
							required
						/>

						<button
							type="submit"
							disabled={signup.waiting}
							aria-busy={signup.waiting}
							class={submitClasses}
						>
							{signup.waiting ? SIGNUP_LINK_BUSY : SIGNUP_LINK_SUBMIT}
						</button>
					</form>
				{/if}
			{/if}
		{/if}

		{#if !data.isLoggedIn}
			<div class="mt-6 border-t border-slate-100 pt-5">
				<a
					href="/calendar"
					data-sveltekit-reload
					class="flex min-h-[48px] w-full items-center justify-center rounded-full border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
				>
					Start planning — no account needed
				</a>
				<p class="mt-2 text-center text-xs text-slate-400">
					Creates a private calendar on this device. Add an email later to sync.
				</p>
			</div>
		{/if}
	</AuthCard>
</AuthPage>

<!--
	The toast host is a lazy chunk (ADR 0010): a sign-up's toasts appear only after
	the form is submitted, so the region's first paint is not part of the page's
	initial JS. It still mounts (never gated on the item list) so the live region
	exists before the first message, as `Toaster` requires.
-->
{#await import('$lib/kernel/ui/Toaster.svelte') then { default: Toaster }}
	<Toaster items={toasts.items} ondismiss={toasts.dismiss} />
{/await}
