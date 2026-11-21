<script lang="ts">
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { LoginScreen } from '$lib/domains/access/ui';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const redirect = (path: string) => goto(path, { invalidateAll: true });

	function cleanUrl() {
		const url = new URL(page.url);
		url.searchParams.delete('error');
		url.searchParams.delete('notice');
		replaceState(url.pathname + url.search, {});
	}
</script>

<LoginScreen
	{data}
	{redirect}
	{cleanUrl}
	urlError={page.url.searchParams.get('error')}
	urlNotice={page.url.searchParams.get('notice')}
/>
