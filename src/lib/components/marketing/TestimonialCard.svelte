<script lang="ts">
	interface Props {
		accent: string;
		star: string;
		avatar: string;
		quote: string;
		initial: string;
		name: string;
		detail: string;
	}

	let { accent, star, avatar, quote, initial, name, detail }: Props = $props();

	const STAR_PATH =
		'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z';
</script>

<div class="rounded-3xl border {accent} p-8">
	<div class="mb-4 flex items-center gap-1">
		{#each [0, 1, 2, 3, 4] as i (i)}
			<svg class="h-5 w-5 {star}" fill="currentColor" viewBox="0 0 20 20"
				><path d={STAR_PATH} /></svg
			>
		{/each}
	</div>
	<p class="mb-6 italic text-slate-700">"{quote}"</p>
	<div class="flex items-center gap-3">
		<div
			class="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br {avatar} text-lg font-bold text-white shadow-sm"
		>
			{initial}
		</div>
		<div>
			<div class="font-semibold text-slate-900">{name}</div>
			<div class="text-sm text-slate-500">{detail}</div>
		</div>
	</div>
</div>
