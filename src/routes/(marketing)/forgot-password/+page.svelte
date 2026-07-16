<script lang="ts">
	let email = '';
	let error = '';
	let waiting = false;
	let sent = false;

	async function handleSubmit() {
		waiting = true;
		error = '';

		try {
			const res = await fetch('/forgot-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email })
			});

			const json = await res.json();

			if (json.error) {
				error = json.error;
			} else {
				sent = true;
			}
		} catch (e) {
			error = 'Failed to send reset email';
		}

		waiting = false;
	}
</script>

<svelte:head>
	<title>Family Planz: Reset Password</title>
</svelte:head>

<div class="min-h-screen bg-slate-50">
	<div class="flex flex-col items-center px-4 pt-16">
		<div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
			<div class="mb-8 text-center">
				<h1 class="text-3xl font-bold text-slate-900">Reset Password</h1>
				<p class="mt-2 text-slate-600">
					Remember your password?
					<a href="/login" class="text-primary-600 hover:text-primary-700">Log in</a>
				</p>
			</div>

			{#if error}
				<div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
					{error}
				</div>
			{/if}

			{#if sent}
				<div class="text-center">
					<div class="mb-4 text-6xl">📧</div>
					<h2 class="mb-2 text-xl font-semibold text-slate-900">Check Your Email</h2>
					<p class="text-slate-600">
						If an account exists for <strong>{email}</strong>, we've sent a password reset link.
					</p>
				</div>
			{:else}
				<form on:submit|preventDefault={handleSubmit} class="space-y-5">
					<div>
						<label for="email" class="block text-sm font-medium text-slate-700">Email</label>
						<input
							id="email"
							type="email"
							bind:value={email}
							class="mt-1.5 block w-full rounded-lg border border-slate-300 px-4 py-2.5 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
							required
						/>
					</div>

					<button
						type="submit"
						disabled={waiting}
						class="w-full rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700 disabled:bg-slate-300"
					>
						{waiting ? 'Sending...' : 'Send Reset Link'}
					</button>
				</form>
			{/if}
		</div>
	</div>
</div>
