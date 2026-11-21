<!--
	The first-run card: shown only when the calendar has nothing of the family's
	own — Sponsored Events do not count as content (owner Q-097 B). Dismissal
	persists in `familyplanz:firstRunDismissed`; the state class owns the write,
	this card only reports the tap.
-->
<script lang="ts">
	interface Props {
		ondismiss: () => void;
	}

	let { ondismiss }: Props = $props();
</script>

<div class="relative mx-auto mb-4 max-w-xl px-4 pt-4">
	<div
		class="relative flex flex-col items-center rounded-2xl bg-primary-50/50 px-6 py-8 text-center"
	>
		<svg
			class="mx-auto h-24 w-auto text-primary-300"
			fill="none"
			viewBox="0 0 64 64"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<rect x="10" y="14" width="44" height="40" rx="6" />
			<path stroke-linecap="round" d="M10 26h44M20 10v8M44 10v8" />
			<path stroke-linecap="round" d="M22 38h12M22 46h20" />
		</svg>
		<h2 class="mt-3 text-lg font-bold text-slate-800">Blank calendar!</h2>
		<p class="mt-1 max-w-sm text-sm text-slate-500">
			Add your first thing — or start from ✨ Smart tasks.
		</p>
		<a
			href="/calendar/tasks"
			class="mt-4 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
		>
			Browse ✨ Smart tasks
		</a>
	</div>
	<button
		type="button"
		onclick={ondismiss}
		aria-label="Dismiss"
		class="absolute right-6 top-6 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-white hover:text-slate-600"
	>
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
		</svg>
	</button>
</div>
