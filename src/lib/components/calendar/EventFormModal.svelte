<script lang="ts">
	import type { Event } from '$lib/types';
	import LocationSearch from '$lib/components/LocationSearch.svelte';
	import AttendantSelector from '$lib/components/calendar/AttendantSelector.svelte';
	import CalendarSelector from '$lib/components/calendar/CalendarSelector.svelte';
	import { DateTime } from 'luxon';

	let { 
		show = false, 
		event = null as Event | null, 
		calendarIds = [] as { id: string; name: string }[],
		familyMembers = [] as { userId: string; firstName: string; lastName: string; email: string }[],
		rsvpData = [] as { userId: string; status: string; firstName?: string; lastName?: string }[],
		onclose = undefined as (() => void) | undefined,
		onsubmit = undefined as ((data: any) => void) | undefined,
		onupdate = undefined as ((data: any) => void) | undefined,
		ondelete = undefined as ((data: any) => void) | undefined
	} = $props();

	let nlInput = $state('');
	let title = $state('');
	let date = $state('');
	let startTime = $state('');
	let endTime = $state('');
	let allDay = $state(true); // DEFAULT CHECKED
	let multiDay = $state(false);
	let endDate = $state('');
	let location = $state('');
	let description = $state('');
	let selectedCalendarId = $state('');
	let attendants = $state([] as string[]); // Allow binding
	let showMore = $state(false);
	let parsing = $state(false);
	let parseTimeout: ReturnType<typeof setTimeout>;

	let isEditMode = $derived(event !== null);
	let showNlInput = $derived(!isEditMode);

	// Populate form when editing
	$effect(() => {
		if (event) {
			title = event.title || '';
			allDay = true; // Default to all-day
			if (event.start) {
				const dt = DateTime.fromISO(event.start);
				date = dt.toFormat("yyyy-MM-dd");
				startTime = dt.toFormat("HH:mm");
				if (startTime !== '00:00') allDay = false; // Uncheck if time detected
			}
			if (event.end) {
				const dt = DateTime.fromISO(event.end);
				endTime = dt.toFormat("HH:mm");
				if (dt.toFormat("yyyy-MM-dd") !== date) {
					multiDay = true;
					endDate = dt.toFormat("yyyy-MM-dd");
				}
			}
			location = event.location || '';
			description = event.description || '';
			selectedCalendarId = event.calendarId || (calendarIds.length > 0 ? calendarIds[0].id : '');
		} else {
			selectedCalendarId = calendarIds.length > 0 ? calendarIds[0].id : '';
		}
	});

	// NLP parsing with debounce
	async function parseNlInput() {
		if (!nlInput.trim()) return;
		parsing = true;
		try {
			const response = await fetch('/api/parse-event', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ input: nlInput })
			});
			if (response.ok) {
				const parsed = await response.json();
				if (parsed.title) title = parsed.title;
				if (parsed.dateTime) {
					const dt = DateTime.fromISO(parsed.dateTime);
					date = dt.toFormat("yyyy-MM-dd");
					startTime = dt.toFormat("HH:mm");
					allDay = false; // Uncheck all-day if time detected
				}
				if (parsed.endDateTime) {
					const dt = DateTime.fromISO(parsed.endDateTime);
					endTime = dt.toFormat("HH:mm");
				}
				if (parsed.location) location = parsed.location;
				description = nlInput;
			}
		} catch (error) {
			console.error('Parse error:', error);
		} finally {
			parsing = false;
		}
	}

	function onNlInputChange() {
		clearTimeout(parseTimeout);
		parseTimeout = setTimeout(() => parseNlInput(), 1000);
	}

	function close() {
		show = false;
		onclose?.();
	}

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();

		let startTimestamp = '';
		if (date && startTime && !allDay) {
			startTimestamp = DateTime.fromFormat(`${date} ${startTime}`, "yyyy-MM-dd HH:mm").toISO();
		} else if (date) {
			startTimestamp = DateTime.fromFormat(date, "yyyy-MM-dd").toISO();
		}

		let endTimestamp = null;
		if (multiDay && endDate) {
			const endDt = endDate + (endTime && !allDay ? `T${endTime}` : '');
			endTimestamp = DateTime.fromISO(endDt).toISO();
		} else if (!allDay && date && endTime) {
			endTimestamp = DateTime.fromFormat(`${date} ${endTime}`, "yyyy-MM-dd HH:mm").toISO();
		} else if (date) {
			endTimestamp = DateTime.fromFormat(date, "yyyy-MM-dd").toISO();
		}

		const eventData = {
			title,
			start: startTimestamp,
			end: endTimestamp,
			location,
			description,
			calendarId: selectedCalendarId
		};

		if (isEditMode && event) {
			onupdate?.({ id: event.id, ...eventData });
		} else {
			onsubmit?.(eventData);
		}
	}

	function handleDelete() {
		if (event) ondelete?.({ id: event.id });
	}

	function clearDetected() {
		title = '';
		date = '';
		startTime = '';
		endTime = '';
		location = '';
		description = '';
		nlInput = '';
		allDay = true;
	}
</script>

{#if show}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onclick={(e) => { if (e.target === e.currentTarget) close(); }} role="presentation">
		<div class="w-full max-w-lg transform rounded-2xl bg-white shadow-2xl transition-all duration-300" onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-title">
			<!-- Header -->
			<div class="relative overflow-hidden bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-5">
				<div class="flex items-center justify-between">
					<div>
						<h2 id="modal-title" class="text-xl font-bold text-white">
							{isEditMode ? '✏️ Edit Event' : '✨ Create Event'}
						</h2>
						{#if !isEditMode}
							<p class="mt-1 text-sm text-white/70">Quick-add with natural language</p>
						{/if}
					</div>
					<button onclick={() => { show = false; onclose?.(); }} class="rounded-full p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white" aria-label="Close modal">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<form onsubmit={handleSubmit}>
				<div class="max-h-[70vh] overflow-y-auto">
					<div class="space-y-5 p-6">
						<!-- NL Input (Create Mode) -->
						{#if showNlInput}
							<div class="group relative">
								<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
									<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
									</svg>
								</div>
								<input
									type="text"
									bind:value={nlInput}
									oninput={onNlInputChange}
									placeholder="Try: Lunch Friday at noon with John in Conference A"
									class="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
								/>
								{#if parsing}
									<div class="absolute right-12 top-1/2 -translate-y-1/2">
										<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
									</div>
								{/if}
								{#if showNlInput}
									<button
										type="button"
										onclick={clearDetected}
										class="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
									>
										Clear
									</button>
 								{/if}
							</div>
						{/if}

						<!-- Show detected fields even when Show More is collapsed -->
						{#if showNlInput && (title || date || location)}
							<div class="rounded-xl bg-primary-50 p-3 text-xs text-primary-700">
								<p class="font-semibold">Detected:</p>
								{#if title}
									<p>✓ Title: {title}</p>
								{/if}
								{#if date}
									<p>✓ Date: {date}</p>
								{/if}
								{#if startTime && !allDay}
									<p>✓ Time: {startTime}</p>
								{/if}
								{#if location}
									<p>✓ Location: {location}</p>
								{/if}
							</div>
						{/if}

						<!-- Title (always visible) -->
						<div class="group">
							<label for="title" class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Title</label>
							<div class="relative">
								<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
									<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
									</svg>
								</div>
								<input
									id="title"
									type="text"
									bind:value={title}
									placeholder="Event title"
									required
									class="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
								/>
							</div>
						</div>

						<!-- Description (moved to Show More section) -->

						<!-- Show More/Less Button -->
						<button
							type="button"
							onclick={() => showMore = !showMore}
							class="flex w-full items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-100"
						>
							{showMore ? 'Show Less' : 'Show More'}
							<svg
								class="h-4 w-4 transition-transform {showMore ? 'rotate-180' : ''}"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
							</svg>
						</button>

						<!-- More Fields -->
						{#if showMore}
							<!-- All-Day & Multi-Day Row (above dates) -->
							<div class="grid grid-cols-2 gap-4">
								<div class="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
									<div class="flex items-center gap-2">
										<svg class="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.996 3.996 12 10c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3c0 1.657 1.343 3 3 3z" />
										</svg>
										<label for="all-day" class="text-sm font-medium text-slate-700">All-day</label>
									</div>
									<input type="checkbox" id="all-day" bind:checked={allDay} class="h-5 w-5 rounded border-2 border-slate-300 text-primary-600 focus:ring-primary-500" />
								</div>

								<div class="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
									<div class="flex items-center gap-2">
										<svg class="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
										</svg>
										<label for="multi-day" class="text-sm font-medium text-slate-700">Multi-day</label>
									</div>
									<input type="checkbox" id="multi-day" bind:checked={multiDay} class="h-5 w-5 rounded border-2 border-slate-300 text-primary-600 focus:ring-primary-500" />
								</div>
							</div>

							<!-- Date & Time Grid -->
							<div class="grid grid-cols-2 gap-4">
								<!-- Date -->
								<div class="group">
									<label for="date" class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Date</label>
									<div class="relative">
										<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
											<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
											</svg>
										</div>
										<input
											id="date"
											type="date"
											bind:value={date}
											required
											class="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
										/>
									</div>
								</div>

							<!-- Start & End Time Row (hidden when all-day) -->
							{#if !allDay}
							<div class="grid grid-cols-2 gap-4">
								<div class="group">
									<label for="start-time" class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Start</label>
									<div class="relative">
										<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
											<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2m6-2a8 8 0 11-16 0 8 8 0 0116 0z" />
												</svg>
										</div>
										<input
											id="start-time"
											type="time"
											bind:value={startTime}
											class="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
										/>
									</div>
								</div>

								<div class="group">
									<label for="end-time" class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">End</label>
									<div class="relative">
										<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
											<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-1a8 8 0 11-16 0 8 8 0 0116 0z" />
												</svg>
										</div>
										<input
											id="end-time"
											type="time"
											bind:value={endTime}
											class="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
										/>
									</div>
							</div>
								</div>
							{/if}

							<!-- Location -->
						<div class="group">
										<label for="end-date" class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">End Date</label>
										<div class="relative">
											<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
												<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
												</svg>
											</div>
											<input
												id="end-date"
												type="date"
												bind:value={endDate}
												class="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
											/>
										</div>
									</div>

									{#if !allDay}
									<div class="group">
										<label for="end-time" class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">End Time</label>
										<div class="relative">
											<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
												<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-1a8 8 0 11-16 0 8 8 0 0116 0z" />
												</svg>
											</div>
											<input
												id="end-time"
												type="time"
												bind:value={endTime}
												class="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
											/>
										</div>
									</div>
									{/if}
								</div>
							{/if}

							<!-- Location -->
							<div class="group">
								<label for="location" class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Location</label>
								<div class="relative">
									<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
										<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
												<path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
											</svg>
										</div>
									<div class="pl-10">
										<LocationSearch bind:value={location} />
									</div>
								</div>
							</div>

							<!-- Description (inside Show More) -->
							<div class="group">
								<label for="desc" class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Description</label>
								<textarea
									id="desc"
									bind:value={description}
									placeholder="Add details..."
									rows="3"
									class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
								></textarea>
							</div>

							<!-- Attendants -->
							<AttendantSelector
								familyMembers={familyMembers}
								bind:selectedAttendants={attendants}
							/>

							<!-- Calendar Selector -->
							{#if calendarIds.length > 1}
								<label for="calendar" class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Calendar</label>
								<CalendarSelector
									calendarIds={calendarIds.map(c => ({ ...c, type: c.name.includes('Family') ? 'Family' : 'Personal' }))}
									bind:value={selectedCalendarId}
								/>
							{/if}
						{/if}

						<!-- RSVP Info (Edit Mode Only) -->
						{#if isEditMode && rsvpData.length > 0}
							<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
								<h3 class="mb-3 text-sm font-semibold text-slate-700">RSVP Status</h3>
								{#if rsvpData.filter(r => r.status === 'going').length > 0}
									<div class="mb-2">
										<span class="text-xs font-medium text-green-700">Going ({rsvpData.filter(r => r.status === 'going').length}):</span>
										<div class="mt-1 flex flex-wrap gap-1">
											{#each rsvpData.filter(r => r.status === 'going') as rsvp}
												<span class="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
													{rsvp.firstName || rsvp.userId}
												</span>
											{/each}
										</div>
									</div>
								{/if}
								{#if rsvpData.filter(r => r.status === 'maybe').length > 0}
									<div class="mb-2">
										<span class="text-xs font-medium text-yellow-700">Maybe ({rsvpData.filter(r => r.status === 'maybe').length}):</span>
										<div class="mt-1 flex flex-wrap gap-1">
											{#each rsvpData.filter(r => r.status === 'maybe') as rsvp}
												<span class="inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-700">
													{rsvp.firstName || rsvp.userId}
												</span>
											{/each}
										</div>
									</div>
								{/if}
								{#if rsvpData.filter(r => r.status === 'declined' || r.status === 'not_going').length > 0}
									<div class="mb-2">
										<span class="text-xs font-medium text-red-700">Not Going ({rsvpData.filter(r => r.status === 'declined' || r.status === 'not_going').length}):</span>
										<div class="mt-1 flex flex-wrap gap-1">
											{#each rsvpData.filter(r => r.status === 'declined' || r.status === 'not_going') as rsvp}
												<span class="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs text-red-700">
													{rsvp.firstName || rsvp.userId}
												</span>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>

				<!-- Actions -->
				<div class="flex items-center justify-end gap-3 border-t border-slate-100 p-6">
					{#if isEditMode}
						<button type="button" onclick={handleDelete} class="mr-auto rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
							Delete
						</button>
					{/if}
					<button type="button" onclick={() => { show = false; onclose?.(); }} class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
						Cancel
					</button>
					{#if showNlInput}
						<button type="button" onclick={clearDetected} class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
							Clear
						</button>
					{/if}
					<button
						type="submit"
						class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
						disabled={!title || !date}
					>
						{isEditMode ? 'Update Event' : 'Create Event'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
