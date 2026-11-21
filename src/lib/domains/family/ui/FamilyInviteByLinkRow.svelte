<!--
	One family's "Invite by link" row in the `/family` Invitations card: the
	button mints a 10-person, 7-day code through the page state, acknowledges in
	the click tick, then shows the link for THIS family only, with copy.

	Props in, callbacks out; the page owns the network.

	Doc: ../README.md#public-interface
-->
<script lang="ts">
	interface Props {
		familyId: string;
		familyName: string;
		/** This row's mint is in flight. */
		minting: boolean;
		/** The minted URL (path only), or '' when the last mint was another family's. */
		mintedUrl: string;
		copied: boolean;
		copyFailed: boolean;
		onmint: () => void;
		oncopy: () => void;
	}

	let { familyId, familyName, minting, mintedUrl, copied, copyFailed, onmint, oncopy }: Props =
		$props();

	const origin = typeof window !== 'undefined' ? window.location.origin : '';
</script>

<div class="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
	<div class="flex min-w-0 items-center gap-3">
		<svg
			class="h-5 w-5 shrink-0 text-slate-400"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5m8.656 2.828a4 4 0 000-5.656l-3-3a4 4 0 00-5.656 5.656l1.5 1.5"
			/>
		</svg>
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-medium text-slate-700">{familyName}</p>
			<p class="text-xs text-slate-400">Join link, good for 10 people</p>
		</div>
		<button
			type="button"
			data-family={familyId}
			disabled={minting}
			aria-busy={minting}
			onclick={onmint}
			class="shrink-0 rounded-full bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
		>
			{minting ? 'Making link…' : 'Invite by link'}
		</button>
	</div>

	{#if mintedUrl}
		<div class="mt-2 flex items-center gap-2">
			<input
				type="text"
				readonly
				aria-label="Join link for {familyName}"
				value={origin + mintedUrl}
				class="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
			/>
			<button
				type="button"
				onclick={oncopy}
				class="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
			>
				{copied ? 'Copied' : 'Copy'}
			</button>
		</div>
		{#if copyFailed}
			<p class="mt-1 text-xs text-red-600">
				Copy failed — select the link above and copy it manually.
			</p>
		{/if}
	{/if}
</div>
