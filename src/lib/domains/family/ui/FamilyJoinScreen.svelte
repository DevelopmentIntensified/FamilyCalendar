<!--
	The `/family/join/[code]` card. An unusable link is explained where the
	person is (issue 124) — expired, revoked and used up are all named and none
	is guessed at — and never offers a Join button. A usable one offers Join when
	signed in, or sign-in/create with `?redirect=` when not; success shows
	"Welcome to the family!" and then leaves for `/family`.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	import { createFamilyApi } from '../family.api';
	import type { FamilyJoinPage } from '../family.contract';
	import {
		FAMILY_JOIN_REDIRECTING_COPY,
		FAMILY_JOIN_RETRY_NOTE,
		FAMILY_JOIN_UNUSABLE_ADVICE,
		FAMILY_JOIN_UNUSABLE_BODY,
		FAMILY_JOIN_UNUSABLE_HEADING,
		FAMILY_JOIN_WELCOME_HEADING,
		familyJoinView
	} from '../family.join.rules';
	import { FamilyJoinState } from '../family.join.state.svelte';

	interface Props {
		data: FamilyJoinPage;
		redirect: () => void;
	}

	let { data, redirect }: Props = $props();

	const state = new FamilyJoinState(createFamilyApi(), data.code, redirect);
	const view = $derived(familyJoinView(data));
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
	<div class="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
		{#if view === 'unusable'}
			<div class="text-center">
				<div class="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
					<svg
						class="h-9 w-9 text-gray-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0l-7 12a2 2 0 001.74 3z"
						/>
					</svg>
				</div>
				<h1 class="mb-2 text-2xl font-bold">{FAMILY_JOIN_UNUSABLE_HEADING}</h1>
				<p class="mb-4 text-gray-600">{FAMILY_JOIN_UNUSABLE_BODY}</p>
				<p class="mb-6 text-sm text-gray-500">{FAMILY_JOIN_UNUSABLE_ADVICE}</p>
			</div>

			<div class="space-y-4">
				<a
					href="/login"
					class="block w-full rounded bg-indigo-600 px-4 py-3 text-center font-semibold text-white hover:bg-indigo-700"
				>
					Log in
				</a>
				<a
					href="/family"
					class="block w-full rounded border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700 hover:bg-gray-50"
				>
					Your families
				</a>
			</div>
		{:else if state.success}
			<div class="text-center">
				<h2 class="mb-2 text-2xl font-bold text-green-600">{FAMILY_JOIN_WELCOME_HEADING}</h2>
				<p class="text-gray-600">{FAMILY_JOIN_REDIRECTING_COPY}</p>
			</div>
		{:else}
			<div class="mb-6 flex justify-center">
				<div
					class="flex h-20 w-20 items-center justify-center rounded-full"
					style="background-color: {data.family?.color || '#6366f1'}20;"
				>
					<span class="text-4xl">👨‍👩‍👧‍👦</span>
				</div>
			</div>

			<h1 class="mb-2 text-center text-2xl font-bold">Join {data.family?.name}</h1>
			<p class="mb-6 text-center text-gray-600">You've been invited to join this family calendar</p>

			{#if state.error}
				<div class="mb-4 rounded bg-red-50 p-3 text-center text-red-600" role="alert">
					{state.error}
					<span class="mt-1 block text-sm text-gray-600">{FAMILY_JOIN_RETRY_NOTE}</span>
				</div>
			{/if}

			{#if data.isLoggedIn}
				<button
					onclick={() => void state.join()}
					disabled={state.joining}
					aria-busy={state.joining}
					class="w-full rounded bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
				>
					{state.joining ? 'Joining…' : 'Join Family'}
				</button>
			{:else}
				<div class="space-y-4">
					<a
						href="/login?redirect=/family/join/{data.code}"
						class="block w-full rounded bg-indigo-600 px-4 py-3 text-center font-semibold text-white hover:bg-indigo-700"
					>
						Log in to Join
					</a>
					<a
						href="/signup?redirect=/family/join/{data.code}"
						class="block w-full rounded border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700 hover:bg-gray-50"
					>
						Create Account to Join
					</a>
				</div>
			{/if}
		{/if}
	</div>
</div>
