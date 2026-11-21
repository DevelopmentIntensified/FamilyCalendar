<!--
	"Who is going": the count and proportion in the heading, a stacked going /
	maybe / pending bar, one row per person carrying their own status, and the
	named-guest invite (issue 126). Above eight people the list collapses so the
	proportion leads (issue 106).

	The rows come from `calendarAttendancePeople`, so "who" and "how many" read
	the same buckets as the RSVP buttons.

	Doc: ../../README.md#public-interface
-->
<script lang="ts">
	import {
		CALENDAR_ATTENDANCE_LABEL,
		calendarAttendanceStatus
	} from '../calendar.eventView.rules';
	import type { CalendarEventModalState } from '../calendar.eventModal.state.svelte';

	interface Props {
		state: CalendarEventModalState;
	}

	let { state }: Props = $props();

	const people = $derived(state.people);
	const asked = $derived(people.length);
	const goingCount = $derived(state.split.going.length);
	const maybeCount = $derived(state.split.maybe.length);
	const pendingCount = $derived(Math.max(0, asked - goingCount - maybeCount));
	const declinedCount = $derived(state.split.notGoing.length);
	const awaitingCount = $derived(Math.max(0, pendingCount - declinedCount));

	const TONE: Record<string, { dot: string; text: string; bar: string }> = {
		going: { dot: 'bg-green-500', text: 'text-green-700', bar: 'bg-green-500' },
		maybe: { dot: 'bg-amber-500', text: 'text-amber-700', bar: 'bg-amber-500' },
		declined: { dot: 'bg-red-500', text: 'text-red-700', bar: 'bg-slate-300' },
		invited: { dot: 'bg-slate-300', text: 'text-slate-600', bar: 'bg-slate-300' },
		pending: { dot: 'bg-slate-300', text: 'text-slate-600', bar: 'bg-slate-300' }
	};

	const segments = $derived(
		asked === 0
			? []
			: [
					{ key: 'going', count: goingCount, width: Math.round((goingCount / asked) * 100) },
					{ key: 'maybe', count: maybeCount, width: Math.round((maybeCount / asked) * 100) },
					{ key: 'pending', count: pendingCount, width: Math.round((pendingCount / asked) * 100) }
				]
	);

	const COLLAPSE_AFTER = 8;
	let expanded = $state(false);
	let inviting = $state(false);
	let inviteName = $state('');
	const collapsed = $derived(people.length > COLLAPSE_AFTER);

	function initials(first?: string | null, last?: string | null): string {
		return `${first?.charAt(0) || ''}${last?.charAt(0) || ''}`.toUpperCase();
	}

	async function submitInvite() {
		const name = inviteName.trim();
		if (!name) return;
		if (await state.inviteGuest(name)) {
			inviteName = '';
			inviting = false;
		}
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
			aria-label="{goingCount} going, {maybeCount} maybe, {declinedCount} can't go, {awaitingCount} awaiting an answer, out of {asked}"
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

	{#if collapsed && !expanded}
		<button
			type="button"
			data-testid="attendance-toggle"
			aria-expanded="false"
			onclick={() => (expanded = true)}
			class="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
		>
			Show all {asked} people
		</button>
	{:else}
		<ul>
			{#each people as person, index (person.name + index)}
				{@const status = calendarAttendanceStatus(person.row.status, person.bucket)}
				<li
					data-testid="attendance-row"
					data-name={person.name}
					class="flex items-center gap-2 border-t border-slate-100 py-2 first:border-t-0"
				>
					<span
						class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold {person
							.row.userId
							? 'bg-slate-200 text-slate-700'
							: 'bg-slate-100 text-slate-500'}"
						aria-hidden="true"
					>
						{person.row.userId
							? initials(person.row.firstName, person.row.lastName)
							: person.name.charAt(0) || '?'}
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
						{CALENDAR_ATTENDANCE_LABEL[status]}
					</span>
				</li>
			{/each}
		</ul>
		{#if collapsed}
			<button
				type="button"
				data-testid="attendance-toggle"
				aria-expanded="true"
				onclick={() => (expanded = false)}
				class="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
			>
				Show fewer
			</button>
		{/if}
	{/if}

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
				disabled={inviteName.trim().length === 0 || state.invitingGuest}
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
