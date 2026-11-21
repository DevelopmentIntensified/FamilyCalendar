<script lang="ts">
	import { enhance } from '$app/forms';
	import { FamilyCreateScreen } from '$lib/domains/family/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<FamilyCreateScreen {data} {form} {enhance} />
