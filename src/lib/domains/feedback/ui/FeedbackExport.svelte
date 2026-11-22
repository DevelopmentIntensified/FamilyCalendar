<!--
	"Export for agent": the readonly textarea with the two actions, for either
	admin register. Legacy `src/lib/admin/AdminExport.svelte` is the reference
	for the markup and copy; the copy ladder is kernel `copyOrShare`, so a
	browser without the clipboard gets the select-and-press hint, truthfully.

	`downloadAsTxt` from the legacy `admin/export.ts` dies here (this was its
	only caller), with one fix: the object URL is revoked after the click, not
	in the same tick, where some browsers cancel the download.

	`today` is the caller's `YYYY-MM-DD` (the page's clock), so the filename
	never reads a clock of its own (rule R5).

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import type { Toasts } from '$lib/kernel/client/toasts.svelte';

	interface Props {
		/** The pre-rendered, agent-ready register text. */
		exportText: string;
		/** Filename prefix; `-<today>.txt` is appended. */
		fileBase: string;
		/** DOM id of the readonly textarea (the manual-copy fallback target). */
		textareaId: string;
		/** `YYYY-MM-DD` for the download name, from the caller's clock. */
		today: string;
		toasts: Toasts;
	}

	let { exportText, fileBase, textareaId, today, toasts }: Props = $props();

	let open = $state(false);

	/** Opening the panel starts the clipboard chunk, so the Copy click finds it resolved. */
	function toggle(): void {
		open = !open;
		if (open) void import('$lib/kernel/client/shareText');
	}

	async function copy(): Promise<void> {
		// A lazy chunk: only an open panel needs the clipboard ladder (ADR 0010).
		const { copyOrShare } = await import('$lib/kernel/client/shareText');
		const outcome = await copyOrShare(exportText);
		if (outcome === 'copied' || outcome === 'shared') {
			toasts.success('Export copied to clipboard — paste it into your agent.');
			return;
		}
		if (outcome === 'failed') {
			document.querySelector<HTMLTextAreaElement>(`#${textareaId}`)?.select();
			toasts.error("Couldn't copy — text is selected, press Ctrl/Cmd+C.");
		}
	}

	function download(): void {
		const url = URL.createObjectURL(new Blob([exportText], { type: 'text/plain' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `${fileBase}-${today}.txt`;
		link.click();
		// After the click, never in the same tick: revoking too early cancels it.
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}
</script>

<div class="mb-6 flex items-center justify-between">
	<button
		type="button"
		onclick={toggle}
		data-testid="toggle-export"
		class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
	>
		{open ? 'Hide export' : 'Export for agent'}
	</button>
	{#if open}
		<div class="flex gap-2">
			<button
				type="button"
				onclick={copy}
				data-testid="copy-export"
				class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
			>
				Copy
			</button>
			<button
				type="button"
				onclick={download}
				data-testid="download-export"
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
