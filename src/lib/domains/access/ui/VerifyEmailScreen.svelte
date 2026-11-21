<!--
	`/account/verify-email`'s page body: one "Verify Email" button when the
	link carried a token, otherwise the 8-digit code form; success shows the
	action's message plus the "Go to Account" way back.

	The token comes from the route's `?token=`, passed in — the screen never
	reads the URL.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import {
		VERIFY_BUSY,
		VERIFY_CODE_LABEL,
		VERIFY_CODE_PLACEHOLDER,
		VERIFY_CODE_SUBMIT,
		VERIFY_HEADING,
		VERIFY_SUCCESS_EXTRA,
		VERIFY_SUCCESS_LINK,
		VERIFY_SUCCESS_PATH,
		VERIFY_TOKEN_BODY,
		VERIFY_TOKEN_SUBMIT
	} from '../access.auth.rules';

	/** The `$app/forms` `enhance` shape, taken as a prop so this file never imports `$app/*`. */
	type AccessFormEnhancer = (
		node: HTMLFormElement,
		submit: import('@sveltejs/kit').SubmitFunction
	) => { destroy(): void };

	/** The action's echo: `{success, message}` either way (legacy field names). */
	type VerifyEmailFormEcho = {
		success?: boolean;
		message?: string;
	};

	interface Props {
		form: VerifyEmailFormEcho | null;
		token: string;
		enhance: AccessFormEnhancer;
	}

	let { form, token, enhance }: Props = $props();

	let busy = $state(false);
</script>

<div class="mx-auto max-w-md p-6">
	<h1 class="mb-6 text-2xl font-bold">{VERIFY_HEADING}</h1>

	{#if form?.success}
		<div class="rounded-md bg-green-100 p-4 text-green-800">
			<p class="font-semibold">{form.message}</p>
			<p class="mt-2 text-sm">{VERIFY_SUCCESS_EXTRA}</p>
			<a href={VERIFY_SUCCESS_PATH} class="mt-4 inline-block text-green-700 underline">
				{VERIFY_SUCCESS_LINK}
			</a>
		</div>
	{:else if form && !form.success}
		<div class="mb-4 rounded-md bg-red-100 p-4 text-red-800">
			{form.message}
		</div>
	{/if}

	{#if !form?.success}
		{#if token}
			<div class="rounded-lg bg-blue-50 p-4 text-blue-800">
				<p class="mb-4">{VERIFY_TOKEN_BODY}</p>
				<form
					method="POST"
					action="?/verify"
					use:enhance={() => {
						busy = true;
						return async ({ update }) => {
							busy = false;
							await update();
						};
					}}
				>
					<input type="hidden" name="token" value={token} />
					<button
						type="submit"
						disabled={busy}
						class="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
					>
						{busy ? VERIFY_BUSY : VERIFY_TOKEN_SUBMIT}
					</button>
				</form>
			</div>
		{:else}
			<form
				method="POST"
				action="?/verify"
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						busy = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<label for="code" class="block font-medium">{VERIFY_CODE_LABEL}</label>
					<input
						type="text"
						id="code"
						name="code"
						class="w-full rounded-md border p-2"
						placeholder={VERIFY_CODE_PLACEHOLDER}
						required
					/>
				</div>
				<button
					type="submit"
					disabled={busy}
					class="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
				>
					{busy ? VERIFY_BUSY : VERIFY_CODE_SUBMIT}
				</button>
			</form>
		{/if}
	{/if}
</div>
