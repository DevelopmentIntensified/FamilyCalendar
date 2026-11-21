<!--
	The auth pages' inline status: a red refusal (`role="alert"`) or a green
	notice (`role="status"`). The banner variant is the icon strip the sign-in
	pages used; the compact variant is the recovery pages' small box. Copy in,
	nothing else.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	interface Props {
		/** `error` is red and assertive; `success` is green and polite (#246). */
		kind: 'error' | 'success';
		text: string;
		/** The icon strip (sign-in pages) or the small box (recovery pages). */
		variant?: 'banner' | 'compact';
	}

	let { kind, text, variant = 'banner' }: Props = $props();
</script>

{#if variant === 'compact'}
	<div class="mb-4 rounded-lg p-3 text-sm {kind === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}">
		{text}
	</div>
{:else if kind === 'error'}
	<div
		role="alert"
		class="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
	>
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="mt-0.5 h-4 w-4 shrink-0"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line
				x1="12"
				x2="12.01"
				y1="16"
				y2="16"
			/>
		</svg>
		<span>{text}</span>
	</div>
{:else}
	<div
		role="status"
		class="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
	>
		{text}
	</div>
{/if}
