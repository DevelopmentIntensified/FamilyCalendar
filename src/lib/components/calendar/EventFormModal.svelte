<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { Event } from '$lib/types';
	import LocationSearch from '$lib/components/LocationSearch.svelte';
	import { DateTime } from 'luxon';

	export let show = false;
	export let event: Event | null = null;
	export let calendarIds: { id: string; name: string }[] = [];
	export let familyMembers: { userId: string; firstName: string; lastName: string; email: string }[] = [];
	export let rsvpData: { userId: string; status: string; firstName?: string; lastName?: string }[] = [];

	const dispatch = createEventDispatcher();

	let nlInput = '';
	let title = '';
	let date = '';
	let startTime = '';
	let endTime = '';
	let allDay = true;
	let multiDay = false;
	let endDate = '';
	let location = '';
	let description = '';
	let selectedCalendarId = '';
	let attendants: string[] = [];
	let newAttendant = '';
	let recentAttendants: string[] = [];
	let showMore = false;
	let showMoreAttendants = false;
	let parsing = false;
	let parseTimeout: ReturnType<typeof setTimeout>;

	// Track which fields were detected by NLP (to show even when collapsed)
	let detectedFields = {
		title: false,
		date: false,
		startTime: false,
		endTime: false,
		endDate: false,
		location: false,
		attendants: false,
		allDay: false
	};

	$: isEditMode = event !== null;
	$: showNlInput = true;
	$: hasDetectedFields = Object.values(detectedFields).some(Boolean);

	// Helper: show a field if it's detected, or if edit mode, or if Show More is open
	$: shouldShowField = (field) => detectedFields[field] || isEditMode || showMore;

	// Populate form when editing
	$: if (event && isEditMode) {
		title = event.title || '';
		description = event.description || '';
		location = event.location || '';
		selectedCalendarId = event.calendarId || (calendarIds.length > 0 ? calendarIds[0].id : '');

		if (event.start) {
			const dt = DateTime.fromISO(event.start);
			date = dt.toFormat('yyyy-MM-dd');
			startTime = dt.toFormat('HH:mm');
		}
		if (event.end) {
			const endDt = DateTime.fromISO(event.end);
			endTime = endDt.toFormat('HH:mm');
			// Check if multi-day (end date differs from start date)
			if (endDt.toFormat('yyyy-MM-dd') !== date) {
				multiDay = true;
				endDate = endDt.toFormat('yyyy-MM-dd');
			}
		}
		if (event.allDay) {
			allDay = true;
		}
	}

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
				const result = await response.json();
				const parsed = result.parsed;

				if (parsed) {
					if (parsed.title) {
						title = parsed.title;
						detectedFields.title = true;
					}
					if (parsed.date) {
						date = parsed.date;
						detectedFields.date = true;
					}
					if (parsed.startTime) {
						startTime = parsed.startTime;
						detectedFields.startTime = true;
						allDay = false;
					}
					if (parsed.endTime) {
						endTime = parsed.endTime;
						detectedFields.endTime = true;
					}
					if (parsed.endDate) {
						endDate = parsed.endDate;
						detectedFields.endDate = true;
						multiDay = true;
					}
					if (parsed.location) {
						location = parsed.location;
						detectedFields.location = true;
					}
					if (parsed.attendants && Array.isArray(parsed.attendants)) {
						attendants = [...parsed.attendants];
						detectedFields.attendants = true;
					}
					if (parsed.allDay !== undefined) {
						allDay = parsed.allDay;
						detectedFields.allDay = true;
					}
					description = nlInput;
				}
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
		dispatch('close');
	}

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();

		let startTimestamp = '';
		if (date && startTime && !allDay) {
			startTimestamp = DateTime.fromFormat(`${date} ${startTime}`, 'yyyy-MM-dd HH:mm').toISO();
		} else if (date) {
			startTimestamp = DateTime.fromFormat(date, 'yyyy-MM-dd').toISO();
		}

		let endTimestamp = '';
		if (multiDay && endDate) {
			if (endTime && !allDay) {
				endTimestamp = DateTime.fromFormat(`${endDate} ${endTime}`, 'yyyy-MM-dd HH:mm').toISO();
			} else {
				endTimestamp = DateTime.fromFormat(endDate, 'yyyy-MM-dd').toISO();
			}
		} else if (endTime && !allDay) {
			endTimestamp = DateTime.fromFormat(`${date} ${endTime}`, 'yyyy-MM-dd HH:mm').toISO();
		}

		const eventData = {
			title,
			start: startTimestamp,
			end: endTimestamp || null,
			location,
			description,
			calendarId: selectedCalendarId,
			allDay
		};

		if (isEditMode && event) {
			dispatch('update', { id: event.id, ...eventData });
		} else {
			dispatch('create', eventData);
		}
	}

	function handleDelete() {
		if (event) dispatch('delete', { id: event.id });
	}

	function clearDetected() {
		title = '';
		date = '';
		startTime = '';
		endTime = '';
		endDate = '';
		location = '';
		description = '';
		attendants = [];
		nlInput = '';
		allDay = true;
		multiDay = false;
		detectedFields = {
			title: false,
			date: false,
			startTime: false,
			endTime: false,
			endDate: false,
			location: false,
			attendants: false,
			allDay: false
		};
	}
</script>

{#if show}
	<!-- Modal Backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
		on:click={close}
		on:keydown={(e) => e.key === 'Escape' && close()}
		role="presentation"
	>
		<div
			class="w-full max-w-lg transform rounded-2xl bg-white shadow-2xl transition-all duration-300 ease-out max-h-[90vh] overflow-y-auto"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
		>
			<!-- Header -->
			<div class="sticky top-0 z-10 overflow-hidden bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-5">
				<div class="flex items-center justify-between">
					<h2 id="modal-title" class="text-xl font-bold text-white">
						{isEditMode ? 'Edit Event' : 'Create Event'}
					</h2>
					<button
						type="button"
						on:click={close}
						class="rounded-full p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
						aria-label="Close modal"
					>
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				{#if !isEditMode}
					<p class="mt-1 text-sm text-white/70">Quick-add with natural language</p>
				{/if}
			</div>

			<form on:submit={handleSubmit}>
				<div class="space-y-5 p-6">
					<!-- Quick Add (NLP) - always at top, visible unless AI disabled -->
					{#if showNlInput}
						<div class="group">
							<label for="nl-input" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Quick Add</label>
							<div class="flex gap-2">
								<div class="relative flex-1">
									<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
										<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
										</svg>
									</div>
									<input
										id="nl-input"
										type="text"
										bind:value={nlInput}
										on:input={onNlInputChange}
										placeholder="Try: Lunch Friday at noon with John in Conference A"
										class="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
									/>
									{#if parsing}
										<div class="absolute right-3 top-1/2 -translate-y-1/2">
											<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
										</div>
									{/if}
								</div>
								<button
									type="button"
									on:click={clearDetected}
									class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all"
								>
									Clear
								</button>
							</div>
						</div>
					{/if}

					<!-- Title (always visible) -->
					<div class="group">
						<label for="event-title" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Title</label>
						<div class="relative">
							<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
								<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
							</div>
							<input
								id="event-title"
								type="text"
								bind:value={title}
								placeholder="Event title"
								required
								class="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
							/>
						</div>
					</div>

					<!-- Description (always visible) -->
					<div class="group">
						<label for="event-desc" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Description</label>
						<textarea
							id="event-desc"
							bind:value={description}
							placeholder="Add details..."
							rows="2"
							class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 resize-none"
						></textarea>
					</div>

					<!-- Detected Fields Summary (visible even when collapsed) -->

					{#if !isEditMode}
						<!-- Show More/Less Button -->
						<button
							type="button"
							on:click={() => showMore = !showMore}
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
					{/if}

					<!-- Date (always visible if detected or expanded) -->
					{#if shouldShowField('date')}
						<div class="group">
							<label for="event-date" class="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
								{#if detectedFields.date}
									<svg class="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
										<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
									</svg>
								{/if}
								Date
							</label>
							<div class="relative">
								<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
									<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
									</svg>
								</div>
								<input
									id="event-date"
									type="date"
									bind:value={date}
									required
									class="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
								/>
							</div>
						</div>
					{/if}

					<!-- All-Day & Multi-Day Row -->
					{#if shouldShowField('allDay') || shouldShowField('endDate')}
						<div class="grid grid-cols-2 gap-4">
							<div class="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
								<div class="flex items-center gap-2">
									<svg class="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
									</svg>
									<label for="all-day" class="flex items-center gap-1 text-sm font-medium text-slate-700">
										{#if detectedFields.allDay}
											<svg class="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
												<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
											</svg>
										{/if}
										All-day
									</label>
								</div>
								<input
									type="checkbox"
									id="all-day"
									bind:checked={allDay}
									class="h-5 w-5 rounded border-2 border-slate-300 text-primary-600 focus:ring-primary-500"
								/>
							</div>

							<div class="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
								<div class="flex items-center gap-2">
									<svg class="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
									</svg>
									<label for="multi-day" class="flex items-center gap-1 text-sm font-medium text-slate-700">
										{#if detectedFields.endDate}
											<svg class="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
												<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
											</svg>
										{/if}
										Multi-day
									</label>
								</div>
								<input
									type="checkbox"
									id="multi-day"
									bind:checked={multiDay}
									class="h-5 w-5 rounded border-2 border-slate-300 text-primary-600 focus:ring-primary-500"
								/>
							</div>
						</div>
					{/if}

					<!-- End Date (only when multi-day) -->
					{#if multiDay && shouldShowField('endDate')}
						<div class="group">
							<label for="event-end-date" class="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
								{#if detectedFields.endDate}
									<svg class="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
										<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
									</svg>
								{/if}
								End Date
							</label>
							<div class="relative">
								<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
									<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
									</svg>
								</div>
								<input
									id="event-end-date"
									type="date"
									bind:value={endDate}
									class="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
								/>
							</div>
						</div>
					{/if}

					<!-- Start Time | End Time (side by side, hidden when all-day) -->
					{#if !allDay && (shouldShowField('startTime') || shouldShowField('endTime'))}
						<div class="grid grid-cols-2 gap-4">
							<div class="group">
								<label for="start-time" class="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
									{#if detectedFields.startTime}
										<svg class="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
									{/if}
									Start Time
								</label>
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
								<label for="end-time" class="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
									{#if detectedFields.endTime}
										<svg class="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
									{/if}
									End Time
								</label>
								<div class="relative">
									<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
										<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
					{#if shouldShowField('location')}
						<div class="group">
							<label for="event-location" class="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
								{#if detectedFields.location}
									<svg class="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
										<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
									</svg>
								{/if}
								Location
							</label>
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
					{/if}

					<!-- Attendants Section -->
					{#if shouldShowField('attendants') || isEditMode}
						<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
							<div class="mb-3 flex items-center justify-between">
								<span class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
									{#if detectedFields.attendants}
										<svg class="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
									{/if}
									Attendants
								</span>
								<button
									type="button"
									on:click={() => showMoreAttendants = !showMoreAttendants}
									class="text-xs font-medium text-primary-600 hover:text-primary-700"
								>
									{showMoreAttendants ? 'Hide' : 'Show'} Options
								</button>
							</div>

							<!-- Selected Attendants Chips (always visible) -->
							{#if attendants.length > 0}
								<div class="mb-3 flex flex-wrap gap-1">
									{#each attendants as att}
										<span class="inline-flex items-center gap-1 rounded-full bg-primary-100 px-3 py-1 text-xs text-primary-700">
											{att}
											<button
												type="button"
												on:click={() => attendants = attendants.filter(a => a !== att)}
												class="ml-1 text-primary-500 hover:text-primary-700"
											>
												×
											</button>
										</span>
									{/each}
								</div>
							{/if}

							{#if showMoreAttendants}
								<!-- Family Members -->
								{#if familyMembers.length > 0}
									<div class="mb-3">
										<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Family Members</p>
										<div class="grid grid-cols-2 gap-2">
											{#each familyMembers as member}
												<button
													type="button"
													on:click={() => {
														if (attendants.includes(member.userId)) {
															attendants = attendants.filter(id => id !== member.userId);
														} else {
															attendants = [...attendants, member.userId];
														}
													}}
													class="flex items-center gap-2 rounded-xl border-2 p-2 text-left transition-all hover:border-primary-300 {
														attendants.includes(member.userId)
															? 'border-primary-500 bg-primary-50'
															: 'border-slate-200 bg-white'
													}"
												>
													<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold {
														attendants.includes(member.userId)
															? 'bg-primary-200 text-primary-800'
															: 'bg-slate-100 text-slate-600'
													}">
														{member.firstName?.charAt(0)}{member.lastName?.charAt(0)}
													</div>
													<div class="flex-1 min-w-0">
														<p class="truncate text-sm font-medium text-slate-700">
															{member.firstName} {member.lastName}
														</p>
														<p class="truncate text-xs text-slate-500">{member.email}</p>
													</div>
													{#if attendants.includes(member.userId)}
														<div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white">
															<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
																<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
															</svg>
														</div>
													{/if}
												</button>
											{/each}
										</div>
									</div>
								{/if}

								<!-- Recent Non-user Attendants -->
								{#if recentAttendants.length > 0}
									<div class="mb-3">
										<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent</p>
										<div class="flex flex-wrap gap-1">
											{#each recentAttendants as att}
												<button
													type="button"
													on:click={() => {
														if (!attendants.includes(att)) {
															attendants = [...attendants, att];
														}
													}}
													class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs transition-all hover:border-primary-300 hover:bg-primary-50"
												>
													+ {att}
												</button>
											{/each}
										</div>
									</div>
								{/if}

								<!-- Add New Attendant -->
								<div>
									<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Add New</p>
									<div class="flex gap-2">
										<input
											type="text"
											bind:value={newAttendant}
											placeholder="Enter name or email..."
											class="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
										/>
										<button
											type="button"
											on:click={() => {
												if (newAttendant.trim()) {
													attendants = [...attendants, newAttendant.trim()];
													newAttendant = '';
												}
											}}
											class="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
										>
											Add
										</button>
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Calendar Selector -->
					{#if calendarIds.length > 1}
						<div class="group">
							<label for="event-calendar" class="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Calendar</label>
							<select
								id="event-calendar"
								bind:value={selectedCalendarId}
								class="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm transition-all focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
							>
								{#each calendarIds as cal}
									<option value={cal.id}>{cal.name}</option>
								{/each}
							</select>
						</div>
					{/if}
				</div>

				<!-- RSVP Info (Edit Mode Only) -->
				{#if isEditMode && rsvpData.length > 0}
					<div class="border-t border-slate-100 p-6">
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

						{#if attendants.length > 0}
							<div>
								<span class="text-xs font-medium text-slate-600">Non-user Attendants ({attendants.length}):</span>
								<div class="mt-1 flex flex-wrap gap-1">
									{#each attendants as att}
										<span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
											<svg class="h-3 w-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
											</svg>
											{att}
										</span>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Actions -->
				<div class="flex items-center justify-end gap-3 border-t border-slate-100 p-6">
					{#if isEditMode}
						<button
							type="button"
							on:click={handleDelete}
							class="mr-auto rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
						>
							Delete
						</button>
					{/if}
					<button type="button" on:click={close} class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
						Cancel
					</button>
					{#if showNlInput}
						<button type="button" on:click={clearDetected} class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
							Clear
						</button>
					{/if}
					<button
						type="submit"
						class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
						disabled={!title || !date}
					>
						{isEditMode ? 'Update Event' : 'Create Event'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
