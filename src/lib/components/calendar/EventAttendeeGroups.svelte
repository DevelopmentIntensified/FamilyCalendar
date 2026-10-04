<script lang="ts" module>
	/**
	 * The attendance region as `app-ui/event.html` draws it (issue 126): a
	 * count and a proportion in the heading, a stacked going / maybe / pending
	 * bar, and one row per person carrying their own status. The app previously
	 * grouped people into status chips, which answered "how many" but not "who".
	 */
	export interface AttendeeRow {
		firstName?: string | null;
		lastName?: string | null;
		userId?: string | null;
		status?: string | null;
		inviteType?: string | null;
	}

	/** A named guest: an attendance row with no account behind it. */
	export interface GuestRow {
		name: string;
		status?: string | null;
		inviteType?: string | null;
	}

	export type AttendanceStatus = 'going' | 'maybe' | 'declined' | 'invited' | 'pending';

	/**
	 * The prototype's four states. `invited` and `pending` are deliberately
	 * distinct: an invited person owes an answer, while a member with no answer
	 * at all has not been asked in the same way, and flattening them hides the
	 * difference the prototype draws between "Not yet answered" and "No answer".
	 */
	export const STATUS_LABEL: Record<AttendanceStatus, string> = {
		going: 'Going',
		maybe: 'Maybe',
		declined: 'Can\u2019t go',
		invited: 'Not yet answered',
		pending: 'No answer'
	};

	/** Tailwind dot/label colours, matching the prototype's four tones. */
	const TONE: Record<AttendanceStatus, { dot: string; text: string; bar: string }> = {
		going: { dot: 'bg-green-500', text: 'text-green-700', bar: 'bg-green-500' },
		maybe: { dot: 'bg-amber-500', text: 'text-amber-700', bar: 'bg-amber-500' },
		declined: { dot: 'bg-red-500', text: 'text-red-700', bar: 'bg-slate-300' },
		invited: { dot: 'bg-slate-300', text: 'text-slate-600', bar: 'bg-slate-300' },
		pending: { dot: 'bg-slate-300', text: 'text-slate-600', bar: 'bg-slate-300' }
	};
</script>

<script lang="ts">
	interface Props {
		going: AttendeeRow[];
		maybe: AttendeeRow[];
		notGoing: AttendeeRow[];
		undecided: AttendeeRow[];
		guests: GuestRow[];
		/** Add a named guest to the event. Absent renders the row without a form. */
		onInvite?: (name: string) => void | Promise<void>;
	}

	let { going, maybe, notGoing, undecided, guests, onInvite }: Props = $props();

	/**
	 * `declined` and `not_going` are both the column's spelling of a decline.
	 * `fallback` is the bucket the row arrived in: the app splits rows before
	 * rendering, so the bucket is authoritative even when a caller hands over a
	 * row whose own `status` was not carried across.
	 */
	function statusOf(
		raw: string | null | undefined,
		fallback: AttendanceStatus
	): AttendanceStatus {
		switch (raw) {
			case 'going':
				return 'going';
			case 'maybe':
				return 'maybe';
			case 'declined':
			case 'not_going':
				return 'declined';
			// `undecided` is the column's word for "asked, has not answered", which
			// is exactly what the prototype labels "Not yet answered". `pending` is
			// reserved for a status this vocabulary has never heard of.
			case 'undecided':
			case 'invited':
				return 'invited';
			default:
				return fallback;
		}
	}

	function initials(first?: string | null, last?: string | null): string {
		return `${first?.charAt(0) || ''}${last?.charAt(0) || ''}`.toUpperCase();
	}

	/** One line of the attendance list: the row, its label, and its fallback. */
	interface Person {
		row: AttendeeRow;
		name: string;
		bucket: AttendanceStatus;
	}

	/** A bucket's rows, each already labelled. */
	function fromBucket(rows: AttendeeRow[], bucket: AttendanceStatus): Person[] {
		return rows.map((row) => ({ row, name: displayName(row), bucket }));
	}

	/**
	 * Every person in one list, in the order the prototype draws them. Each row
	 * carries the bucket it came from so its status survives a caller that does
	 * not pass the column's own spelling through.
	 */
	const people = $derived<Person[]>([
		...fromBucket(going, 'going'),
		...fromBucket(maybe, 'maybe'),
		...fromBucket(notGoing, 'declined'),
		...fromBucket(undecided, 'pending'),
		...guests.map(
			(guest): Person => ({
				row: { ...guest, firstName: null, lastName: null },
				name: guest.name,
				bucket: 'pending'
			})
		)
	]);

	function displayName(row: AttendeeRow): string {
		const first = row.firstName ?? '';
		const last = row.lastName ?? '';
		const joined = `${first} ${last}`.trim();
		return joined || (row.userId ?? 'Unknown');
	}

	const asked = $derived(people.length);
	const goingCount = $derived(going.length);
	const maybeCount = $derived(maybe.length);
	/** Everyone who is neither going nor maybe — the bar's third, honest slice. */
	const pendingCount = $derived(Math.max(0, asked - goingCount - maybeCount));

	/** One segment of the proportion bar. */
	interface BarSegment {
		key: 'going' | 'maybe' | 'pending';
		count: number;
		width: number;
	}

	/**
	 * The bar's three slices as a percentage of those asked. It never divides by
	 * zero: with nobody asked there is no bar at all.
	 */
	const segments = $derived<BarSegment[]>(
		asked === 0
			? []
			: (
					[
						{ key: 'going', count: goingCount },
						{ key: 'maybe', count: maybeCount },
						{ key: 'pending', count: pendingCount }
					] satisfies { key: BarSegment['key']; count: number }[]
				).map((segment) => ({
					...segment,
					width: Math.round((segment.count / asked) * 100)
				}))
	);

	let inviting = $state(false);
	let inviteName = $state('');

	async function submitInvite() {
		const name = inviteName.trim();
		// An empty name invites nobody; the button is disabled, this is the guard.
		if (!name || !onInvite) return;
		await onInvite(name);
		inviteName = '';
		inviting = false;
	}
</script>

<div class="border-t border-slate-100 px-4 py-4 sm:px-6">
	<div class="mb-3 flex items-baseline justify-between gap-2">
		<h3 class="text-sm font-semibold text-slate-700">Who is going</h3>
		{#if asked > 0}
			<span class="text-xs text-slate-400" data-testid="attendance-heading">
				{goingCount}/{asked} going
			</span>
		{/if}
	</div>

	{#if segments.length > 0}
		<div
			class="mb-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100"
			data-testid="attendance-bar"
			role="img"
			aria-label="{goingCount} going, {maybeCount} maybe, {pendingCount} not yet answered, out of {asked}"
		>
			{#each segments as segment (segment.key)}
				<div
					data-segment={segment.key}
					style="width: {segment.width}%"
					class="h-full {TONE[segment.key].bar}"
				></div>
			{/each}
		</div>
	{/if}

	<ul>
		{#each people as person, index (person.name + index)}
			{@const status = statusOf(person.row.status, person.bucket)}
			<li
				data-testid="attendance-row"
				data-name={person.name}
				class="flex items-center gap-2 border-t border-slate-100 py-2 first:border-t-0"
			>
				<span
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold {person.row
						.userId
						? 'bg-slate-200 text-slate-700'
						: 'bg-slate-100 text-slate-500'}"
					aria-hidden="true"
				>
					{person.row.userId
						? initials(person.row.firstName, person.row.lastName)
						: (person.name.charAt(0) || '?')}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-sm font-semibold text-slate-800">{person.name}</span>
					{#if !person.row.userId}
						<span class="block text-xs text-slate-400">guest — not a user</span>
					{/if}
				</span>
				{#if person.row.inviteType === 'required'}
					<span
						class="rounded bg-amber-200 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-amber-800"
					>
						Required
					</span>
				{/if}
				<span class="h-2 w-2 shrink-0 rounded-full {TONE[status].dot}" aria-hidden="true"></span>
				<span class="w-24 shrink-0 text-right text-xs {TONE[status].text}">
					{STATUS_LABEL[status]}
				</span>
			</li>
		{/each}
	</ul>

	{#if inviting}
		<form
			class="mt-3 flex items-center gap-2"
			onsubmit={(event) => {
				event.preventDefault();
				void submitInvite();
			}}
		>
			<input
				type="text"
				bind:value={inviteName}
				aria-label="Guest name"
				placeholder="Guest name"
				class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
			/>
			<button
				type="submit"
				disabled={inviteName.trim().length === 0}
				class="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
			>
				Send invite
			</button>
			<button
				type="button"
				onclick={() => (inviting = false)}
				class="rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700"
			>
				Cancel
			</button>
		</form>
	{:else}
		<button
			type="button"
			onclick={() => (inviting = true)}
			class="mt-3 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
		>
			+ Invite
		</button>
	{/if}
</div>