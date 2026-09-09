<script lang="ts">
	interface Attendee {
		userId: string | null;
		status: string;
		firstName?: string | null;
		lastName?: string | null;
		inviteType?: string | null;
		name?: string | null;
	}

	interface Props {
		serverId: string;
		currentUserRsvpStatus: string;
		attendees: Attendee[];
		nonUserAttendants: string[];
		onResponded: (status: string) => void | Promise<void>;
	}

	let {
		serverId,
		currentUserRsvpStatus = $bindable(),
		attendees = $bindable(),
		nonUserAttendants = $bindable(),
		onResponded
	}: Props = $props();

	let rsvpPending = $state(false);

	let counts = $derived({
		going: attendees.filter((a) => a.status === 'going').length,
		maybe: attendees.filter((a) => a.status === 'maybe').length,
		declined: attendees.filter((a) => a.status === 'declined' || a.status === 'not_going').length
	});

	const RSVP_OPTIONS = [
		{ status: 'going', label: 'Going' },
		{ status: 'maybe', label: 'Maybe' },
		{ status: 'declined', label: "Can't go" }
	] as const;

	async function handleRsvp(status: string) {
		if (rsvpPending) return;
		// Clicking the active choice again = "no answer yet".
		const next = currentUserRsvpStatus === status ? 'undecided' : status;
		const previous = currentUserRsvpStatus;
		currentUserRsvpStatus = next; // optimistic
		rsvpPending = true;
		try {
			const response = await fetch(`/api/events/${serverId}/rsvp`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: next })
			});
			if (response.ok) {
				const data: {
					attendance?: Attendee[];
					rsvpStatus?: string;
				} = await response.json();
				if (data.attendance) {
					attendees = data.attendance.filter((a) => a.userId);
					nonUserAttendants = data.attendance
						.filter((a) => !a.userId && a.name)
						.map((a) => a.name ?? '');
				}
				currentUserRsvpStatus = data.rsvpStatus || next;
				await onResponded(next);
			} else {
				currentUserRsvpStatus = previous;
			}
		} catch (error) {
			console.error('RSVP error:', error);
			currentUserRsvpStatus = previous;
		} finally {
			rsvpPending = false;
		}
	}
</script>

<div class="border-t border-slate-100 px-4 py-4 sm:px-6">
	<div class="mb-2 flex items-center justify-between">
		<h3 class="text-sm font-semibold text-slate-700">Your RSVP</h3>
		{#if currentUserRsvpStatus !== 'undecided'}
			<span class="text-[11px] text-slate-400">tap again to clear</span>
		{/if}
	</div>
	<div
		role="group"
		aria-label="Your RSVP"
		class="flex overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-1"
	>
		{#each RSVP_OPTIONS as option (option.status)}
			{@const active = currentUserRsvpStatus === option.status}
			<button
				type="button"
				onclick={() => handleRsvp(option.status)}
				disabled={rsvpPending}
				aria-pressed={active}
				class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-3 text-sm font-medium transition-all disabled:opacity-60 {option.status ===
				'going'
					? active
						? 'bg-green-600 text-white shadow-md shadow-green-600/30'
						: 'text-green-700 hover:bg-green-100/70'
					: option.status === 'maybe'
						? active
							? 'bg-yellow-500 text-white shadow-md shadow-yellow-500/30'
							: 'text-yellow-700 hover:bg-yellow-100/70'
						: active
							? 'bg-red-600 text-white shadow-md shadow-red-600/30'
							: 'text-red-700 hover:bg-red-100/70'}"
			>
				{#if option.status === 'going'}
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
				{:else if option.status === 'maybe'}
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				{:else}
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				{/if}
				{option.label}
				{#if counts[option.status] > 0}
					<span
						class="rounded-full px-1.5 py-0.5 text-[10px] font-bold {active
							? 'bg-white/25'
							: 'bg-slate-200 text-slate-600'}"
					>
						{counts[option.status]}
					</span>
				{/if}
			</button>
		{/each}
	</div>
</div>
