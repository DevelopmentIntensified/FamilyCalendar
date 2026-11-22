<!--
	`/claim`'s page body: the guests-only "Save your calendar" card, the
	naive and settled one-answer claim request, and the way back to the
	calendar. The form posts the page's own action (`?/request`), which runs the
	shared claim service; this screen only acknowledges the submit.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import {
		CLAIM_BACK_LINK,
		CLAIM_BODY,
		CLAIM_BUSY,
		CLAIM_EMAIL_LABEL,
		CLAIM_EMAIL_PLACEHOLDER,
		CLAIM_HEADING,
		CLAIM_LOGIN_LINK,
		CLAIM_LOGIN_QUESTION,
		CLAIM_SENT_PREFIX,
		CLAIM_SENT_SUFFIX,
		CLAIM_SUBMIT
	} from '../access.claimCopy.rules';

	/** The `$app/forms` `enhance` shape, taken as a prop so this file never imports `$app/*`. */
	type AccessFormEnhancer = (
		node: HTMLFormElement,
		submit: import('@sveltejs/kit').SubmitFunction
	) => { destroy(): void };

	/** What the action echoes: the address on success, the sentence on refusal. */
	type ClaimFormEcho = {
		success?: boolean;
		email?: string;
		error?: string;
	};

	interface Props {
		form: ClaimFormEcho | null;
		enhance: AccessFormEnhancer;
	}

	let { form, enhance }: Props = $props();

	let submitting = $state(false);
</script>

<div class="mx-auto max-w-md p-6">
	<h1 class="mb-2 text-2xl font-bold text-slate-900">{CLAIM_HEADING}</h1>
	<p class="mb-6 text-sm text-slate-600">{CLAIM_BODY}</p>

	{#if form?.success}
		<div class="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
			<p>
				{CLAIM_SENT_PREFIX} <strong>{form.email}</strong>
				{CLAIM_SENT_SUFFIX}
			</p>
		</div>
	{:else}
		{#if form?.error}
			<div
				role="alert"
				class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
			>
				{form.error}
			</div>
		{/if}

		<form
			method="POST"
			action="?/request"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<label for="email" class="block text-sm font-medium text-slate-700">{CLAIM_EMAIL_LABEL}</label>
				<input
					type="email"
					id="email"
					name="email"
					autocomplete="email"
					required
					placeholder={CLAIM_EMAIL_PLACEHOLDER}
					class="block w-full rounded-[10px] border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder-slate-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
				/>
			</div>

			<button
				type="submit"
				disabled={submitting}
				class="w-full rounded-full bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
			>
				{submitting ? CLAIM_BUSY : CLAIM_SUBMIT}
			</button>
		</form>

		{#if !form?.success}
			<div class="mt-6 border-t border-slate-100 pt-5 text-center">
				<p class="mb-2 text-sm text-slate-500">{CLAIM_LOGIN_QUESTION}</p>
				<a
					href="/login?merge=1"
					class="block w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900"
				>
					{CLAIM_LOGIN_LINK}
				</a>
			</div>
		{/if}
	{/if}

	<a href="/calendar" class="mt-6 block text-center text-sm text-slate-500 hover:text-slate-700">
		{CLAIM_BACK_LINK}
	</a>
</div>
