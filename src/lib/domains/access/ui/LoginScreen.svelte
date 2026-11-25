<!--
	`/login`'s page body: the Password / Email Link switch, the merge banner a
	guest sees, the already-signed-in landing, the shared code screen, and the
	guest "start planning" footer.

	Copy, states and interactions match the approved legacy page; all behaviour
	lives in `LoginState`.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { createAuthApi } from '../access.api';
	import {
		AUTH_METHOD_OPTIONS,
		EMAIL_LABEL,
		FORGOT_PASSWORD_LINK,
		GUEST_START_HEADING,
		GUEST_START_NOTE,
		LOGIN_CODE_BUSY,
		LOGIN_CODE_HEADING,
		LOGIN_CODE_LABEL,
		LOGIN_CODE_PLACEHOLDER,
		LOGIN_CODE_SENT,
		LOGIN_CODE_SUBMIT,
		LOGIN_HEADING,
		LOGIN_LINK_BUSY,
		LOGIN_LINK_SUBMIT,
		LOGIN_MERGE_BANNER,
		LOGIN_PASSWORD_BUSY,
		LOGIN_PASSWORD_SUBMIT,
		LOGIN_SIGNED_IN_COPY,
		PASSWORD_LABEL,
		authLandingLabel,
		authSiblingHref
	} from '../access.auth.rules';
	import { LoginState } from '../access.login.state.svelte';
	import type { LoginPageData } from '../access.pages.http.server';
	import AuthAlert from './AuthAlert.svelte';
	import AuthCard from './AuthCard.svelte';
	import AuthInput from './AuthInput.svelte';
	import AuthPage from './AuthPage.svelte';
	import EmailCodeSection from './EmailCodeSection.svelte';
	import ModeToggle from './ModeToggle.svelte';

	interface Props {
		data: LoginPageData;
		redirect: (path: string) => void | Promise<void>;
		/** Removes `?error=` / `?notice=` from the URL once shown (#246). */
		cleanUrl: () => void;
		urlError: string | null;
		urlNotice: string | null;
	}

	let { data, redirect, cleanUrl, urlError, urlNotice }: Props = $props();

	const login = new LoginState(createAuthApi(), {
		redirectTo: data.redirectTo,
		isLoggedIn: data.isLoggedIn,
		mergeMode: data.mergeMode,
		redirect: (path) => redirect(path)
	});

	const signupHref = $derived(authSiblingHref('/signup', data.redirectTo));

	onMount(() => {
		login.applyUrlMessages(urlError, urlNotice);
		if (urlError || urlNotice) cleanUrl();
		return () => login.dispose();
	});

	const submitClasses =
		'flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500';
</script>

<AuthPage title="Log In - Family Planz">
	<AuthCard>
		<header class="mb-8 text-center">
			<h1 class="text-3xl font-bold tracking-tight text-slate-900">{LOGIN_HEADING}</h1>
			{#if data.isLoggedIn && !data.mergeMode}
				<p class="mt-2 text-pretty text-sm text-slate-600">{LOGIN_SIGNED_IN_COPY}</p>
			{:else if !data.mergeMode}
				<p class="mt-2 text-pretty text-sm text-slate-600">
					Don't have an account?
					<a
						href={signupHref}
						class="rounded font-medium text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
						>Sign up</a
					>
					or start planning with no account needed.
				</p>
			{/if}
		</header>

		{#if data.mergeMode}
			<div class="mb-6 flex items-start gap-3 rounded-xl bg-[#BEDAE3]/40 p-4">
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-5 w-5 shrink-0 text-slate-700"
					aria-hidden="true"
				>
					<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path
						d="M22 21v-2a4 4 0 0 0-3-3.87"
					/><path d="M16 3.13a4 4 0 0 1 0 7.75" />
				</svg>
				<p class="text-sm leading-relaxed text-slate-700">{LOGIN_MERGE_BANNER}</p>
			</div>
		{/if}

		<!-- #246: notices + errors render in both branches (signed in or not). -->
		{#if login.notice}
			<AuthAlert kind="success" text={login.notice} />
		{/if}
		{#if login.error}
			<AuthAlert kind="error" text={login.error} />
		{/if}

		{#if data.isLoggedIn && !data.mergeMode}
			<a href={data.redirectTo} class={submitClasses}>{authLandingLabel(data.redirectTo)}</a>
		{:else if login.sent}
			<EmailCodeSection
				email={login.email}
				heading={LOGIN_CODE_HEADING}
				sentPrefix={LOGIN_CODE_SENT}
				label={LOGIN_CODE_LABEL}
				placeholder={LOGIN_CODE_PLACEHOLDER}
				submitLabel={LOGIN_CODE_SUBMIT}
				busyLabel={LOGIN_CODE_BUSY}
				waiting={login.waiting}
				resent={login.resent}
				code={login.code}
				onCodeChange={(value) => (login.code = value)}
				onSubmit={() => login.submitCode()}
				onResend={() => login.resend()}
			/>
		{:else}
			<ModeToggle
				value={login.method}
				onValueChange={(value) => login.setMethod(value)}
				options={AUTH_METHOD_OPTIONS}
			/>

			{#if login.method === 'password'}
				<form
					onsubmit={(event) => {
						event.preventDefault();
						login.signInWithPassword();
					}}
					class="space-y-5"
				>
					<AuthInput
						id="email"
						type="email"
						autocomplete="email"
						label={EMAIL_LABEL}
						value={login.email}
						onValueChange={(value) => (login.email = value)}
						required
					/>
					<AuthInput
						id="password"
						type="password"
						autocomplete="current-password"
						label={PASSWORD_LABEL}
						value={login.password}
						onValueChange={(value) => (login.password = value)}
						required
					>
						{#snippet labelRight()}
							<a
								href="/forgot-password"
								class="rounded text-xs font-medium text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
							>
								{FORGOT_PASSWORD_LINK}
							</a>
						{/snippet}
					</AuthInput>
					<button
						type="submit"
						disabled={login.waiting}
						aria-busy={login.waiting}
						class={submitClasses}
					>
						{login.waiting ? LOGIN_PASSWORD_BUSY : LOGIN_PASSWORD_SUBMIT}
					</button>
				</form>
			{:else}
				<form
					onsubmit={(event) => {
						event.preventDefault();
						login.sendLink();
					}}
					class="space-y-4"
				>
					<AuthInput
						id="emailML"
						type="email"
						autocomplete="email"
						label={EMAIL_LABEL}
						value={login.email}
						onValueChange={(value) => (login.email = value)}
						required
					/>
					<button
						type="submit"
						disabled={login.waiting}
						aria-busy={login.waiting}
						class={submitClasses}
					>
						{login.waiting ? LOGIN_LINK_BUSY : LOGIN_LINK_SUBMIT}
					</button>
				</form>
			{/if}
		{/if}

		{#if !data.isLoggedIn && !data.mergeMode}
			<div class="mt-6 border-t border-slate-100 pt-5">
				<a
					href="/calendar"
					data-sveltekit-reload
					class="flex min-h-[48px] w-full items-center justify-center rounded-full border border-slate-300 px-4 py-3 text-center text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
				>
					{GUEST_START_HEADING}
				</a>
				<p class="mt-2 text-center text-xs text-slate-400">{GUEST_START_NOTE}</p>
			</div>
		{/if}
	</AuthCard>
</AuthPage>
