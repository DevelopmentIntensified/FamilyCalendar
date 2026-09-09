<script lang="ts" module>
	export interface AttendeeRow {
		firstName?: string | null;
		lastName?: string | null;
		userId?: string | null;
		inviteType?: string | null;
	}

	interface Tone {
		dot: string;
		label: string;
		pill: string;
		avatar: string;
		text: string;
	}

	const TONES: Record<'going' | 'maybe' | 'notGoing', Tone> = {
		going: {
			dot: 'bg-green-500',
			label: 'text-green-700',
			pill: 'bg-green-50',
			avatar: 'bg-green-200 text-green-800',
			text: 'text-green-700'
		},
		maybe: {
			dot: 'bg-yellow-500',
			label: 'text-yellow-700',
			pill: 'bg-yellow-50',
			avatar: 'bg-yellow-200 text-yellow-800',
			text: 'text-yellow-700'
		},
		notGoing: {
			dot: 'bg-red-500',
			label: 'text-red-700',
			pill: 'bg-red-50',
			avatar: 'bg-red-200 text-red-800',
			text: 'text-red-700'
		}
	};

	const TITLES = { going: 'Going', maybe: 'Maybe', notGoing: 'Not Going' } as const;
</script>

<script lang="ts">
	interface Props {
		going: AttendeeRow[];
		maybe: AttendeeRow[];
		notGoing: AttendeeRow[];
		undecided: AttendeeRow[];
		guests: string[];
	}

	let { going, maybe, notGoing, undecided, guests }: Props = $props();

	function getInitials(firstName: string, lastName: string): string {
		return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
	}

	const groups = $derived(
		(['going', 'maybe', 'notGoing'] as const).map((key) => ({
			key,
			title: TITLES[key],
			tone: TONES[key],
			rows: { going, maybe, notGoing }[key]
		}))
	);
</script>

<div class="border-t border-slate-100 px-4 py-4 sm:px-6">
	<h3 class="mb-4 text-sm font-semibold text-slate-700">Attendees</h3>

	{#each groups as group (group.key)}
		{#if group.rows.length > 0}
			<div class="mb-3">
				<div class="mb-1.5 flex items-center gap-2">
					<div class="h-2 w-2 rounded-full {group.tone.dot}"></div>
					<span class="text-xs font-medium {group.tone.label}"
						>{group.title} ({group.rows.length})</span
					>
				</div>
				<div class="flex flex-wrap gap-1.5">
					{#each group.rows as rsvp}
						<div
							class="inline-flex items-center gap-1.5 rounded-full {group.tone.pill} px-2.5 py-1"
						>
							<div
								class="flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium {group
									.tone.avatar}"
							>
								{getInitials(rsvp.firstName || '', rsvp.lastName || '')}
							</div>
							<span class="text-xs {group.tone.text}">{rsvp.firstName || rsvp.userId}</span>
							{#if rsvp.inviteType === 'required'}
								<span
									class="rounded bg-amber-200 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-amber-800"
									>Req</span
								>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/each}

	<!-- Awaiting response (invited, hasn't answered) -->
	{#if undecided.length > 0}
		<div class="mb-3">
			<div class="mb-1.5 flex items-center gap-2">
				<div class="h-2 w-2 rounded-full bg-slate-400"></div>
				<span class="text-xs font-medium text-slate-600"
					>Awaiting response ({undecided.length})</span
				>
			</div>
			<div class="flex flex-wrap gap-1.5">
				{#each undecided as rsvp}
					{@const isRequired = rsvp.inviteType === 'required'}
					<div
						class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 {isRequired
							? 'bg-amber-50 ring-1 ring-inset ring-amber-300'
							: 'bg-slate-100'}"
					>
						<div
							class="flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium {isRequired
								? 'bg-amber-200 text-amber-800'
								: 'bg-slate-200 text-slate-700'}"
						>
							{getInitials(rsvp.firstName || '', rsvp.lastName || '')}
						</div>
						<span class="text-xs {isRequired ? 'text-amber-800' : 'text-slate-700'}">
							{rsvp.firstName || rsvp.userId}
							{#if isRequired}
								<span
									class="ml-1 rounded bg-amber-200 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-amber-800"
									>Required</span
								>
							{/if}
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Non-user Attendants -->
	{#if guests.length > 0}
		<div>
			<div class="mb-1.5 flex items-center gap-2">
				<div class="h-2 w-2 rounded-full bg-slate-400"></div>
				<span class="text-xs font-medium text-slate-600">Guests ({guests.length})</span>
			</div>
			<div class="flex flex-wrap gap-1.5">
				{#each guests as att}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
					>
						<svg
							class="h-3 w-3 text-slate-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
							/>
						</svg>
						{att}
					</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
