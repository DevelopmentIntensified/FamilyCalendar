<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { FamilyHubScreen } from '$lib/screens/familyHub/ui';
	let { data, form } = $props();
</script>

<FamilyHubScreen {data} {form} refresh={invalidateAll} {enhance} />
