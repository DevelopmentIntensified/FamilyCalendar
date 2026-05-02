<script lang="ts">
	import { enhance } from '$app/forms';
	import { fly, fade } from 'svelte/transition';
	import { writable, get } from 'svelte/store';
	import { DateTime } from 'luxon';
	import type { PageData } from './$types';
	import Calendar from '$lib/components/calendar/Calendar.svelte';
	import LocationSearch from '$lib/components/LocationSearch.svelte';

	export let data: PageData;

	const currentDate = writable(DateTime.now());
	let showModal = false;
	let loading = false;
	let parseTimer: ReturnType<typeof setTimeout>;
	let startValue = '';
	let endValue = '';
	
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
		calendarId: string;
		attendants: { value: string[]; detected: boolean; userEdited: boolean; visible: boolean };
	} = {
		title: { value: '', detected: false, userEdited: false, visible: true },
		date: { value: '', detected: false, userEdited: false, visible: false },
		startTime: { value: '', detected: false, userEdited: false, visible: false },
		endTime: { value: '', detected: false, userEdited: false, visible: false },
		location: { value: '', detected: false, userEdited: false, visible: false },
		description: { value: '', detected: false, userEdited: false, visible: false },
		calendarId: data.userSettings?.defaultCalendarId || '',
		attendants: { value: [], detected: false, userEdited: false, visible: false }
	};
	
let allFieldsVisible = false;
	let showAttendantsDropdown = false;

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
		
		// Check if AI is disabled
		const useAI = data.userSettings?.autoParseEventDetails ?? true;
		const useCloud = data.userSettings?.useCloudAI ?? true;
		const useLocal = data.userSettings?.useLocalAI ?? true;
		
		if (!useAI) {
			parseError = 'AI parsing disabled in settings';
			showAllFields();
			parsing = false;
			return;
		}
		
		try {
			const res = await fetch('/api/parse-event', {
				method: 'POST',
				body: JSON.stringify({ 
					input: nlInput,
					useCloud,
					useLocal
				})
			});
			const result = await res.json();
			
			if (result.parsed) {
				parsedResult = result;
				applyParsedResult(result.parsed);
			} else if (result.error) {
				parseError = result.error || 'Could not understand input';
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
		// Always save raw input as description
		form.description.value = nlInput;
		form.description.detected = true;
		form.description.visible = true;
		form.description.userEdited = false;

		// Title - always visible
		if (parsed.title) {
			form.title.value = parsed.title;
			form.title.detected = true;
			form.title.visible = true;
			form.title.userEdited = false;
		}
		
		// Date
		if (parsed.date) {
			form.date.value = parsed.date;
			form.date.detected = true;
			form.date.visible = true;
			form.date.userEdited = false;
		}
		
		// Start time
		if (parsed.startTime && !parsed.allDay) {
			form.startTime.value = parsed.startTime;
			form.startTime.detected = true;
			form.startTime.visible = true;
			form.startTime.userEdited = false;
		}
		
		// End time
		if (parsed.endTime) {
			form.endTime.value = parsed.endTime;
			form.endTime.detected = true;
			form.endTime.visible = true;
			form.endTime.userEdited = false;
		}
		
		// Location
		if (parsed.location) {
			form.location.value = parsed.location;
			form.location.detected = true;
			form.location.visible = true;
			form.location.userEdited = false;
		}
		
		// Attendants - create entries for any names found
		if (parsed.attendants && parsed.attendants.length > 0) {
			form.attendants.value = parsed.attendants;
			form.attendants.detected = true;
			form.attendants.visible = true;
			form.attendants.userEdited = false;
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
		form.title.visible = true;
		form.date.visible = true;
		form.startTime.visible = true;
		form.endTime.visible = true;
		form.location.visible = true;
		form.description.visible = true;
		form.attendants.visible = true;
	}

	function hideAllExtra() {
		allFieldsVisible = false;
		form.title.visible = true;
		if (!form.date.detected && !form.date.userEdited) form.date.visible = false;
		if (!form.startTime.detected && !form.startTime.userEdited) form.startTime.visible = false;
		if (!form.endTime.detected && !form.endTime.userEdited) form.endTime.visible = false;
		if (!form.location.detected && !form.location.userEdited) form.location.visible = false;
		if (!form.description.detected && !form.description.userEdited) form.description.visible = false;
		if (!form.attendants.detected && !form.attendants.userEdited) form.attendants.visible = false;
	}

	function clearDetectedFields() {
		// Only clear fields that were detected and not user-edited
		if (form.title.detected && !form.title.userEdited) {
			form.title.value = '';
			form.title.detected = false;
		}
		if (form.date.detected && !form.date.userEdited) {
			form.date.value = '';
			form.date.detected = false;
		}
		if (form.startTime.detected && !form.startTime.userEdited) {
			form.startTime.value = '';
			form.startTime.detected = false;
		}
		if (form.endTime.detected && !form.endTime.userEdited) {
			form.endTime.value = '';
			form.endTime.detected = false;
		}
		if (form.location.detected && !form.location.userEdited) {
			form.location.value = '';
			form.location.detected = false;
		}
		if (form.description.detected && !form.description.userEdited) {
			form.description.value = '';
			form.description.detected = false;
		}
		if (form.attendants.detected && !form.attendants.userEdited) {
			form.attendants.value = [];
			form.attendants.detected = false;
		}
		
		// Also clear parsed result
		parsedResult = null;
		parseError = '';
	}

	function onNlInput() {
		clearTimeout(parseTimer);
		if (!nlInput.trim()) {
			clearDetectedFields();
		} else {
			parseTimer = setTimeout(parseInput, 300);
		}
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
	class="fixed bottom-24 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-primary-600 shadow-xl shadow-primary-400/50 hover:bg-primary-700 hover:scale-105 transition-all"
	title="Quick Add Event"
>
	<svg class="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
	</svg>
</button>

<!-- Quick Add Modal -->
{#if showModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4" transition:fade={{ duration: 100 }}>
		<button class="absolute inset-0 bg-black/40" onclick={close}></button>
		
		<div class="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl" transition:fly={{ y: 10, duration: 150 }}>
			<form method="POST" action="/calendar/event/new?/createEvent" use:enhance={() => { loading = true; return async ({ update }) => { await update(); close(); }; }} class="p-6">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-lg font-bold text-slate-900">New Event</h2>
					<button type="button" onclick={close} class="text-slate-400 hover:text-slate-600">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<!-- NL Input -->
				<div class="mb-4 relative">
					<div class="relative">
						<input
							type="text"
							bind:value={nlInput}
							oninput={onNlInput}
							placeholder="Try: Lunch Friday at noon with John in Conference A"
							autofocus
							class="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 pr-10 text-base placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none"
						/>
						{#if nlInput}
							<button
								type="button"
								onclick={() => { nlInput = ''; clearDetectedFields(); }}
								class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
								title="Clear input"
							>
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						{/if}
					</div>
					{#if parsing}
						<p class="mt-1 text-xs text-primary-600">Parsing...</p>
					{/if}
					{#if parseError}
						<p class="mt-1 text-xs text-red-500">{parseError}</p>
					{/if}
				</div>

				<!-- Hidden form fields -->
				<input type="hidden" name="start" value={startValue} />
				<input type="hidden" name="end" value={endValue} />
				<input type="hidden" name="ownerId" value={data.user.id} />
				<input type="hidden" name="calendarId" value={form.calendarId} />
				<input type="hidden" name="location" value={form.location.value} />
				<input type="hidden" name="description" value={form.description.value} />
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
						<label class="flex items-center text-xs font-medium text-slate-500 mb-1">
							<span>Date</span>
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
							<label class="flex items-center text-xs font-medium text-slate-500 mb-1">
								<span>Start Time</span>
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
							<label class="flex items-center text-xs font-medium text-slate-500 mb-1">
								<span>End Time</span>
							</label>
							<input 
								type="time" 
								bind:value={form.endTime.value}
								oninput={() => handleFieldChange('endTime')}
								class="w-full rounded-lg border border-slate-200 px-3 py-2.5"
							/>
						</div>
					</div>
					
					<!-- All Day Checkbox (visible when show more is expanded) -->
					{#if allFieldsVisible}
						<div class="flex items-center gap-2" class:hidden={form.startTime.value || form.endTime.value}>
							<input 
								type="checkbox" 
								id="allDay"
								checked={form.title.value.includes('all day')}
								onchange={(e) => {
									if (e.currentTarget.checked && !form.title.value.includes('all day')) {
										form.title.value = form.title.value + ' all day';
										form.title.userEdited = true;
									} else if (!e.currentTarget.checked && form.title.value.includes('all day')) {
										form.title.value = form.title.value.replace(/\s*all day\s*$/, '');
										form.title.userEdited = true;
									}
								}}
								class="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
							/>
							<label for="allDay" class="text-sm text-slate-700">All Day Event</label>
						</div>
					{/if}

<!-- Location -->
					<div class="relative" class:hidden={!form.location.visible && !allFieldsVisible}>
						<label class="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
							<span>Location</span>
							{#if form.location.detected}
								<span class="text-green-600">✓ detected</span>
							{/if}
						</label>
						<LocationSearch bind:value={form.location.value} />
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
								</div>
							{/if}
						</div>
					</div>

					<!-- Calendar Selection -->
					{#if data.calendarIds && data.calendarIds.length > 1}
						<div class="relative" class:hidden={!allFieldsVisible}>
							<label class="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
								<span>Calendar</span>
							</label>
							<select
								bind:value={form.calendarId}
								class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
							>
								{#each data.calendarIds as cal}
									<option value={cal.id}>{cal.name}</option>
								{/each}
							</select>
						</div>
					{/if}
				</div>

				<!-- Expand/Collapse Button -->
				<button type="button" onclick={() => allFieldsVisible ? hideAllExtra() : showAllFields()} class="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 font-medium text-slate-600 hover:bg-slate-50 transition-colors mt-3">
					<svg class="h-4 w-4 transition-transform {allFieldsVisible ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
					{allFieldsVisible ? 'Show Less' : 'More Options'}
				</button>
				
				<!-- Create Button -->
					<button type="submit" disabled={loading || !form.title.value.trim()} class="w-full rounded-xl bg-primary-600 px-4 py-3 font-medium text-white hover:bg-primary-700 disabled:opacity-50 mt-3 transition-colors">
						{loading ? 'Creating...' : 'Create Event'}
					</button>
			</form>
		</div>
	</div>
{/if}
