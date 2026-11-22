<!--
	The event detail page: `/calendar/event/[id]`. Ported from the legacy page's
	markup; the facts and the attendee list paint from the page payload alone. The
	RSVP paint/rollback/clear rules and the single-flight DELETE come from
	`CalendarEventModalState`, so the page and the event sheet share one writer;
	the page imports that class lazily (on hover/focus of an RSVP button or on
	delete), so the first paint ships no writer (ADR 0010).

	The export menu is the two legacy links: the `.ics` download at
	`/api/events/{id}/ics` and the Google render URL carrying the RRULE and the
	viewer `ctz` (issue 028).

	Doc: ../../README.md#invariants
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { DateTime } from 'luxon';
	import { createApiClient } from '$lib/kernel/client/apiClient';
	import { createToasts } from '$lib/kernel/client/toasts.svelte';
	import Toaster from '$lib/kernel/ui/Toaster.svelte';
	import { calendarAttendanceSplit, calendarEventDay } from '../calendar.eventView.rules';
	import type { CalendarEventModalState } from '../calendar.eventModal.state.svelte';
	import { buildGoogleCalendarUrl } from '../calendar.ics.rules';
	import type { CalendarEventDetailPageData } from '../calendar.pages.http.server';

	interface Props {
		readonly data: CalendarEventDetailPageData;
		/** The route's `goto`; the detail page leaves for `/calendar` after a delete. */
		readonly onnavigate: (path: string) => void;
	}

	let { data, onnavigate }: Props = $props();

	const toasts = createToasts();
	// The page payload is one read: the state class is built from it once and
	// then owns every answer (a reload builds a fresh page).
	const initial = untrack(() => ({
		event: data.event,
		attendance: data.attendance,
		userRsvpStatus: data.userRsvpStatus
	}));
	const event = initial.event;
	// The RSVP/delete writer (`CalendarEventModalState`) is a lazy chunk: the page
	// paints from the payload alone and builds the class on the first act (ADR 0010).
	let modal = $state.raw<CalendarEventModalState | null>(null);
	let pending: Promise<CalendarEventModalState> | null = null;
	const attendees = $derived(modal ? modal.attendees : [...(initial.attendance ?? [])]);
	const guests = $derived(modal ? modal.guests : []);
	const rsvpStatus = $derived(modal ? modal.userRsvpStatus : (initial.userRsvpStatus ?? 'undecided'));
	const split = $derived(calendarAttendanceSplit(attendees));

	const zone = $derived(data.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone);
	const day = $derived(calendarEventDay(event));
	const icsUrl = $derived(`/api/events/${encodeURIComponent(event.id)}/ics`);
	const googleCalendarUrl = $derived(
		buildGoogleCalendarUrl({
			id: event.id,
			title: event.title,
			start: event.start,
			end: event.end,
			allDay: !!event.allDay,
			description: event.description,
			location: event.location,
			recurrence: event.recurrenceFrequency
				? {
						recurrenceFrequency: event.recurrenceFrequency,
						recurrenceInterval: event.recurrenceInterval ?? null,
						recurrenceByDay: event.recurrenceByDay ?? null,
						recurrenceCount: event.recurrenceCount ?? null,
						recurrenceUntil: event.recurrenceUntil ?? null
					}
				: null,
			timeZone: zone
		})
	);

	const RSVP_OPTIONS = [
		{ status: 'going', label: 'Going' },
		{ status: 'maybe', label: 'Maybe' },
		{ status: 'declined', label: "Can't go" }
	] as const;

	let showDeleteConfirm = $state(false);

	const dayLabel = $derived(
		day ? DateTime.fromJSDate(day).setZone(zone).toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY) : ''
	);
	const startLabel = $derived(
		DateTime.fromJSDate(event.start).setZone(zone).toLocaleString(DateTime.TIME_SIMPLE)
	);
	const endLabel = $derived(
		DateTime.fromJSDate(event.end).setZone(zone).toLocaleString(DateTime.TIME_SIMPLE)
	);
	const createdLabel = $derived(
		DateTime.fromJSDate(event.created_at).toLocaleString(DateTime.DATE_MED)
	);

	function statusWord(status: string | null): string {
		if (status === 'declined') return 'not going';
		return status || 'undecided';
	}

	function pillClass(status: string | null): string {
		if (status === 'going') return 'bg-green-100 text-green-800';
		if (status === 'maybe') return 'bg-yellow-100 text-yellow-800';
		if (status === 'not_going' || status === 'declined') return 'bg-red-100 text-red-800';
		return 'bg-gray-100 text-gray-800';
	}

	/** The state class is built the first time the viewer acts (or is about to). */
	async function loadModal(): Promise<CalendarEventModalState> {
		if (modal) return modal;
		pending ??= Promise.all([
			import('../calendar.eventModal.state.svelte'),
			import('../calendar.api')
		]).then(([{ CalendarEventModalState }, { createCalendarApi }]) => {
			modal ??= new CalendarEventModalState(createCalendarApi(createApiClient()), toasts, null, {
				event,
				attendees: initial.attendance,
				userRsvpStatus: initial.userRsvpStatus
			});
			return modal;
		});
		return pending;
	}

	/** Start the chunk on the first hover or focus so the click finds it resolved. */
	function warm(): void {
		void loadModal();
	}

	async function rsvp(status: (typeof RSVP_OPTIONS)[number]['status']): Promise<void> {
		await (await loadModal()).rsvp(status);
	}

	async function remove(): Promise<void> {
		const ok = await (await loadModal()).remove('all');
		if (ok) onnavigate('/calendar');
	}
</script>

<div class="container mx-auto min-h-screen bg-gray-100 p-4 pt-20">
	<div class="mx-auto max-w-3xl">
		<button
			type="button"
			onclick={() => onnavigate('/calendar')}
			class="mb-4 flex items-center text-primary-600 hover:text-primary-700"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-1 h-5 w-5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg
			>
			Back to Calendar
		</button>

		{#if modal?.actionError}
			<div
				role="alert"
				class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
			>
				{modal?.actionError}
			</div>
		{/if}

		<div class="overflow-hidden rounded-lg bg-white shadow-xl">
			<div class="bg-primary-600 px-4 py-6 sm:px-6">
				<h1 class="text-center text-3xl font-extrabold text-white">{event.title}</h1>
			</div>

			<div class="p-6 sm:p-8">
				<div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
					<div class="space-y-3">
						<!-- Date -->
						<div class="flex items-center">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mr-2 h-5 w-5 text-gray-500"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
								<line x1="16" y1="2" x2="16" y2="6"></line>
								<line x1="8" y1="2" x2="8" y2="6"></line>
								<line x1="3" y1="10" x2="21" y2="10"></line>
							</svg>
							<span class="text-gray-700">{dayLabel}</span>
						</div>

						<!-- Start & End Time -->
						<div class="flex items-center">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mr-2 h-5 w-5 text-gray-500"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<circle cx="12" cy="12" r="10"></circle>
								<polyline points="12 6 12 12 16 14"></polyline>
							</svg>
							<span class="text-gray-700">{startLabel} - {endLabel}</span>
						</div>

						<!-- Location -->
						{#if event.location}
							<div class="flex items-center">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="mr-2 h-5 w-5 text-gray-500"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
									<circle cx="12" cy="10" r="3"></circle>
								</svg>
								<span class="text-gray-700">{event.location}</span>
							</div>
						{/if}

						<!-- Calendar -->
						{#if data.calendar}
							<div class="flex items-center">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="mr-2 h-5 w-5 text-gray-500"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
								>
									<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
									<polyline points="9 22 9 12 15 12 15 22"></polyline>
								</svg>
								<span class="text-gray-700"
									>{data.isFamilyEvent ? 'Family Calendar' : 'My Calendar'}</span
								>
							</div>
						{/if}

						<!-- Created Date -->
						<div class="flex items-center">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mr-2 h-5 w-5 text-gray-500"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<circle cx="12" cy="12" r="10"></circle>
								<line x1="12" y1="8" x2="12" y2="16"></line>
								<line x1="8" y1="12" x2="16" y2="12"></line>
							</svg>
							<span class="text-gray-700">Created {createdLabel}</span>
						</div>
					</div>

					<!-- Attendees -->
					{#if attendees.length > 0 || guests.length > 0}
						<div>
							<h3 class="mb-2 text-lg font-semibold text-gray-800">
								Attendees ({attendees.length + guests.length})
							</h3>
							<div class="space-y-2">
								{#each attendees as attendee (attendee.userId)}
									<div class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
										<span class="text-sm text-gray-700"
											>{[attendee.firstName, attendee.lastName]
												.filter(Boolean)
												.join(' ')
												.trim() || attendee.name || attendee.userId || 'Guest'}</span
										>
										<span
											class="rounded-full px-2 py-1 text-xs font-medium {pillClass(attendee.status)}"
											>{statusWord(attendee.status)}</span
										>
									</div>
								{/each}
								{#each guests as guest (guest.name)}
									<div class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
										<span class="text-sm text-gray-700">{guest.name}</span>
										<span
											class="rounded-full px-2 py-1 text-xs font-medium {pillClass(guest.status)}"
											>{statusWord(guest.status)}</span
										>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<!-- Description -->
				{#if event.description}
					<div class="mb-6">
						<h2 class="mb-2 text-lg font-semibold text-gray-800">Description</h2>
						<p class="text-gray-700">{event.description}</p>
					</div>
				{/if}

				<!-- RSVP Section -->
				{#if data.isFamilyEvent}
					<div class="mb-6 border-t pt-6">
						<div class="mb-3 flex items-center justify-between">
							<h3 class="text-lg font-semibold text-gray-800">Your RSVP</h3>
							{#if rsvpStatus !== 'undecided'}
								<span class="text-xs text-gray-400">tap again to clear</span>
							{/if}
						</div>
						<div
							role="group"
							aria-label="Your RSVP"
							class="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-1"
						>
							{#each RSVP_OPTIONS as option (option.status)}
								{@const active = rsvpStatus === option.status}
								{@const count =
									option.status === 'going'
										? split.going.length
										: option.status === 'maybe'
											? split.maybe.length
											: split.notGoing.length}
								<button
									type="button"
									onclick={() => void rsvp(option.status)}
									onpointerenter={warm}
									onfocus={warm}
									disabled={modal?.rsvpPending}
									aria-pressed={active}
									class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-medium transition-all disabled:opacity-60 {option.status ===
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
									{option.label}
									{#if count > 0}
										<span
											class="rounded-full px-1.5 py-0.5 text-[10px] font-bold {active
												? 'bg-white/25'
												: 'bg-gray-200 text-gray-600'}"
										>
											{count}
										</span>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex flex-wrap gap-3 border-t pt-6">
					<a
						href={googleCalendarUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="flex min-h-11 items-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-2 h-4 w-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
							<line x1="16" y1="2" x2="16" y2="6"></line>
							<line x1="8" y1="2" x2="8" y2="6"></line>
							<line x1="3" y1="10" x2="21" y2="10"></line>
						</svg>
						Add to Google
					</a>
					<a
						href={icsUrl}
						download
						class="flex min-h-11 items-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-2 h-4 w-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
						</svg>
						Add to .ics
					</a>

					<a
						href="/calendar?edit={event.id}"
						class="flex items-center rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-2 h-4 w-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
							<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
						</svg>
						Edit Event
					</a>

					{#if !showDeleteConfirm}
						<button
							type="button"
							onclick={() => (showDeleteConfirm = true)}
							class="flex items-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="mr-2 h-4 w-4"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<polyline points="3 6 5 6 21 6"></polyline>
								<path
									d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
								></path>
							</svg>
							Delete Event
						</button>
					{:else}
						<div class="flex items-center gap-2">
							<span class="text-sm text-red-600">Delete this event?</span>
							<button
								type="button"
								onclick={() => void remove()}
								disabled={modal?.deleting}
								class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
							>
								{modal?.deleting ? 'Deleting…' : 'Confirm Delete'}
							</button>
							<button
								type="button"
								onclick={() => (showDeleteConfirm = false)}
								class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							>
								Cancel
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

<Toaster items={toasts.items} ondismiss={toasts.dismiss} />
