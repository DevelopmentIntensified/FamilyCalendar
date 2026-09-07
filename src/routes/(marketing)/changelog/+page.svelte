<script module lang="ts">
	import { changelog } from '$lib/data/changelog';

	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		timeZone: 'UTC',
		month: 'long',
		day: 'numeric',
		year: 'numeric'
	});

	function formatDate(iso: string): string {
		return dateFormatter.format(new Date(`${iso}T00:00:00Z`));
	}
</script>

<svelte:head>
	<title>Family Planz: What's New</title>
	<meta
		name="description"
		content="The latest updates to Family Planz — receipt scanning, task visibility, quick-add improvements, calendar exports, and more."
	/>
</svelte:head>

<div class="min-h-screen bg-slate-50 pt-20">
	<div class="mx-auto max-w-3xl px-6 py-12">
		<div class="mb-12 text-center">
			<h1 class="mb-4 text-4xl font-bold text-slate-900">What's new in Family Planz</h1>
			<p class="mx-auto max-w-2xl text-lg text-slate-600">New features and fixes, newest first.</p>
		</div>

		<ul class="space-y-6">
			{#each changelog as entry (entry.title)}
				<li class="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
					<div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
						{#if entry.tag}
							<span
								class="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold tracking-wide text-primary-700"
							>
								{entry.tag}
							</span>
						{/if}
						<time datetime={entry.date} class="text-sm text-slate-500">
							{formatDate(entry.date)}
						</time>
					</div>
					<h2 class="mb-2 text-xl font-bold text-slate-900">{entry.title}</h2>
					<p class="text-slate-600">{entry.description}</p>
				</li>
			{/each}
		</ul>

		<div class="mt-12 rounded-2xl bg-slate-900 p-8 text-center md:p-12">
			<h2 class="mb-4 text-2xl font-bold text-white">Want to see it all in action?</h2>
			<p class="mx-auto mb-6 max-w-2xl text-slate-400">
				Create a free family calendar and try the latest features yourself.
			</p>
			<a
				href="/signup"
				class="inline-block min-h-[44px] rounded-full bg-primary-600 px-8 py-3 font-semibold leading-[1.2rem] text-white shadow-lg shadow-primary-600/30 transition-all hover:bg-primary-700"
			>
				Get started free
			</a>
		</div>
	</div>
</div>
