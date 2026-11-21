<!--
	The single global stylesheet for every route (#062). The chrome is NOT here:
	it belongs to the group layouts that render it (`(calendar)/calendar`,
	`(calendar)/account`, `(family)`), so a bare page — `/claim`, `/merge-guest`,
	marketing, admin — ships neither its navbar nor its bell (ADR 0010).

	Doc: src/lib/screens/shell/README.md#invariants
-->
<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

{@render children()}
