<!--
	One admin register body, for either kind: open bug cards or open phrase
	tables, plus the collapsible Resolved list. Legacy
	`src/routes/(admin)/admin/bugs/+page.svelte` and `…/nlp/+page.svelte` are
	the reference for the copy and layout; the page shell (heading, export,
	spacing wrapper) belongs to the `admin` screen that composes this.

	Data and one callback in, nothing out: the caller owns the api, the
	optimistic move and the toast (`FeedbackBugRegisterState.resolve` /
	`FeedbackPhraseRegisterState.resolve`). `pendingId` disables only the row
	being resolved, so a second click cannot start a second request.

	Row timestamps keep the legacy locale format: the admin pages are a visual
	baseline, and "Nov 21, 9:30 AM" is what the person saw before.

	Doc: ../README.md#invariants
-->
<script lang="ts">
	import Pill from '$lib/kernel/ui/Pill.svelte';
	import type {
		BugReportWithReporter,
		FeedbackKind,
		UnmatchedPhraseView
	} from '../feedback.contract';
	import { matchedSummary, reporterName } from '../feedback.export.rules';
	import { bugAreaLabel, groupUnmatchedPhrases, unmatchedSourceLabel } from '../feedback.rules';

	type FeedbackRegisterRow = BugReportWithReporter | UnmatchedPhraseView;

	interface Props {
		kind: FeedbackKind;
		open: readonly FeedbackRegisterRow[];
		resolved: readonly FeedbackRegisterRow[];
		/** The row a resolve is in flight for, if any. */
		pendingId?: string | null;
		onresolve: (id: string) => void;
	}

	let { kind, open, resolved, pendingId = null, onresolve }: Props = $props();

	/** True for a bug row: the two row kinds differ by their own columns. */
	function isBugReportRow(row: FeedbackRegisterRow): row is BugReportWithReporter {
		return 'area' in row;
	}

	/** True for a phrase row. */
	function isUnmatchedPhraseRow(row: FeedbackRegisterRow): row is UnmatchedPhraseView {
		return 'phrase' in row;
	}

	const bugOpen = $derived(open.filter(isBugReportRow));
	const bugResolved = $derived(resolved.filter(isBugReportRow));
	const phraseOpen = $derived(open.filter(isUnmatchedPhraseRow));
	const phraseResolved = $derived(resolved.filter(isUnmatchedPhraseRow));
	const groups = $derived(groupUnmatchedPhrases(phraseOpen));

	/** The match sample as `key: value` rows; empty when there is none stored. */
	function matchedEntries(matched: string | null): [string, string][] {
		const summary = matchedSummary(matched);
		if (!summary) return [];
		return Object.entries(summary).map(([key, value]): [string, string] => [key, String(value)]);
	}

	/** The legacy card timestamp: "Nov 21, 9:30 AM". */
	function timeLabel(instant: Date): string {
		return instant.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	/** The legacy table's first-seen date. */
	function dateLabel(instant: Date): string {
		return instant.toLocaleDateString();
	}
</script>

{#if kind === 'bug'}
	{#if bugOpen.length === 0}
		<p
			class="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400"
		>
			No open bug reports. 🎉
		</p>
	{:else}
		<div class="space-y-4">
			{#each bugOpen as report (report.id)}
				<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
					<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
						<div class="flex items-center gap-2">
							<Pill tone="danger">{bugAreaLabel(report.area)}</Pill>
							<span class="text-xs text-slate-400">{timeLabel(report.createdAt)}</span>
						</div>
						<button
							type="button"
							onclick={() => onresolve(report.id)}
							disabled={pendingId === report.id}
							data-testid="resolve-feedback"
							class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
						>
							{pendingId === report.id ? 'Resolving…' : 'Resolve'}
						</button>
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
{:else}
	{#each groups as [source, phrases] (source)}
		<section class="mb-8">
			<h2 class="mb-3 text-lg font-semibold text-slate-700">
				{unmatchedSourceLabel(source)}
				<span class="ml-1 text-sm font-normal text-slate-400">({phrases.length})</span>
			</h2>
			<div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
				<table class="w-full text-left text-sm">
					<thead class="bg-slate-50 text-xs uppercase text-slate-500">
						<tr>
							<th class="px-4 py-2">Phrase</th>
							<th class="px-4 py-2">Matched</th>
							<th class="px-4 py-2">Count</th>
							<th class="px-4 py-2">First seen</th>
							<th class="px-4 py-2"></th>
						</tr>
					</thead>
					<tbody>
						{#each phrases as phrase (phrase.id)}
							<tr class="border-t border-slate-100">
								<td class="px-4 py-2 font-mono text-slate-800">{phrase.phrase}</td>
								<td class="px-4 py-2 align-top">
									{#each matchedEntries(phrase.matched) as [key, value] (key)}
										<div class="font-mono text-xs leading-relaxed text-slate-500">
											<span class="text-slate-400">{key}:</span>
											{value}
										</div>
									{:else}
										<span class="text-slate-300">—</span>
									{/each}
								</td>
								<td class="px-4 py-2">
									<Pill>{phrase.count}</Pill>
								</td>
								<td class="px-4 py-2 text-slate-500">
									{dateLabel(phrase.createdAt)}
								</td>
								<td class="px-4 py-2 text-right">
									<button
										type="button"
										onclick={() => onresolve(phrase.id)}
										disabled={pendingId === phrase.id}
										data-testid="resolve-feedback"
										class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
									>
										{pendingId === phrase.id ? 'Resolving…' : 'Resolve'}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{:else}
		<p class="text-slate-400">Nothing unmatched. Parsers are holding up.</p>
	{/each}
{/if}

{#if resolved.length > 0}
	<details class="mt-8">
		<summary class="cursor-pointer text-sm font-medium text-slate-500">
			Resolved ({resolved.length})
		</summary>
		<ul class="mt-2 space-y-1 text-sm text-slate-400">
			{#if kind === 'bug'}
				{#each bugResolved as report (report.id)}
					<li>{bugAreaLabel(report.area)}: {report.description.slice(0, 120)}</li>
				{/each}
			{:else}
				{#each phraseResolved as phrase (phrase.id)}
					<li class="font-mono">
						{phrase.phrase}
						<span class="text-xs">×{phrase.count}</span>
					</li>
				{/each}
			{/if}
		</ul>
	</details>
{/if}
