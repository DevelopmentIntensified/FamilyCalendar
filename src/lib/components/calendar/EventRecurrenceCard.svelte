<script lang="ts" module>
	/**
	 * The recurrence region `app-ui/event.html` draws: the rule the grid will
	 * repeat, how far that rule has actually got, the two scopes a change can be
	 * made at, and the mechanism behind them. The modal used to say only
	 * "Repeats weekly" in the header and left the scope question to the delete
	 * confirm, so "how big is this series" had no answer anywhere.
	 */
	import { DateTime } from 'luxon';
	import { freqNoun } from '$lib/utils/taskDisplay';
	import { toDate } from '$lib/utils/eventTime';

	interface SeriesFacts {
		/** "Every week on Tuesdays" — what the grid will repeat. */
		rule: string;
		/** "35 occurrences since Feb 2026" — how far the rule has got. */
		since: string;
		/** Occurrences that have started by `now`; 0 before the first one. */
		count: number;
	}

	/** The unit a frequency counts in, and how the rule reads. */
	const UNITS: ReadonlyMap<
		string,
		{ unit: 'days' | 'weeks' | 'months' | 'years'; singular: string; plural: string }
	> = new Map([
		['daily', { unit: 'days', singular: 'day', plural: 'days' }],
		['weekly', { unit: 'weeks', singular: 'week', plural: 'weeks' }],
		['monthly', { unit: 'months', singular: 'month', plural: 'months' }],
		['yearly', { unit: 'years', singular: 'year', plural: 'years' }]
	]);

	/**
	 * What the series is, in the prototype's words. Null when the event does not
	 * repeat, when its frequency is not one this vocabulary knows, or when its
	 * start cannot be read — a card that guessed would be worse than no card.
	 *
	 * The count is deliberately an elapsed-time count and not a promise about
	 * the grid: weekdays are not on the display event, so a twice-weekly rule
	 * counts its weeks, not its Tuesdays. The weekday and the month come from
	 * the viewer's own clock, like every other date the modal prints.
	 */
	export function describeSeries(
		event: {
			recurrenceFrequency?: string | null;
			recurrenceInterval?: number | null;
			start?: string | Date | null;
		},
		now: DateTime = DateTime.now()
	): SeriesFacts | null {
		const frequency = event.recurrenceFrequency;
		const words = frequency ? UNITS.get(frequency) : undefined;
		if (!words || !freqNoun(frequency)) return null;

		const start = DateTime.fromJSDate(toDate(event.start ?? null));
		if (!start.isValid) return null;

		const interval = Math.max(1, event.recurrenceInterval ?? 1);
		const weekday = start.toFormat('cccc');
		const lead = interval === 1 ? `Every ${words.singular}` : `Every ${interval} ${words.plural}`;

		const elapsed = Math.floor(now.diff(start, words.unit)[words.unit]);
		const count = elapsed < 0 ? 0 : Math.floor(elapsed / interval) + 1;

		return {
			rule: `${lead} on ${weekday}s`,
			since:
				count === 0
					? `Starts ${start.toFormat('LLL d, yyyy')}`
					: `${count} occurrence${count === 1 ? '' : 's'} since ${start.toFormat('LLL yyyy')}`,
			count
		};
	}
</script>

<script lang="ts">
	import type { Event } from '$lib/types';

	interface Props {
		event: Event;
		/** Which scope the delete confirm is currently armed at. */
		deleteScope?: 'this' | 'all';
		/**
		 * The scopes a change can be made at. A series opened as a whole has no
		 * single occurrence to point at, so its caller narrows this to `['all']`
		 * rather than offering a button that would delete every week instead.
		 */
		scopes?: ('this' | 'all')[];
		/** Change scope. Absent draws the card without the scope buttons. */
		onScope?: (scope: 'this' | 'all') => void;
	}

	let { event, deleteScope = 'all', scopes = ['this', 'all'], onScope }: Props = $props();

	const series = $derived(describeSeries(event));

	/** `event.html`'s scope labels, verbatim. */
	const SCOPE_LABEL: Record<'this' | 'all', string> = {
		this: 'This occurrence',
		all: 'All occurrences'
	};
</script>

{#if series}
	<div class="border-t border-slate-100 px-4 py-4 sm:px-6" data-testid="recurrence-card">
		<h3 class="mb-2 text-sm font-semibold text-slate-700">This is a repeating event</h3>
		<div class="flex items-center gap-2.5">
			<span class="min-w-0 flex-1">
				<span class="block text-sm font-semibold text-slate-800">{series.rule}</span>
				<span class="block text-xs text-slate-400" data-testid="series-count">{series.since}</span>
			</span>
		</div>
		{#if onScope}
			<div class="mt-3 flex flex-wrap gap-2">
				{#each scopes as scope (scope)}
					<button
						type="button"
						onclick={() => onScope(scope)}
						aria-pressed={deleteScope === scope}
						class="rounded-lg border px-3 py-2 text-sm font-medium transition-colors {deleteScope ===
						scope
							? 'border-primary-300 bg-primary-50 text-primary-700'
							: 'border-slate-300 text-slate-700 hover:bg-slate-50'}"
					>
						{SCOPE_LABEL[scope]}
					</button>
				{/each}
			</div>
			{#if !scopes.includes('this')}
				<p class="mt-2 text-xs text-slate-400">
					Open one occurrence to change just that week — the whole series is what a change here applies
					to.
				</p>
			{/if}
		{/if}
		<p class="mt-3 text-xs leading-relaxed text-slate-500">
			A cancel writes an <code class="text-[11px]">eventExceptions</code> row with
			<code class="text-[11px]">is_cancelled</code> and leaves the series alone — which is why the
			archive still shows it at its original time.
		</p>
	</div>
{/if}