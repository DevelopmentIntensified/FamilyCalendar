<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { FamilyBoardScreen } from '$lib/screens/familyHub/ui';
	let { data } = $props();
</script>

<FamilyBoardScreen {data} refresh={invalidateAll} />
