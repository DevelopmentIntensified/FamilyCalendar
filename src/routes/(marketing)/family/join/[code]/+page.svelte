<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';

	export let data: PageData;

	let joining = false;
	let error = '';
	let success = false;

	const handleJoin = async () => {
		joining = true;
		error = '';

		try {
			const res = await fetch('/api/family/join', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: data.code })
			});

			const json = await res.json();

			if (json.error) {
				error = json.error;
			} else {
				success = true;
				setTimeout(() => {
					goto('/family');
				}, 1500);
			}
		} catch {
			error = 'We could not reach the server. Check your connection and try again.';
		} finally {
			joining = false;
		}
	};
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
	<div class="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
		{#if data.invalid || !data.family}
			<!-- A link that cannot be used, explained rather than redirected away
			     from. Three reasons are possible and the server cannot tell them
			     apart, so all three are named and none is guessed at. -->
			<div class="text-center">
				<div
					class="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100"
				>
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
				<h1 class="mb-2 text-2xl font-bold">This invite link isn't valid any more</h1>
				<p class="mb-4 text-gray-600">
					Nothing is wrong on your side. The link may have expired, it may have been revoked, or every
					use of it may already have been taken.
				</p>
				<p class="mb-6 text-sm text-gray-500">
					Ask whoever invited you to send you a new link — it takes them a moment on their family
					page.
				</p>
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
		{:else if success}
			<div class="text-center">
				<h2 class="mb-2 text-2xl font-bold text-green-600">Welcome to the family!</h2>
				<p class="text-gray-600">Redirecting you to your family page...</p>
			</div>
		{:else}
			<div class="mb-6 flex justify-center">
				<div
					class="flex h-20 w-20 items-center justify-center rounded-full"
					style="background-color: {data.family.color || '#6366f1'}20;"
				>
					<span class="text-4xl">👨‍👩‍👧‍👦</span>
				</div>
			</div>

			<h1 class="mb-2 text-center text-2xl font-bold">Join {data.family.name}</h1>
			<p class="mb-6 text-center text-gray-600">You've been invited to join this family calendar</p>

			{#if error}
				<div class="mb-4 rounded bg-red-50 p-3 text-center text-red-600" role="alert">
					{error}
					<span class="mt-1 block text-sm text-gray-600">
						If this keeps happening, ask for a fresh invite link.
					</span>
				</div>
			{/if}

			{#if data.isLoggedIn}
				<button
					on:click={handleJoin}
					disabled={joining}
					aria-busy={joining}
					class="w-full rounded bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
				>
					{joining ? 'Joining…' : 'Join Family'}
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