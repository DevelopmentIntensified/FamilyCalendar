<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type { Event } from '$lib/types';
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
	let recentAttendants: string[] = [];
	let showMore = false;
	let parsing = false;
	let parseTimeout: ReturnType<typeof setTimeout>;
	let submitting = false;
	let contactSearch = '';

	let userTouchedFields: Record<string, boolean> = {};
	let nlpDetectedFields: Record<string, boolean> = {};
	let lastNlpValues: Record<string, string | boolean | string[]> = {};

	$: isEditMode = event !== null;
	$: dedupedFamilyMembers = dedupeFamilyMembers(familyMembers);

	$: filteredFamilyMembers = dedupedFamilyMembers.filter(m => {
		if (!contactSearch.trim()) return true;
		const search = contactSearch.toLowerCase();
		return (
			m.firstName?.toLowerCase().includes(search) ||
			m.lastName?.toLowerCase().includes(search) ||
			m.email?.toLowerCase().includes(search)
		);
	});

	$: filteredRecentAttendants = recentAttendants.filter(att => {
		if (!contactSearch.trim()) return true;
		return att.toLowerCase().includes(contactSearch.toLowerCase());
	});

	$: if (event && isEditMode) {
		title = event.title || '';
		description = event.description || '';
		location = event.location || '';
		selectedCalendarId = event.calendarId || (calendarIds.length > 0 ? calendarIds[0].id : '');

		if (event.start) {
			const dt = DateTime.fromISO(event.start);
			date = dt.toFormat('yyyy-MM-dd');
			startTime = dt.toFormat('HH:mm');
			allDay = event.allDay || false;
		}
		if (event.end) {
			const endDt = DateTime.fromISO(event.end);
			endTime = endDt.toFormat('HH:mm');
			if (endDt.toFormat('yyyy-MM-dd') !== date) {
				multiDay = true;
				endDate = endDt.toFormat('yyyy-MM-dd');
			}
		}
	}

	onMount(() => {
		try {
			const stored = localStorage.getItem('recent_attendants');
			if (stored) {
				recentAttendants = JSON.parse(stored);
			}
		} catch (e) { /* ignore */ }
	});

	function dedupeFamilyMembers(members: typeof familyMembers) {
		const seen = new Set<string>();
		return members.filter(m => {
			if (seen.has(m.userId)) return false;
			seen.add(m.userId);
			return true;
		});
	}

	function getContactColor(name: string) {
		const colors = [
			{ bg: '#DBEAFE', text: '#1D4ED8' },
			{ bg: '#D1FAE5', text: '#065F46' },
			{ bg: '#FEF3C7', text: '#92400E' },
			{ bg: '#FCE7F3', text: '#9D174D' },
			{ bg: '#E0E7FF', text: '#3730A3' },
			{ bg: '#FEE2E2', text: '#991B1B' },
			{ bg: '#CCFBF1', text: '#115E59' },
			{ bg: '#F3E8FF', text: '#6B21A8' },
			{ bg: '#FFF7ED', text: '#9A3412' },
			{ bg: '#ECFDF5', text: '#047857' },
		];
		let hash = 0;
		for (let i = 0; i < name.length; i++) {
			hash = name.charCodeAt(i) + ((hash << 5) - hash);
		}
		return colors[Math.abs(hash) % colors.length];
	}

	function saveRecentAttendants() {
		const nonUserAtts = attendants.filter(a => !a.includes('@') && a.length < 50 && !familyMembers.some(m => m.userId === a));
		const existing = new Set(recentAttendants);
		const toAdd = nonUserAtts.filter(a => !existing.has(a));
		if (toAdd.length > 0) {
			recentAttendants = [...recentAttendants, ...toAdd].slice(-20);
			try {
				localStorage.setItem('recent_attendants', JSON.stringify(recentAttendants));
			} catch (e) { /* ignore */ }
		}
	}

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
					clearUntouchedNlpFields();

					if (parsed.title && !userTouchedFields.title) {
						title = parsed.title;
						nlpDetectedFields.title = true;
						lastNlpValues.title = parsed.title;
					}
					if (parsed.date && !userTouchedFields.date) {
						date = parsed.date;
						nlpDetectedFields.date = true;
						lastNlpValues.date = parsed.date;
					}
					if (parsed.startTime && !userTouchedFields.startTime) {
						startTime = parsed.startTime;
						allDay = false;
						nlpDetectedFields.startTime = true;
						lastNlpValues.startTime = parsed.startTime;
					}
					if (parsed.endTime && !userTouchedFields.endTime) {
						endTime = parsed.endTime;
						nlpDetectedFields.endTime = true;
						lastNlpValues.endTime = parsed.endTime;
					}
					if (parsed.endDate && !userTouchedFields.endDate) {
						endDate = parsed.endDate;
						multiDay = true;
						nlpDetectedFields.endDate = true;
						lastNlpValues.endDate = parsed.endDate;
					}
					if (parsed.location && !userTouchedFields.location) {
						location = parsed.location;
						nlpDetectedFields.location = true;
						lastNlpValues.location = parsed.location;
					}
					if (parsed.attendants && Array.isArray(parsed.attendants) && !userTouchedFields.attendants) {
						attendants = [...parsed.attendants];
						nlpDetectedFields.attendants = true;
						lastNlpValues.attendants = [...parsed.attendants];
					}
					if (parsed.allDay !== undefined && !userTouchedFields.allDay) {
						allDay = parsed.allDay;
						lastNlpValues.allDay = parsed.allDay;
					}
				}
			}
		} catch (error) {
			console.error('Parse error:', error);
		} finally {
			parsing = false;
		}
	}

	function clearUntouchedNlpFields() {
		if (lastNlpValues.title && !userTouchedFields.title && title === lastNlpValues.title) {
			title = '';
			nlpDetectedFields.title = false;
		}
		if (lastNlpValues.date && !userTouchedFields.date && date === lastNlpValues.date) {
			date = '';
			nlpDetectedFields.date = false;
		}
		if (lastNlpValues.startTime && !userTouchedFields.startTime && startTime === lastNlpValues.startTime) {
			startTime = '';
			allDay = true;
			nlpDetectedFields.startTime = false;
		}
		if (lastNlpValues.endTime && !userTouchedFields.endTime && endTime === lastNlpValues.endTime) {
			endTime = '';
			nlpDetectedFields.endTime = false;
		}
		if (lastNlpValues.endDate && !userTouchedFields.endDate && endDate === lastNlpValues.endDate) {
			endDate = '';
			multiDay = false;
			nlpDetectedFields.endDate = false;
		}
		if (lastNlpValues.location && !userTouchedFields.location && location === lastNlpValues.location) {
			location = '';
			nlpDetectedFields.location = false;
		}
		if (lastNlpValues.attendants && !userTouchedFields.attendants && arraysEqual(attendants, lastNlpValues.attendants as string[])) {
			attendants = [];
			nlpDetectedFields.attendants = false;
		}
		lastNlpValues = {};
	}

	function arraysEqual(a: string[], b: string[]) {
		if (a.length !== b.length) return false;
		return a.every((v, i) => v === b[i]);
	}

	function onNlInputChange() {
		clearTimeout(parseTimeout);
		parseTimeout = setTimeout(() => parseNlInput(), 300);
	}

	function markTouched(field: string) {
		userTouchedFields[field] = true;
	}

	function isDetected(field: string) {
		return nlpDetectedFields[field] && !userTouchedFields[field];
	}

	function toggleAttendant(value: string) {
		if (attendants.includes(value)) {
			attendants = attendants.filter(a => a !== value);
		} else {
			attendants = [...attendants, value];
		}
		markTouched('attendants');
	}

	function close() {
		show = false;
		dispatch('close');
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		submitting = true;

		let startTimestamp = '';
		if (date && startTime && !allDay) {
			startTimestamp = DateTime.fromFormat(`${date} ${startTime}`, 'yyyy-MM-dd HH:mm').toISO();
		} else if (date) {
			startTimestamp = DateTime.fromFormat(date, 'yyyy-MM-dd').startOf('day').toISO();
		}

		let endTimestamp = '';
		if (multiDay && endDate) {
			if (endTime && !allDay) {
				endTimestamp = DateTime.fromFormat(`${endDate} ${endTime}`, 'yyyy-MM-dd HH:mm').toISO();
			} else {
				endTimestamp = DateTime.fromFormat(endDate, 'yyyy-MM-dd').endOf('day').toISO();
			}
		} else if (endTime && !allDay) {
			endTimestamp = DateTime.fromFormat(`${date} ${endTime}`, 'yyyy-MM-dd HH:mm').toISO();
		} else if (!multiDay && !endTime) {
			const startDt = DateTime.fromFormat(`${date} ${startTime || '09:00'}`, 'yyyy-MM-dd HH:mm');
			endTimestamp = startDt.plus({ hours: 1 }).toISO();
		}

		saveRecentAttendants();

		const eventData = {
			title,
			start: startTimestamp,
			end: endTimestamp || null,
			location,
			description,
			calendarId: selectedCalendarId,
			allDay,
			attendants
		};

		if (isEditMode && event) {
			try {
				const res = await fetch(`/api/events/${event.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(eventData)
				});
				if (res.ok) {
					dispatch('update', { id: event.id, ...eventData });
				}
			} catch (err) {
				console.error('Update failed:', err);
			}
		} else {
			try {
				const res = await fetch('/api/events', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(eventData)
				});
				if (res.ok) {
					dispatch('create', eventData);
				}
			} catch (err) {
				console.error('Create failed:', err);
			}
		}

		submitting = false;
	}

	function handleDelete() {
		if (event) dispatch('delete', { id: event.id });
	}

	function clearAll() {
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
		userTouchedFields = {};
		nlpDetectedFields = {};
		lastNlpValues = {};
	}
</script>

<style>
	.modal-scroll::-webkit-scrollbar {
		width: 5px;
	}
	.modal-scroll::-webkit-scrollbar-track {
		background: transparent;
	}
	.modal-scroll::-webkit-scrollbar-thumb {
		background: rgba(148, 163, 184, 0.5);
		border-radius: 3px;
	}
	.modal-scroll::-webkit-scrollbar-thumb:hover {
		background: rgba(100, 116, 139, 0.7);
	}
</style>

{#if show}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
		on:click={close}
		on:keydown={(e) => e.key === 'Escape' && close()}
		role="presentation"
	>
		<div
			class="w-full max-w-lg transform rounded-xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto modal-scroll"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
		>
			<div class="sticky top-0 z-10 bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-4">
				<div class="flex items-center justify-between">
					<div>
						<h2 id="modal-title" class="text-lg font-semibold text-white">
							{isEditMode ? 'Edit Event' : 'Create New Event'}
						</h2>
						{#if !isEditMode}
							<p class="mt-0.5 text-xs text-primary-100">Type naturally, we'll fill in the rest</p>
						{/if}
					</div>
					<button
						type="button"
						on:click={close}
						class="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
						aria-label="Close modal"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<form on:submit={handleSubmit}>
				<div class="space-y-3 p-5">
					{#if !isEditMode}
						<div>
							<label for="nl-input" class="mb-1 block text-sm font-medium text-slate-700">Quick Add</label>
							<div class="mt-1 flex gap-2">
								<div class="relative flex-1">
									<input
										id="nl-input"
										type="text"
										bind:value={nlInput}
										on:input={onNlInputChange}
										placeholder="Lunch Friday at noon with John"
										class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
									/>
									{#if parsing}
										<div class="absolute right-3 top-1/2 -translate-y-1/2">
											<div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
										</div>
									{/if}
								</div>
								<button
									type="button"
									on:click={clearAll}
									class="rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
								>
									Clear
								</button>
							</div>
						</div>
					{/if}

					<div>
						<label for="event-title" class="mb-1 block text-sm font-medium text-slate-700">
							Event Title {#if isDetected('title')}<span class="text-emerald-600 ml-1">✓</span>{/if}*
						</label>
						<input
							id="event-title"
							type="text"
							bind:value={title}
							on:input={() => markTouched('title')}
							placeholder="e.g., Family Dinner, Doctor Appointment"
							required
							class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
						/>
					</div>

					{#if !isEditMode}
						<button
							type="button"
							on:click={() => showMore = !showMore}
							class="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
						>
							{showMore ? 'Show Less' : 'Show More'}
							<svg class="h-3.5 w-3.5 transition-transform {showMore ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
							</svg>
						</button>
					{/if}

					{#if isEditMode || showMore || nlpDetectedFields.date || nlpDetectedFields.startTime || nlpDetectedFields.location || nlpDetectedFields.attendants}
						{#if showMore || isEditMode}
							<div class="flex items-center gap-4">
								<label class="flex items-center gap-1.5">
									<input type="checkbox" bind:checked={allDay} on:change={() => markTouched('allDay')} class="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
									<span class="text-sm font-medium text-slate-700">All day</span>
								</label>
								<label class="flex items-center gap-1.5">
									<input type="checkbox" bind:checked={multiDay} on:change={() => markTouched('endDate')} class="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
									<span class="text-sm font-medium text-slate-700">Multi-day</span>
								</label>
							</div>
						{/if}

						<div class="{multiDay ? 'grid grid-cols-2 gap-3' : ''}">
							<div>
								<label for="event-date" class="mb-1 block text-sm font-medium text-slate-700">
									Start Date
									{#if isDetected('date')}<span class="text-emerald-600 ml-1">✓</span>{/if}
								</label>
								<input
									id="event-date"
									type="date"
									bind:value={date}
									on:input={() => markTouched('date')}
									required
									class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
								/>
							</div>
							{#if multiDay}
								<div>
									<label for="event-end-date" class="mb-1 block text-sm font-medium text-slate-700">
										End Date
										{#if isDetected('endDate')}<span class="text-emerald-600 ml-1">✓</span>{/if}
									</label>
									<input
										id="event-end-date"
										type="date"
										bind:value={endDate}
										on:input={() => markTouched('endDate')}
										class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
									/>
								</div>
							{/if}
						</div>

						{#if !allDay}
							<div class="grid grid-cols-2 gap-3">
								<div>
									<label for="start-time" class="mb-1 block text-sm font-medium text-slate-700">
										Start Time
										{#if isDetected('startTime')}<span class="text-emerald-600 ml-1">✓</span>{/if}
									</label>
									<input
										id="start-time"
										type="time"
										bind:value={startTime}
										on:input={() => markTouched('startTime')}
										class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
									/>
								</div>
								<div>
									<label for="end-time" class="mb-1 block text-sm font-medium text-slate-700">
										End Time
										{#if isDetected('endTime')}<span class="text-emerald-600 ml-1">✓</span>{/if}
									</label>
									<input
										id="end-time"
										type="time"
										bind:value={endTime}
										on:input={() => markTouched('endTime')}
										class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
									/>
								</div>
							</div>
						{/if}

						{#if isEditMode || showMore || nlpDetectedFields.location}
							<div>
								<label for="event-location" class="mb-1 block text-sm font-medium text-slate-700">
									Location
									{#if isDetected('location')}<span class="text-emerald-600 ml-1">✓</span>{/if}
								</label>
								<input
									id="event-location"
									type="text"
									bind:value={location}
									on:input={() => markTouched('location')}
									placeholder="e.g., Home, 123 Main St"
									class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
								/>
							</div>
						{/if}

						{#if isEditMode || showMore || nlpDetectedFields.attendants}
							<div class="rounded-lg border border-slate-200">
								<div class="px-4 py-2.5 border-b border-slate-200">
									<div class="flex items-center justify-between">
										<span class="text-sm font-medium text-slate-700">
											Attendees
											{#if isDetected('attendants')}<span class="text-emerald-600 ml-1">✓</span>{/if}
										</span>
										{#if attendants.length > 0}
											<span class="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">{attendants.length}</span>
										{/if}
									</div>
								</div>

								{#if attendants.length > 0}
									<div class="px-4 py-2 border-b border-slate-200 flex flex-wrap gap-2">
										{#each attendants as att}
											{@const member = familyMembers.find(m => m.userId === att)}
											{@const color = getContactColor(att)}
											{@const initials = member ? `${member.firstName.charAt(0)}${member.lastName.charAt(0)}` : att.charAt(0).toUpperCase()}
											{@const displayName = member ? `${member.firstName} ${member.lastName}` : att}
											<span class="contact-chip inline-flex items-center gap-2 rounded-full border border-slate-200 px-2 py-1 pr-3 text-sm">
												<span class="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold"
													style="background-color: {color.bg}; color: {color.text}">
													{initials}
												</span>
												<span class="text-slate-700">{displayName}</span>
												<button type="button" on:click={() => toggleAttendant(att)} class="ml-1 text-slate-400 hover:text-slate-600" aria-label="Remove {att}">
													<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
														<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
													</svg>
												</button>
											</span>
										{/each}
									</div>
								{/if}

								<div class="p-3">
									<div class="relative mb-2">
										<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
											<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
												<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
											</svg>
										</div>
										<input
											type="text"
											bind:value={contactSearch}
											placeholder="Search family or type a name..."
											class="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
										/>
									</div>

									{#if filteredFamilyMembers.length > 0}
										<div class="max-h-36 overflow-y-auto space-y-1 modal-scroll">
											{#each filteredFamilyMembers as member}
												{@const color = getContactColor(member.firstName + member.lastName)}
												<button
													type="button"
													on:click={() => toggleAttendant(member.userId)}
													class="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-all hover:bg-primary-50/50 {
														attendants.includes(member.userId)
															? 'bg-primary-50 ring-1 ring-primary-200'
															: ''
													}"
												>
													<div class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
														style="background-color: {color.bg}; color: {color.text}">
														{member.firstName?.charAt(0)}{member.lastName?.charAt(0)}
														{#if attendants.includes(member.userId)}
															<div class="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white">
																<svg class="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
																	<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
																</svg>
															</div>
														{/if}
													</div>
													<div class="flex-1 min-w-0">
														<p class="truncate text-sm font-medium text-slate-700">{member.firstName} {member.lastName}</p>
														<p class="truncate text-xs text-slate-400">{member.email}</p>
													</div>
												</button>
											{/each}
										</div>
									{/if}

									{#if filteredRecentAttendants.length > 0}
										<div class="mt-2">
											<p class="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recent</p>
											<div class="flex flex-wrap gap-2">
												{#each filteredRecentAttendants as att}
													{@const color = getContactColor(att)}
													<button
														type="button"
														on:click={() => { if (!attendants.includes(att)) { toggleAttendant(att); } }}
														class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 transition-all hover:border-primary-300 hover:bg-primary-50"
													>
														<span class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold"
															style="background-color: {color.bg}; color: {color.text}">
															{att.charAt(0).toUpperCase()}
														</span>
														{att}
													</button>
												{/each}
											</div>
										</div>
									{/if}

									{#if contactSearch && !filteredFamilyMembers.length && !filteredRecentAttendants.length}
										<button
											type="button"
											on:click={() => {
												if (contactSearch.trim() && !attendants.includes(contactSearch.trim())) {
													attendants = [...attendants, contactSearch.trim()];
													contactSearch = '';
													markTouched('attendants');
												}
											}}
											class="w-full rounded-lg border-2 border-dashed border-slate-200 py-2 text-sm text-slate-500 transition-all hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
										>
											Add "{contactSearch.trim()}"
										</button>
									{/if}
								</div>
							</div>
						{/if}

						<div>
							<label for="event-desc" class="mb-1 block text-sm font-medium text-slate-700">Description</label>
							<textarea
								id="event-desc"
								bind:value={description}
								on:input={() => markTouched('description')}
								placeholder="Add details..."
								rows="2"
								class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
							></textarea>
						</div>

						{#if calendarIds.length > 1}
							<div>
								<label for="event-calendar" class="mb-1 block text-sm font-medium text-slate-700">Calendar</label>
								<select
									id="event-calendar"
									bind:value={selectedCalendarId}
									class="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
								>
									{#each calendarIds as cal}
										<option value={cal.id}>{cal.name}</option>
									{/each}
								</select>
							</div>
						{/if}
					{/if}
				</div>

				{#if isEditMode && rsvpData.length > 0}
					<div class="border-t border-slate-100 p-5">
						<h3 class="mb-2 text-sm font-semibold text-slate-700">RSVP Status</h3>
						{#if rsvpData.filter(r => r.status === 'going').length > 0}
							<div class="mb-2">
								<span class="text-xs font-medium text-emerald-700">Going ({rsvpData.filter(r => r.status === 'going').length}):</span>
								<div class="mt-1 flex flex-wrap gap-1">
									{#each rsvpData.filter(r => r.status === 'going') as rsvp}
										<span class="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{rsvp.firstName || rsvp.userId}</span>
									{/each}
								</div>
							</div>
						{/if}
						{#if rsvpData.filter(r => r.status === 'maybe').length > 0}
							<div class="mb-2">
								<span class="text-xs font-medium text-amber-700">Maybe ({rsvpData.filter(r => r.status === 'maybe').length}):</span>
								<div class="mt-1 flex flex-wrap gap-1">
									{#each rsvpData.filter(r => r.status === 'maybe') as rsvp}
										<span class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{rsvp.firstName || rsvp.userId}</span>
									{/each}
								</div>
							</div>
						{/if}
						{#if rsvpData.filter(r => r.status === 'declined' || r.status === 'not_going').length > 0}
							<div class="mb-2">
								<span class="text-xs font-medium text-red-700">Not Going ({rsvpData.filter(r => r.status === 'declined' || r.status === 'not_going').length}):</span>
								<div class="mt-1 flex flex-wrap gap-1">
									{#each rsvpData.filter(r => r.status === 'declined' || r.status === 'not_going') as rsvp}
										<span class="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{rsvp.firstName || rsvp.userId}</span>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<div class="flex items-center justify-end gap-2 border-t border-slate-100 p-5">
					{#if isEditMode}
						<button type="button" on:click={handleDelete} class="mr-auto rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">Delete</button>
					{/if}
					<button type="button" on:click={close} class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
					{#if !isEditMode}
						<button type="button" on:click={clearAll} class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Clear</button>
					{/if}
					<button
						type="submit"
						class="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						disabled={!title || !date || submitting}
					>
						{#if submitting}
							<div class="flex items-center gap-2">
								<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
								{isEditMode ? 'Updating...' : 'Creating...'}
							</div>
						{:else}
							{isEditMode ? 'Update' : 'Create'}
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
