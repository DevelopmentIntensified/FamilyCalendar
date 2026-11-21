<!--
	The `/admin/nlp` page body: heading, subtitle, "Export for agent" and
	feedback's unmatched-phrase register. Legacy
	`src/routes/(admin)/admin/nlp/+page.svelte` is the reference for the copy
	and the wrapper; the rows, the export text and the optimistic resolve are
	feedback's (`FeedbackPhraseRegisterState`), reached through its public
	entries.

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import { FeedbackPhraseRegisterState, type FeedbackApi } from '$lib/domains/feedback';
	import { FeedbackExport, FeedbackRegister } from '$lib/domains/feedback/ui';
	import type { Toasts } from '$lib/kernel/client/toasts.svelte';
	import type { AdminPhraseRegisterData } from '../admin.contract';

	interface Props {
		data: AdminPhraseRegisterData;
		api: FeedbackApi;
		toasts: Toasts;
	}

	let { data, api, toasts }: Props = $props();

	const state = new FeedbackPhraseRegisterState(api, toasts, data, data.now, data.zone);
</script>

<div class="min-h-screen bg-slate-50 px-4 py-8">
	<div class="mx-auto max-w-4xl">
		<h1 class="mb-2 text-2xl font-bold text-slate-900">Unmatched Phrases</h1>
		<p class="mb-6 text-sm text-slate-500">
			Instructions the NLP/regex parsers could not handle. Add patterns for the frequent ones.
		</p>

		<FeedbackExport
			exportText={state.exportText}
			fileBase="unmatched-phrases"
			textareaId="phrase-export-text"
			today={state.today}
			{toasts}
		/>

		<FeedbackRegister
			kind="phrase"
			open={state.open}
			resolved={state.resolved}
			pendingId={state.pendingId}
			onresolve={(id) => state.resolve(id)}
		/>
	</div>
</div>
