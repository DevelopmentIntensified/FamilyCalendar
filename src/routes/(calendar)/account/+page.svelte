<script lang="ts">
	import { enhance } from '$app/forms';
	import { AccountScreen } from '$lib/screens/account/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<AccountScreen {data} {form} {enhance} />
