<script lang="ts">
	import { enhance } from '$app/forms';
	import { ReportBugForm } from '$lib/domains/feedback/ui';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<ReportBugForm areas={data.areas} from={data.from} {form} {enhance} />
