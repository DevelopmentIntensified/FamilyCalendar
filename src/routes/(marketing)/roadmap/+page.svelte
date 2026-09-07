<script module lang="ts">
	import { roadmap } from '$lib/data/roadmap';
</script>

<svelte:head>
	<title>Family Planz: Roadmap</title>
	<meta
		name="description"
		content="Where Family Planz is headed — what's shipped, what we're working on, and what's coming next."
	/>
</svelte:head>

<div class="min-h-screen bg-slate-50 pt-20">
	<div class="mx-auto max-w-7xl px-6 py-12">
		<div class="mb-12 text-center">
			<h1 class="mb-4 text-4xl font-bold text-slate-900">Roadmap</h1>
			<p class="mx-auto max-w-2xl text-lg text-slate-600">
				What's shipped, what we're working on, and what's coming next.
			</p>
		</div>

		<div class="mb-12 grid gap-8 lg:grid-cols-3">
			{#each roadmap as section (section.id)}
				<section class="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
					<h2 class="text-2xl font-bold text-slate-900">{section.heading}</h2>
					<p class="mb-6 mt-1 text-sm text-slate-500">{section.blurb}</p>
					<ul class="space-y-6">
						{#each section.items as item (item.title)}
							<li class="border-l-4 border-primary-200 pl-4">
								<h3 class="mb-1 font-bold text-slate-900">{item.title}</h3>
								<p class="text-sm text-slate-600">{item.description}</p>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>

		<p class="mx-auto max-w-2xl text-center text-sm text-slate-500">
			This roadmap is planned, not promised — priorities shift as we learn what families need. We
			keep it honest rather than dated.
		</p>

		<div class="mt-12 rounded-2xl bg-slate-900 p-8 text-center md:p-12">
			<h2 class="mb-4 text-2xl font-bold text-white">Have a suggestion?</h2>
			<p class="mx-auto mb-6 max-w-2xl text-slate-400">
				We'd love to hear what would make Family Planz work better for your family.
			</p>
			<a
				href="/contact"
				class="inline-block min-h-[44px] rounded-full bg-primary-600 px-8 py-3 font-semibold leading-[1.2rem] text-white shadow-lg shadow-primary-600/30 transition-all hover:bg-primary-700"
			>
				Get in touch
			</a>
		</div>
	</div>
</div>
