<script lang="ts">
	/**
	 * Root layout: the single home for the global stylesheet. Every route
	 * group previously imported app.css separately → the compiled Tailwind
	 * globals shipped as multiple ~80KB duplicates (one per group, e.g. two
	 * 80K Toaster.*.css copies), and page CSS load rode on group chunks —
	 * the intermittently-missing-styles report (#062). One import here means
	 * exactly one global stylesheet on every page; per-route CSS stays
	 * code-split by SvelteKit for everything else.
	 */
	import '../app.css';
</script>

<slot />
