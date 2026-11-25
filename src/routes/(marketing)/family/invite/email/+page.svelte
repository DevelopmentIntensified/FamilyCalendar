<script lang="ts">
	import InviteEmailScreen from '$lib/domains/access/ui/InviteEmailScreen.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<InviteEmailScreen {data} {form} />
