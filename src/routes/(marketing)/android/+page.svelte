<script lang="ts">
	import type { AndroidRelease } from '$lib/fdroid/release';

	let { data }: { data: { release: AndroidRelease } } = $props();
	const release = $derived(data.release);
</script>

<svelte:head>
	<title>Android App - Family Planz</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 pt-20">
	<div class="mx-auto max-w-3xl px-6 py-12">
		<div class="mb-12 text-center">
			<h1 class="mb-4 text-4xl font-bold text-slate-900">Family Planz for Android</h1>
			<p class="mx-auto max-w-2xl text-lg text-slate-600">
				👪 The shared family calendar, tasks, and groceries — as a native Android app.
			</p>
		</div>

		{#if !release.repo}
			<section class="mb-8 rounded-2xl bg-white p-8 text-center shadow-sm" data-testid="no-release">
				<h2 class="mb-2 text-2xl font-bold text-slate-900">Coming soon</h2>
				<p class="text-slate-600">
					The first Android release has not been published yet. Until then, Family Planz works in
					your phone's browser — open <a class="text-primary-600 underline" href="/"
						>familyplanz.com</a
					> and add it to your home screen.
				</p>
			</section>
		{:else}
			<section class="mb-8 rounded-2xl bg-white p-8 shadow-sm">
				<h2 class="mb-4 text-2xl font-bold text-slate-900">Get it with F-Droid</h2>
				<p class="mb-6 text-slate-600">
					Our own F-Droid repository delivers Family Planz and every update after it.
				</p>
				<div class="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
					<img
						src={release.repo.qrUrl}
						alt="QR code that adds the Family Planz repository to F-Droid"
						width="180"
						height="180"
						class="rounded-lg border border-slate-200 bg-white p-2"
					/>
					<ol class="list-decimal space-y-2 pl-5 text-slate-700">
						<li>
							Install the F-Droid app from <a
								class="text-primary-600 underline"
								href="https://f-droid.org/"
								rel="noopener">f-droid.org</a
							>.
						</li>
						<li>
							On your phone, tap
							<a
								class="font-semibold text-primary-600 underline"
								href={release.repo.addRepoLink}
								data-testid="add-repo">Add to F-Droid</a
							>. On a computer, scan the QR code with the phone instead.
						</li>
						<li>Check that the fingerprint F-Droid shows matches the one below, then add it.</li>
						<li>Search for “Family Planz” in F-Droid and install. Updates arrive there too.</li>
					</ol>
				</div>
				<div class="mt-6">
					<p class="mb-1 text-sm font-semibold text-slate-700">Repository</p>
					<p class="mb-3 break-all font-mono text-sm text-slate-600">{release.repoUrl}</p>
					<p class="mb-1 text-sm font-semibold text-slate-700">Signing key fingerprint (SHA-256)</p>
					<p class="break-all font-mono text-sm text-slate-600" data-testid="fingerprint">
						{release.repo.fingerprintGrouped}
					</p>
				</div>
			</section>

			{#if release.apk}
				<section class="mb-8 rounded-2xl bg-white p-8 shadow-sm">
					<h2 class="mb-4 text-2xl font-bold text-slate-900">Or download the APK</h2>
					<a
						href={release.apk.url}
						download
						class="inline-block rounded-lg bg-primary-600 px-6 py-3 font-semibold text-white hover:bg-primary-700"
						data-testid="download-apk"
					>
						Download Family Planz {release.apk.versionName} ({release.apk.sizeMb} MB)
					</a>
					<p class="mt-3 text-sm text-slate-600">
						A direct download does not update itself — F-Droid does. SHA-256:
						<span class="break-all font-mono">{release.apk.sha256}</span>
					</p>
				</section>
			{/if}
		{/if}

		<section class="rounded-2xl bg-white p-8 shadow-sm">
			<h2 class="mb-2 text-2xl font-bold text-slate-900">Google Play</h2>
			<p class="text-slate-600">
				Coming soon. The Play Store build is signed by Google, so it cannot update an app installed
				from here (or the other way round) — to switch, uninstall first.
			</p>
		</section>
	</div>
</div>
