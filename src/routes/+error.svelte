<!--
	The error node is preloaded on every route (SvelteKit loads the route's error
	node with its layouts), so this file imports the card's FILE, never
	`$lib/screens/shell/ui`: that entry re-exports the chrome too, and importing
	it put the whole app chrome (ShellGroupFrame, the notices, the tab bar) in
	every page's eager error preload — the mobile-only initial-JS inflation of
	ADR 0010. Same rule the group layouts and marketing's header follow.

	`runes` is declared because this file uses none: undeclared, Svelte compiles
	it in legacy mode and the node drags the legacy-init and lifecycle chunks
	into every page's eager error preload (~0.9 KB gzip).
-->
<svelte:options runes />

<script lang="ts">
	import { building } from '$app/environment';
	import { page } from '$app/state';
	import ShellErrorView from '$lib/screens/shell/ui/ShellErrorView.svelte';
</script>

<ShellErrorView
	status={page.status}
	message={page.error?.message}
	pathname={page.url.pathname}
	search={building ? '' : page.url.search}
/>
