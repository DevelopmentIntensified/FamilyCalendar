<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import type { BugReportWithReporter } from '$lib/server/db/actions/bugReports';
	import { formatBugReportsExport, reporterName } from '$lib/admin/export';
	import AdminExport from '$lib/admin/AdminExport.svelte';

	export let data: PageData;

	const areaLabel: Record<string, string> = {
		calendar: 'Calendar',
		tasks: 'Tasks',
		account: 'Account',
		payments: 'Payments',
		dashboard: 'Dashboard',
		other: 'Other'
	};

	let exportText = formatBugReportsExport(data.open, data.resolved);

	function timeLabel(d: Date): string {
		return new Date(d).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<div class="min-h-screen bg-slate-50 px-4 py-8">
	<div class="mx-auto max-w-4xl">
		<div class="mb-6">
			<div>
				<h1 class="mb-2 text-2xl font-bold text-slate-900">Bug Reports</h1>
				<p class="text-sm text-slate-500">User-submitted bug reports, newest first.</p>
			</div>
		</div>

		<AdminExport {exportText} fileBase="bug-reports" textareaId="bug-export-text" />

		{#if data.open.length === 0}
			<p
				class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400"
			>
				No open bug reports. 🎉
			</p>
		{:else}
			<div class="space-y-4">
				{#each data.open as report (report.id)}
					<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
							<div class="flex items-center gap-2">
								<span
									class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700"
								>
									{areaLabel[report.area] ?? report.area}
								</span>
								<span class="text-xs text-slate-400">{timeLabel(report.createdAt)}</span>
							</div>
							<form method="POST" action="?/resolve" use:enhance class="inline">
								<input type="hidden" name="id" value={report.id} />
								<button
									type="submit"
									class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
								>
									Resolve
								</button>
							</form>
						</div>
						<p class="whitespace-pre-wrap text-sm text-slate-800">{report.description}</p>
						<p class="mt-3 text-xs text-slate-400">
							Reported by {reporterName(report)}
							{#if report.url}
								· at <a
									href={report.url}
									target="_blank"
									rel="noreferrer"
									class="text-primary-600 hover:underline">{report.url}</a
								>
							{/if}
						</p>
					</div>
				{/each}
			</div>
		{/if}

		{#if data.resolved.length > 0}
			<details class="mt-8">
				<summary class="cursor-pointer text-sm font-medium text-slate-500">
					Resolved ({data.resolved.length})
				</summary>
				<ul class="mt-2 space-y-1 text-sm text-slate-400">
					{#each data.resolved as report (report.id)}
						<li>{areaLabel[report.area] ?? report.area}: {report.description.slice(0, 120)}</li>
					{/each}
				</ul>
			</details>
		{/if}
	</div>
</div>
