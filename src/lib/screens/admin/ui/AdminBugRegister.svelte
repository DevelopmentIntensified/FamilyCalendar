<!--
	The `/admin/bugs` page body: heading, subtitle, "Export for agent" and
	feedback's bug register. Legacy
	`src/routes/(admin)/admin/bugs/+page.svelte` is the reference for the copy
	and the wrapper; the rows, the export text and the optimistic resolve are
	feedback's (`FeedbackBugRegisterState`), reached through its public entries.

	The page builds the state from `data` once: an optimistic resolve moves the
	row in the register and in the export text without a reload (issue 262),
	so no `enhance`/`invalidateAll` is needed.

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import { FeedbackBugRegisterState, type FeedbackApi } from '$lib/domains/feedback';
	import { FeedbackExport, FeedbackRegister } from '$lib/domains/feedback/ui';
	import type { Toasts } from '$lib/kernel/client/toasts.svelte';
	import type { AdminBugRegisterData } from '../admin.contract';
	import { adminToasts } from '../admin.toasts.state.svelte';

	interface Props {
		data: AdminBugRegisterData;
		api: FeedbackApi;
		/** The area's one toast list; a test passes its own. */
		toasts?: Toasts;
	}

	let { data, api, toasts = adminToasts }: Props = $props();

	const state = new FeedbackBugRegisterState(api, toasts, data, data.now, data.zone);
</script>

<div class="min-h-screen bg-slate-50 px-4 py-8">
	<div class="mx-auto max-w-4xl">
		<div class="mb-6">
			<h1 class="mb-2 text-2xl font-bold text-slate-900">Bug Reports</h1>
			<p class="text-sm text-slate-500">User-submitted bug reports, newest first.</p>
		</div>

		<FeedbackExport
			exportText={state.exportText}
			fileBase="bug-reports"
			textareaId="bug-export-text"
			today={state.today}
			{toasts}
		/>

		<FeedbackRegister
			kind="bug"
			open={state.open}
			resolved={state.resolved}
			pendingId={state.pendingId}
			onresolve={(id) => state.resolve(id)}
		/>
	</div>
</div>
