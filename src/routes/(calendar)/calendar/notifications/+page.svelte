<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { AlertsFeed } from '$lib/domains/alerts/ui';

	let { data } = $props();
</script>

<AlertsFeed
	notifications={data.notifications}
	unreadCount={data.unreadCount}
	refresh={invalidateAll}
	navigate={goto}
/>
