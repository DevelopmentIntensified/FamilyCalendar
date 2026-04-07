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
		} catch (e) {
			error = 'Failed to join family';
		} finally {
			joining = false;
		}
	};
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
	<div class="w-full max-w-md rounded-lg bg-white p-8 shadow-lg">
		{#if success}
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
			<p class="mb-6 text-center text-gray-600">
				You've been invited to join this family calendar
			</p>

			{#if error}
				<div class="mb-4 rounded bg-red-50 p-3 text-center text-red-600">
					{error}
				</div>
			{/if}

			{#if data.isLoggedIn}
				<button
					on:click={handleJoin}
					disabled={joining}
					class="w-full rounded bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
				>
					{joining ? 'Joining...' : 'Join Family'}
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
						href="/register?redirect=/family/join/{data.code}"
						class="block w-full rounded border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700 hover:bg-gray-50"
					>
						Create Account to Join
					</a>
				</div>
			{/if}
		{/if}
	</div>
</div>
