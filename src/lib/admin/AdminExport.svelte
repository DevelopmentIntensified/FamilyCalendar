<script lang="ts">
	import { downloadAsTxt } from './export';

	/** Full pre-rendered export text (agent-ready). */
	export let exportText: string;
	/** Filename prefix — the date is appended automatically. */
	export let fileBase: string;
	/** DOM id for the readonly textarea (copy fallback target). */
	export let textareaId: string;

	let open = false;

	async function copy() {
		try {
			await navigator.clipboard.writeText(exportText);
		} catch {
			document.querySelector<HTMLTextAreaElement>(`#${textareaId}`)?.select();
		}
	}

	function download() {
		downloadAsTxt(`${fileBase}-${new Date().toISOString().slice(0, 10)}.txt`, exportText);
	}
</script>

<div class="mb-6 flex items-center justify-between">
	<button
		type="button"
		on:click={() => (open = !open)}
		class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
	>
		{open ? 'Hide export' : 'Export for agent'}
	</button>
	{#if open}
		<div class="flex gap-2">
			<button
				type="button"
				on:click={copy}
				class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
			>
				Copy
			</button>
			<button
				type="button"
				on:click={download}
				class="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
			>
				Download .txt
			</button>
		</div>
	{/if}
</div>

{#if open}
	<div class="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
		<textarea
			id={textareaId}
			readonly
			rows="16"
			class="w-full resize-y bg-slate-50 p-4 font-mono text-xs text-slate-700 focus:outline-none"
			>{exportText}</textarea
		>
	</div>
{/if}
