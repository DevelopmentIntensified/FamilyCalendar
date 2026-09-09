<script lang="ts">
	import { DateTime } from 'luxon';
	import type { Event } from '$lib/types';
	import { buildGoogleCalendarUrl } from '$lib/utils/ics';
	import { toDate } from '$lib/utils/eventTime';

	interface Props {
		event: Event;
		calendarName: string | null;
	}

	let { event, calendarName }: Props = $props();

	function tryFormat(d: Date | string | undefined | null): string | undefined {
		if (!d) return undefined;
		const dt = DateTime.fromJSDate(toDate(d));
		return dt.isValid ? dt.toFormat('HH:mm') : undefined;
	}

	function formatTime(time: string | undefined): string {
		if (!time) return '';
		const [h, m] = time.split(':').map(Number);
		const ampm = h >= 12 ? 'PM' : 'AM';
		const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
		return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
	}

	function reminderLabel(minutes: number | null | undefined): string | null {
		if (minutes == null || minutes <= 0) return null;
		if (minutes % 1440 === 0) {
			const d = minutes / 1440;
			return d === 1 ? '1 day before' : `${d} days before`;
		}
		if (minutes % 60 === 0) {
			const h = minutes / 60;
			return h === 1 ? '1 hour before' : `${h} hours before`;
		}
		return minutes === 1 ? '1 minute before' : `${minutes} minutes before`;
	}

	let startTime = $derived(event.startTime || tryFormat(event.start));
	let endTime = $derived(event.endTime || tryFormat(event.end));
	let eventDate = $derived(event.date || (event.start ? toDate(event.start) : undefined));
	let reminderText = $derived(reminderLabel(event.reminderMinutes));
	let icsUrl = $derived(`/api/events/${encodeURIComponent(event.id)}/ics`);
	let googleCalendarUrl = $derived(
		buildGoogleCalendarUrl({
			id: event.masterId || event.id,
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
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
		})
	);
</script>

<div class="space-y-4 p-4 sm:p-6">
	<!-- Content -->
	<div class="space-y-4">
		<!-- Date & Time -->
		{#if eventDate}
			{@const parsedDate =
				eventDate instanceof Date
					? DateTime.fromJSDate(eventDate)
					: DateTime.fromISO(String(eventDate))}
			<div class="flex items-start gap-3 text-slate-700">
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
					<svg class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
						/>
					</svg>
				</div>
				<div class="min-w-0 flex-1">
					<div class="font-medium">{parsedDate.toFormat('EEEE, MMMM d, yyyy')}</div>
					{#if event.allDay}
						<span
							class="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
							>All day</span
						>
					{:else if startTime}
						<div class="mt-1 text-sm text-slate-600">
							{formatTime(startTime)}
							{#if endTime}
								<span class="text-slate-400"> - {formatTime(endTime)}</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Calendar -->
		{#if calendarName}
			<div class="flex items-center gap-3 text-slate-700">
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
					<svg class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"
						/>
					</svg>
				</div>
				<span class="text-sm font-medium text-slate-600">{calendarName}</span>
			</div>
		{/if}

		<!-- Creator (family events only) -->
		{#if event.creatorName}
			<div class="flex items-center gap-3 text-slate-700">
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
					<svg class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
						/>
					</svg>
				</div>
				<span class="text-sm font-medium text-slate-600">Created by {event.creatorName}</span>
			</div>
		{/if}

		<!-- Location -->
		{#if event.location}
			<div class="flex items-start gap-3 text-slate-700">
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
					<svg class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
				</div>
				<span class="break-words text-sm">{event.location}</span>
			</div>
		{/if}

		<!-- Reminder -->
		{#if reminderText}
			<div class="flex items-start gap-3 text-slate-700">
				<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100">
					<svg class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 17h5l-1.375-1.375A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
						/>
					</svg>
				</div>
				<span class="break-words text-sm">Reminder: {reminderText}</span>
			</div>
		{/if}

		<!-- Description -->
		{#if event.description}
			<div class="rounded-xl bg-slate-50 p-4">
				<p class="whitespace-pre-wrap text-sm text-slate-600">{event.description}</p>
			</div>
		{/if}

		<!-- Add to calendar (issue 028) -->
		{#if !event.isAd}
			<div class="flex flex-wrap gap-2">
				<a
					href={googleCalendarUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
				>
					<svg class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
						/>
					</svg>
					Add to Google
				</a>
				<a
					href={icsUrl}
					download
					class="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
				>
					<svg class="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
						/>
					</svg>
					Add to .ics
				</a>
			</div>
		{/if}
	</div>
</div>
