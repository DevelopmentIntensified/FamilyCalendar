<script lang="ts">
	import { page } from '$app/state';
	import { ShellErrorView } from '$lib/screens/shell/ui';
</script>

<ShellErrorView
	status={page.status}
	message={page.error?.message}
	pathname={page.url.pathname}
	search={page.url.search}
/>
