<script lang="ts">
	/**
	 * The calendar glyph, in one place. Issue 095.
	 *
	 * This drawing was hand-copied into the navbar, the login page and the
	 * signup page, and the three copies had already drifted: the navbar's had no
	 * `stroke-linecap` and no `stroke-linejoin`, the other two did. A mark that
	 * is re-typed is a mark that drifts, so it lives here now and gets sized by
	 * a prop instead of a per-call-site class.
	 *
	 * `currentColor` on purpose — the three call sites all colour it with
	 * `text-primary-600`, and hard-coding a fill would have meant a fourth thing
	 * to keep in step.
	 *
	 * This is the INLINE wordmark glyph, not the app icon. The shipping icon is
	 * drawn in prototypes/brand-ui/marks.js and rasterised into static/brand/ —
	 * one source of truth per surface, because they are drawn at different
	 * sizes and the icon's whole job is to survive 16px.
	 */
	interface Props {
		/** Rendered px on both axes. The old call sites used h-8/h-5 classes. */
		size?: number;
		/** Passed straight through, so `class="h-8 w-8 text-primary-600"` still works. */
		class?: string;
		/**
		 * Supply this only where the icon is the ONLY name on screen. Left unset
		 * it is aria-hidden, which is right next to the "Family Planz" wordmark
		 * and wrong next to nothing.
		 */
		label?: string;
	}

	let { size = 24, class: klass = '', label = undefined }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={klass}
	aria-hidden={label ? undefined : 'true'}
	aria-label={label}
	role={label ? 'img' : undefined}
	focusable="false"
>
	<rect x="3" y="4" width="18" height="18" rx="2" />
	<path d="M8 2v4" />
	<path d="M16 2v4" />
	<path d="M3 10h18" />
</svg>
