<script lang="ts">
	interface Props {
		img: string;
		alt: string;
		title: string;
		blurb: string;
		wide?: boolean;
	}

	let { img, alt, title, blurb, wide = false }: Props = $props();
</script>

<div
	class="group relative overflow-hidden rounded-3xl transition-all hover:shadow-xl {wide
		? 'md:col-span-2 lg:col-span-1'
		: ''}"
>
	<img
		src={img}
		{alt}
		class="h-64 w-full object-cover transition-transform group-hover:scale-105"
	/>
	<div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
	<div class="absolute bottom-0 left-0 right-0 p-6">
		<h3 class="text-lg font-bold text-white">{title}</h3>
		<p class="text-sm text-white/80">{blurb}</p>
	</div>
</div>
