<script lang="ts">
	import { enhance } from '$app/forms';
	import { fly, fade } from 'svelte/transition';
	import { writable, get } from 'svelte/store';
	import { DateTime } from 'luxon';
	import type { PageData } from './$types';
	import Calendar from '$lib/components/calendar/Calendar.svelte';

	export let data: PageData;

	const currentDate = writable(DateTime.now());
	let showModal = false;
	
	// NL Input
	let nlInput = '';
	let parsing = false;
	let parsedResult: any = null;
	let parseError = '';
	
	// Get family members for contact list
	$: familyMembers = data.familyMembers || [];
	
	interface FieldState {
		value: string;
		detected: boolean;
		userEdited: boolean;
		visible: boolean;
	}
	
	// Form fields with detected state tracking
	let form: {
		title: FieldState;
		date: FieldState;
		startTime: FieldState;
		endTime: FieldState;
		location: FieldState;
		description: FieldState;
		attendants: { value: string[]; detected: boolean; userEdited: boolean; visible: boolean };
	} = {
		title: { value: '', detected: false, userEdited: false, visible: true },
		date: { value: '', detected: false, userEdited: false, visible: false },
		startTime: { value: '', detected: false, userEdited: false, visible: false },
		endTime: { value: '', detected: false, userEdited: false, visible: false },
		location: { value: '', detected: false, userEdited: false, visible: false },
		description: { value: '', detected: false, userEdited: false, visible: false },
		attendants: { value: [], detected: false, userEdited: false, visible: false }
	};
	
	let allFieldsVisible = false;
	let showAttendantsDropdown = false;
	let loading = false;
	let startValue = '';
	let endValue = '';

	// Debounce timer for auto-parse
	let parseTimer: ReturnType<typeof setTimeout>;

	function openQuickAdd(date?: string, time?: string) {
		resetForm();
		if (date) form.date.value = date;
		if (time) form.startTime.value = time;
		showModal = true;
		allFieldsVisible = false;
	}

	function close() {
		showModal = false;
		resetForm();
	}

	function resetForm() {
		nlInput = '';
		parsedResult = null;
		parseError = '';
		form = {
			title: { value: '', detected: false, userEdited: false, visible: true },
			date: { value: '', detected: false, userEdited: false, visible: false },
			startTime: { value: '', detected: false, userEdited: false, visible: false },
			endTime: { value: '', detected: false, userEdited: false, visible: false },
			location: { value: '', detected: false, userEdited: false, visible: false },
			description: { value: '', detected: false, userEdited: false, visible: false },
			attendants: { value: [], detected: false, userEdited: false, visible: false }
		};
	}

	async function parseInput() {
		if (!nlInput.trim()) return;
		parsing = true;
		parseError = '';
		
		try {
			const res = await fetch('/api/parse-event', {
				method: 'POST',
				body: JSON.stringify({ input: nlInput })
			});
			const result = await res.json();
			
			if (result.parsed) {
				parsedResult = result;
				applyParsedResult(result.parsed);
			} else if (result.error) {
				parseError = 'Could not understand input';
				showAllFields();
			}
		} catch (e) {
			parseError = 'Parsing failed';
			showAllFields();
		} finally {
			parsing = false;
		}
	}

	function applyParsedResult(parsed: any) {
		// Title - always visible
		if (parsed.title) {
			form.title.value = parsed.title;
			form.title.detected = true;
			form.title.visible = true;
		}
		
		// Date
		if (parsed.date) {
			form.date.value = parsed.date;
			form.date.detected = true;
			form.date.visible = true;
		}
		
		// Start time
		if (parsed.startTime && !parsed.allDay) {
			form.startTime.value = parsed.startTime;
			form.startTime.detected = true;
			form.startTime.visible = true;
		}
		
		// End time
		if (parsed.endTime) {
			form.endTime.value = parsed.endTime;
			form.endTime.detected = true;
			form.endTime.visible = true;
		}
		
		// Location
		if (parsed.location) {
			form.location.value = parsed.location;
			form.location.detected = true;
			form.location.visible = true;
		}
		
		// Description
		if (parsed.description) {
			form.description.value = parsed.description;
			form.description.detected = true;
			form.description.visible = true;
		}
	}

	function handleFieldChange(field: string) {
		const f = form[field as keyof typeof form] as any;
		if (f.value) {
			f.userEdited = true;
			f.visible = true;
		}
	}

	function toggleField(field: string) {
		const f = form[field as keyof typeof form] as any;
		f.visible = !f.visible;
	}

	function toggleAttendant(member: any) {
		const current = form.attendants.value;
		if (current.includes(member.id)) {
			form.attendants.value = current.filter(id => id !== member.id);
		} else {
			form.attendants.value = [...current, member.id];
		}
		form.attendants.userEdited = true;
		form.attendants.visible = true;
		showAttendantsDropdown = false;
	}

	function showAllFields() {
		allFieldsVisible = true;
		Object.keys(form).forEach(k => {
			form[k as keyof typeof form] = { ...form[k as any, visible: true };
		});
	}

	function hideAllExtra() {
		allFieldsVisible = false;
		form.title.visible = true;
		['date', 'startTime', 'endTime', 'location', 'description', 'attendants'].forEach(k => {
			const f = form[k as keyof typeof form] as any;
			if (!f.detected && !f.userEdited) {
				f.visible = false;
			}
		});
	}

	function onNlInput() {
		clearTimeout(parseTimer);
		parseTimer = setTimeout(parseInput, 500);
	}

	// Build start/end values when submitting
	$: if (showModal) {
		const dateVal = form.date.value || new Date().toISOString().split('T')[0];
		const startT = form.startTime.value || '09:00';
		const endT = form.endTime.value || startT;
		
		if (form.title.value && form.title.value.includes('all day')) {
			startValue = dateVal;
			endValue = dateVal;
		} else if (form.startTime.value) {
			startValue = `${dateVal}T${startT}`;
			endValue = `${dateVal}T${endT}`;
		} else {
			startValue = dateVal;
			endValue = dateVal;
		}
	}

	// Combine all events
	$: allEvents = [
		...(data.userEvents || []),
		...(data.familyEvents || []),
		...(data.adEvents || [])
	];
</script>

<div class="pb-24">
	<Calendar 
		{currentDate} 
		events={allEvents} 
		removeEvent={() => {}}
		preferedFirstDayOfWeek={data.user?.firstDayOfWeek || 'sunday'}
	/>
</div>

<!-- Floating Quick Add Button -->
<button
	onclick={() => openQuickAdd()}
	class="fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 shadow-lg shadow-primary-300 hover:bg-primary-700 hover:scale-105 transition-all"
	title="Quick Add Event"
>
	<svg class="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
	</svg>
</button>

<!-- Quick Add Modal -->
{#if showModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4" transition:fade={{ duration: 100 }}>
		<button class="absolute inset-0 bg-black/40" onclick={close}></button>
		
		<div class="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl" transition:fly={{ y: 10, duration: 150 }}>
			<form 
				method="POST" 
				action="/calendar/event/new?/createEvent" 
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						await update();
						close();
					};
				}}
				class="p-6"
			>
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-lg font-bold text-slate-900">New Event</h2>
					<div class="flex items-center gap-2">
						<button 
							type="button" 
							onclick={showAllFields}
							class="text-xs text-primary-600 hover:text-primary-700"
						>
							Expand all
						</button>
						<button type="button" onclick={close} class="text-slate-400 hover:text-slate-600">
							<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				</div>

				<!-- NL Input -->
				<div class="mb-4 relative">
					<input
						type="text"
						bind:value={nlInput}
						oninput={onNlInput}
						placeholder="Try: Lunch Friday at noon with John in Conference A"
						autofocus
						class="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-base placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none"
					/>
					<button 
						type="button"
						onclick={parseInput}
						disabled={parsing || !nlInput.trim()}
						class="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
					>
						{parsing ? 'Parsing...' : 'Parse'}
					</button>
					{#if parseError}
						<p class="mt-1 text-xs text-red-500">{parseError}</p>
					{/if}
				</div>

				<!-- Hidden form fields -->
				<input type="hidden" name="start" value={startValue} />
				<input type="hidden" name="end" value={endValue} />
				<input type="hidden" name="ownerId" value={data.user.id} />
				<input type="hidden" name="calendarId" value={data.userSettings?.defaultCalendarId || ''} />
				<input type="hidden" name="location" value={form.location.value} />
				<input type="hidden" name="attendants" value={form.attendants.value.join(',')} />

				<!-- Form Fields Grid -->
				<div class="space-y-3">
					<!-- Title - Always visible -->
					<div class="relative">
						<label class="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
							<span>Title</span>
							{#if form.title.detected}
								<span class="text-green-600">✓ detected</span>
							{/if}
						</label>
						<input 
							type="text" 
							name="title"
							bind:value={form.title.value}
							oninput={() => handleFieldChange('title')}
							placeholder="Event title"
							required
							class="w-full rounded-lg border border-slate-200 px-3 py-2.5 {form.title.detected ? 'border-green-300 bg-green-50' : ''}"
						/>
					</div>

					<!-- Date -->
					<div class="relative" class:hidden={!form.date.visible && !allFieldsVisible}>
						<label class="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
							<span>Date</span>
							<button type="button" onclick={() => toggleField('date')} class="text-slate-400 hover:text-slate-600">
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
								</svg>
							</button>
						</label>
						<input 
							type="date" 
							bind:value={form.date.value}
							oninput={() => handleFieldChange('date')}
							class="w-full rounded-lg border border-slate-200 px-3 py-2.5"
						/>
					</div>

					<!-- Time Row -->
					<div class="grid grid-cols-2 gap-3">
						<!-- Start Time -->
						<div class="relative" class:hidden={!form.startTime.visible && !allFieldsVisible}>
							<label class="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
								<span>Start Time</span>
								<button type="button" onclick={() => toggleField('startTime')} class="text-slate-400 hover:text-slate-600">
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
									</svg>
								</button>
							</label>
							<input 
								type="time" 
								bind:value={form.startTime.value}
								oninput={() => handleFieldChange('startTime')}
								class="w-full rounded-lg border border-slate-200 px-3 py-2.5"
							/>
						</div>

						<!-- End Time -->
						<div class="relative" class:hidden={!form.endTime.visible && !allFieldsVisible}>
							<label class="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
								<span>End Time</span>
								<button type="button" onclick={() => toggleField('endTime')} class="text-slate-400 hover:text-slate-600">
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
									</svg>
								</button>
							</label>
							<input 
								type="time" 
								bind:value={form.endTime.value}
								oninput={() => handleFieldChange('endTime')}
								class="w-full rounded-lg border border-slate-200 px-3 py-2.5"
							/>
						</div>
					</div>

					<!-- Location -->
					<div class="relative" class:hidden={!form.location.visible && !allFieldsVisible}>
						<label class="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
							<span>Location</span>
							{#if form.location.detected}
								<span class="text-green-600">✓ detected</span>
							{/if}
							<button type="button" onclick={() => toggleField('location')} class="text-slate-400 hover:text-slate-600">
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
								</svg>
							</button>
						</label>
						<input 
							type="text" 
							bind:value={form.location.value}
							oninput={() => handleFieldChange('location')}
							placeholder="Where?"
							class="w-full rounded-lg border border-slate-200 px-3 py-2.5"
						/>
					</div>

					<!-- Description -->
					<div class="relative" class:hidden={!form.description.visible && !allFieldsVisible}>
						<label class="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
							<span>Description</span>
							<button type="button" onclick={() => toggleField('description')} class="text-slate-400 hover:text-slate-600">
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
								</svg>
							</button>
						</label>
						<textarea 
							bind:value={form.description.value}
							oninput={() => handleFieldChange('description')}
							placeholder="Details..."
							rows="2"
							class="w-full rounded-lg border border-slate-200 px-3 py-2.5 resize-none"
						></textarea>
					</div>

					<!-- Attendants -->
					<div class="relative" class:hidden={!form.attendants.visible && !allFieldsVisible}>
						<label class="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
							<span>Attendants</span>
							{#if form.attendants.detected}
								<span class="text-green-600">✓ detected</span>
							{/if}
						</label>
						<div class="relative">
							<button 
								type="button"
								onclick={() => showAttendantsDropdown = !showAttendantsDropdown}
								class="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left"
							>
								{#if form.attendants.value.length > 0}
									<span class="text-slate-900">{form.attendants.value.length} selected</span>
								{:else}
									<span class="text-slate-400">Select people...</span>
								{/if}
								<svg class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
								</svg>
							</button>
							
							{#if showAttendantsDropdown}
								<div class="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
									{#if familyMembers.length > 0}
										<div class="max-h-48 overflow-y-auto p-1">
											{#each familyMembers as member}
												<button 
													type="button"
													onclick={() => toggleAttendant(member)}
													class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50 {form.attendants.value.includes(member.id) ? 'bg-primary-50 text-primary-700' : ''}"
												>
													<div class="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-medium">
														{member.name?.charAt(0).toUpperCase() || '?'}
													</div>
													<div>
														<div class="text-sm font-medium">{member.name || 'Unnamed'}</div>
														{#if member.email}
															<div class="text-xs text-slate-500">{member.email}</div>
														{/if}
													</div>
													{#if form.attendants.value.includes(member.id)}
														<svg class="ml-auto h-4 w-4 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
															<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
														</svg>
													{/if}
												</button>
											{/each}
										</div>
									{:else}
										<div class="p-3 text-center text-sm text-slate-500">
											No family members found
										</div>
									{/if}
									<button 
										type="button"
										onclick={() => window.location.href = '/calendar/settings'}
										class="flex w-full items-center justify-center gap-2 border-t border-slate-100 p-2 text-sm text-primary-600 hover:bg-slate-50"
									>
										<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
										</svg>
										Add from contacts
									</button>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Action Buttons -->
				<div class="flex gap-3 mt-6">
					<button
						type="button"
						onclick={() => window.location.href = '/calendar/event/new'}
						class="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 hover:bg-slate-100"
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
						</svg>
						More Options
					</button>
					<button
						type="submit"
						disabled={loading || !form.title.value.trim()}
						class="flex-1 rounded-xl bg-primary-600 px-4 py-3 font-medium text-white hover:bg-primary-700 disabled:opacity-50"
					>
						{loading ? 'Creating...' : 'Create'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}