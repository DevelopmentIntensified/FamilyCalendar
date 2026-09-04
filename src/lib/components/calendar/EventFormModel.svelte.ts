import { DateTime } from 'luxon';
import type { RSVPStatus } from '$lib/types';
import type { ParsedEvent as ParsedEventNlp } from '$lib/server/services/naturalLanguageService';

export type NlpFormInput = Partial<ParsedEventNlp> & { endDate?: string };

export interface ParsedEvent {
	title?: string;
	date?: string;
	startTime?: string;
	endTime?: string;
	endDate?: string;
	location?: string;
	attendants?: string[];
	allDay?: boolean;
}

export interface FormEventData {
	title: string;
	start: string;
	end: string | null;
	location: string;
	description: string;
	calendarId: string;
	allDay: boolean;
	attendants: string[];
	/** Structured invites: { value, isUser, inviteType } per selected attendee. */
	attendees?: { value: string; isUser: boolean; inviteType: 'required' | 'optional' }[];
	recurrenceFrequency: string | null;
	recurrenceInterval: number | null;
	recurrenceByDay?: string[] | null;
	recurrenceCount?: number | null;
	recurrenceUntil?: string | null;
	reminderMinutes?: number | null;
}

function loadRecentAttendants(): string[] {
	try {
		const stored = localStorage.getItem('recent_attendants');
		return stored ? JSON.parse(stored) : [];
	} catch {
		return [];
	}
}

function saveRecentAttendantsToStorage(recent: string[], familyMemberIds: Set<string>) {
	const toSave = recent.filter(r => !familyMemberIds.has(r));
	try {
		localStorage.setItem('recent_attendants', JSON.stringify(toSave));
	} catch { /* ignore */ }
}

interface InitialEvent {
	id: string;
	title: string;
	description: string;
	location: string;
	calendarId: string;
	start: string | Date;
	end?: string | Date | null;
	allDay: boolean;
	attendants?: string[];
	/** Structured invites on edit (value + member flag + required/optional). */
	attendees?: { value: string; isUser: boolean; inviteType?: string }[];
	recurrenceFrequency?: string | null;
	recurrenceInterval?: number | null;
	recurrenceByDay?: string[] | null;
	recurrenceCount?: number | null;
	recurrenceUntil?: string | null;
	reminderMinutes?: number | null;
	masterId?: string;
	occurrenceDate?: string;
}

interface EventFormConfig {
	calendars: { id: string; name: string; color?: string }[];
	familyMembers: { userId: string; firstName?: string; lastName?: string; email: string }[];
	defaultCalendarId?: string | null;
	initialEvent?: InitialEvent;
	initialDate?: string;
}

/** Map parser recurrence tokens to form frequency + interval. */
function mapRecurringToFrequency(recurring: string): { frequency: string; interval: number } | null {
	if (recurring === 'biweekly') return { frequency: 'weekly', interval: 2 };
	const every = recurring.match(/^every_(\d+)_(days?|weeks?|months?|years?)$/);
	if (every) {
		const n = Math.max(1, parseInt(every[1]));
		const unit = every[2].toLowerCase();
		const frequency = unit.startsWith('day')
			? 'daily'
			: unit.startsWith('week')
				? 'weekly'
				: unit.startsWith('month')
					? 'monthly'
					: 'yearly';
		return { frequency, interval: n };
	}
	if (['daily', 'weekly', 'monthly', 'yearly'].includes(recurring)) {
		return { frequency: recurring, interval: 1 };
	}
	return null;
}

export function createEventForm(config: EventFormConfig) {
	const familyMemberIds = new Set(config.familyMembers.map(m => m.userId));

	let title = $state('');
	let date = $state('');
	let startTime = $state('');
	let endTime = $state('');
	let allDay = $state(false);
	let multiDay = $state(false);
	let endDate = $state('');
	let location = $state('');
	let description = $state('');
	let selectedCalendarId = $state('');
	let attendants = $state<string[]>([]);
	let inviteTypes = $state<Record<string, 'required' | 'optional'>>({});
	let recurrenceFrequency = $state<string | null>(null);
	let recurrenceInterval = $state(1);
	let recurrenceByDay = $state<string[] | null>(null);
	let recurrenceCount = $state<number | null>(null);
	let recurrenceUntil = $state<string | null>(null);
	let reminderMinutes = $state<number | null>(null);
	let recentAttendants = $state<string[]>(loadRecentAttendants());

	let userTouchedFields = $state<Record<string, boolean>>({});
	let nlpDetectedFields = $state<Record<string, boolean>>({});
	let lastNlpValues = $state<Record<string, any>>({});

	function initializeCalendar() {
		const { initialEvent, calendars, defaultCalendarId } = config;
		if (initialEvent) {
			selectedCalendarId = initialEvent.calendarId || (calendars.length > 0 ? calendars[0].id : '');
		} else if (defaultCalendarId && calendars.some(c => c.id === defaultCalendarId)) {
			selectedCalendarId = defaultCalendarId;
		} else if (calendars.length > 0) {
			selectedCalendarId = calendars[0].id;
		}
	}

	function populateFromEvent() {
		const { initialEvent } = config;
		if (!initialEvent) return;

		title = initialEvent.title || '';
		description = initialEvent.description || '';
		location = initialEvent.location || '';
		initializeCalendar();

		if (initialEvent.start) {
			const dt = initialEvent.start instanceof Date ? DateTime.fromJSDate(initialEvent.start) : DateTime.fromISO(initialEvent.start);
			date = dt.toFormat('yyyy-MM-dd');
			startTime = dt.toFormat('HH:mm');
			allDay = initialEvent.allDay || false;
		}
		if (initialEvent.end) {
			const endDt = initialEvent.end instanceof Date ? DateTime.fromJSDate(initialEvent.end) : DateTime.fromISO(initialEvent.end);
			endTime = endDt.toFormat('HH:mm');
			if (endDt.toFormat('yyyy-MM-dd') !== date) {
				multiDay = true;
				endDate = endDt.toFormat('yyyy-MM-dd');
			}
		}
		if (initialEvent.attendants && Array.isArray(initialEvent.attendants)) {
			attendants = [...initialEvent.attendants];
		}
		if (initialEvent.attendees && Array.isArray(initialEvent.attendees)) {
			attendants = initialEvent.attendees.map((a) => a.value);
			const types: Record<string, 'required' | 'optional'> = {};
			for (const a of initialEvent.attendees) {
				if (a.isUser) types[a.value] = a.inviteType === 'required' ? 'required' : 'optional';
			}
			inviteTypes = types;
		}
		recurrenceFrequency = initialEvent.recurrenceFrequency || null;
		recurrenceInterval = initialEvent.recurrenceInterval ?? 1;
		recurrenceByDay = initialEvent.recurrenceByDay ?? null;
		recurrenceCount = initialEvent.recurrenceCount ?? null;
		recurrenceUntil = initialEvent.recurrenceUntil ?? null;
		reminderMinutes =
			typeof initialEvent.reminderMinutes === 'number' && initialEvent.reminderMinutes > 0
				? Math.floor(initialEvent.reminderMinutes)
				: null;
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
			inviteTypes = {};
			nlpDetectedFields.attendants = false;
		}
		lastNlpValues = {};
	}

	function arraysEqual(a: string[], b: string[]) {
		if (a.length !== b.length) return false;
		return a.every((v, i) => v === b[i]);
	}

	function saveRecentAttendants() {
		const nonUserAtts = attendants.filter(a => !a.includes('@') && a.length < 50 && !familyMemberIds.has(a));
		const existing = new Set(recentAttendants);
		const toAdd = nonUserAtts.filter(a => !existing.has(a));
		if (toAdd.length > 0) {
			recentAttendants = [...recentAttendants, ...toAdd].slice(-20);
			saveRecentAttendantsToStorage(recentAttendants, familyMemberIds);
		}
	}

	function toTimestamp(dateStr: string, timeStr: string, isAllDay: boolean): string | null {
		if (!dateStr) return null;
		if (timeStr && !isAllDay) {
			return DateTime.fromFormat(`${dateStr} ${timeStr}`, 'yyyy-MM-dd HH:mm').toISO();
		}
		return DateTime.fromFormat(dateStr, 'yyyy-MM-dd').startOf('day').toISO();
	}

	// Initialize
	initializeCalendar();
	populateFromEvent();

	if (!config.initialEvent && config.initialDate) {
		date = config.initialDate;
		userTouchedFields.date = true;
	}

	return {
		get title() { return title; },
		set title(v: string) { title = v; },

		get date() { return date; },
		set date(v: string) { date = v; },

		get startTime() { return startTime; },
		set startTime(v: string) { startTime = v; },

		get endTime() { return endTime; },
		set endTime(v: string) { endTime = v; },

		get endDate() { return endDate; },
		set endDate(v: string) { endDate = v; },

		get allDay() { return allDay; },
		set allDay(v: boolean) { allDay = v; },

		get multiDay() { return multiDay; },
		set multiDay(v: boolean) { multiDay = v; },

		get location() { return location; },
		set location(v: string) { location = v; },

		get description() { return description; },
		set description(v: string) { description = v; },

		get selectedCalendarId() { return selectedCalendarId; },
		set selectedCalendarId(v: string) { selectedCalendarId = v; },

		get attendants() { return attendants; },
		set attendants(v: string[]) { attendants = v; },

		get inviteTypes() { return inviteTypes; },

		get recurrenceFrequency() { return recurrenceFrequency; },
		set recurrenceFrequency(v: string | null) { recurrenceFrequency = v; },

		get recurrenceInterval() { return recurrenceInterval; },
		set recurrenceInterval(v: number) { recurrenceInterval = Math.max(1, Math.floor(v) || 1); },

		get recurrenceByDay() { return recurrenceByDay; },
		get recurrenceCount() { return recurrenceCount; },
		get recurrenceUntil() { return recurrenceUntil; },

		get reminderMinutes() { return reminderMinutes; },
		set reminderMinutes(v: number | null) {
			reminderMinutes = typeof v === 'number' && v > 0 ? Math.floor(v) : null;
			this.markTouched('reminderMinutes');
		},

		get reminderSelectValue() {
			return reminderMinutes == null ? '' : String(reminderMinutes);
		},
		set reminderSelectValue(v: string) {
			const n = v === '' ? NaN : parseInt(v);
			reminderMinutes = Number.isFinite(n) && (n as number) > 0 ? Math.floor(n as number) : null;
			this.markTouched('reminderMinutes');
		},

		get isRecurringOccurrence() {
			return !!(config.initialEvent?.recurrenceFrequency && config.initialEvent?.occurrenceDate);
		},

		get occurrenceDate() { return config.initialEvent?.occurrenceDate || null; },

		get endBeforeStart() {
			if (allDay || !date || !endTime) return false;
			const endDateStr = multiDay && endDate ? endDate : date;
			const startDt = DateTime.fromFormat(`${date} ${startTime || '00:00'}`, 'yyyy-MM-dd HH:mm');
			const endDt = DateTime.fromFormat(`${endDateStr} ${endTime}`, 'yyyy-MM-dd HH:mm');
			if (!startDt.isValid || !endDt.isValid) return false;
			return endDt.valueOf() < startDt.valueOf();
		},

		get masterId() { return config.initialEvent?.masterId || config.initialEvent?.id || null; },

		get recentAttendants() { return recentAttendants; },

		get isEditMode() { return !!config.initialEvent; },

		get eventId() { return config.initialEvent?.id || null; },

		markTouched(field: string) {
			userTouchedFields[field] = true;
		},

		isDetected(field: string) {
			return nlpDetectedFields[field] && !userTouchedFields[field];
		},

		toggleAttendant(value: string) {
			if (attendants.includes(value)) {
				attendants = attendants.filter(a => a !== value);
				const next = { ...inviteTypes };
				delete next[value];
				inviteTypes = next;
			} else {
				attendants = [...attendants, value];
				if (familyMemberIds.has(value)) {
					inviteTypes = { ...inviteTypes, [value]: 'optional' };
				}
			}
			this.markTouched('attendants');
		},

		setInviteType(value: string, type: 'required' | 'optional') {
			if (!attendants.includes(value)) return;
			inviteTypes = { ...inviteTypes, [value]: type };
			this.markTouched('attendants');
		},

		/** Seed attendants + invite types from an event's attendance rows
		 * (used when the edit form opens and invite data isn't yet known). */
		prefillInvites(rows: Array<{ userId?: string | null; name?: string | null; inviteType?: string | null }>) {
			if (!Array.isArray(rows)) return;
			const values = rows
				.map((r) => r.userId || r.name)
				.filter((v): v is string => !!v)
				.filter((v, i, arr) => arr.indexOf(v) === i);
			const types: Record<string, 'required' | 'optional'> = {};
			for (const r of rows) {
				if (r.userId) types[r.userId] = r.inviteType === 'required' ? 'required' : 'optional';
			}
			attendants = values;
			inviteTypes = types;
			userTouchedFields.attendants = true;
		},

		applyNlpResult(parsed: NlpFormInput) {
			if (!parsed) return;
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
			if (parsed.recurring && recurrenceFrequency == null) {
				const mapped = mapRecurringToFrequency(parsed.recurring);
				if (mapped) {
					recurrenceFrequency = mapped.frequency;
					recurrenceInterval = mapped.interval;
					nlpDetectedFields.recurrence = true;
					lastNlpValues.recurrence = parsed.recurring;
					if (Array.isArray(parsed.recurringByDay) && parsed.recurringByDay.length > 0) {
						recurrenceByDay = [...parsed.recurringByDay];
					}
					if (typeof parsed.recurringCount === 'number') {
						recurrenceCount = Math.max(1, Math.floor(parsed.recurringCount));
					}
					if (parsed.recurringUntil) {
						recurrenceUntil = parsed.recurringUntil;
					}
				}
			}
			if (typeof parsed.reminderMinutes === 'number' && reminderMinutes == null) {
				reminderMinutes = parsed.reminderMinutes;
			}
		},

		toEventData(): FormEventData | null {
			if (!title || !date) return null;

			// Title + date alone is a complete event: with no start time it
			// saves all-day rather than demanding times.
			const effectiveAllDay = allDay || !startTime;
			const startTimestamp = toTimestamp(date, effectiveAllDay ? '' : startTime, effectiveAllDay) || '';
			let endTimestamp: string | null = null;

			if (multiDay && endDate) {
				endTimestamp = toTimestamp(endDate, endTime, effectiveAllDay);
				if (!endTimestamp && endTime && !effectiveAllDay) {
					endTimestamp = DateTime.fromFormat(`${endDate} ${endTime}`, 'yyyy-MM-dd HH:mm').toISO();
				} else if (!endTimestamp) {
					endTimestamp = DateTime.fromFormat(endDate, 'yyyy-MM-dd').endOf('day').toISO();
				}
			} else if (endTime && !effectiveAllDay) {
				endTimestamp = DateTime.fromFormat(`${date} ${endTime}`, 'yyyy-MM-dd HH:mm').toISO();
			} else if (!multiDay && !endTime && !effectiveAllDay) {
				const startDt = DateTime.fromFormat(`${date} ${startTime || '09:00'}`, 'yyyy-MM-dd HH:mm');
				endTimestamp = startDt.plus({ hours: 1 }).toISO();
			}

		return {
			title,
			start: startTimestamp,
			end: endTimestamp,
			location,
			description,
			calendarId: selectedCalendarId,
			allDay: effectiveAllDay,
			attendants: [...attendants],
			attendees: attendants.map((value) => ({
				value,
				isUser: familyMemberIds.has(value),
				inviteType: inviteTypes[value] ?? 'optional'
			})),
			recurrenceFrequency,
			recurrenceInterval: recurrenceFrequency ? recurrenceInterval : null,
			recurrenceByDay: recurrenceFrequency ? recurrenceByDay : null,
			recurrenceCount: recurrenceFrequency ? recurrenceCount : null,
			recurrenceUntil: recurrenceFrequency ? recurrenceUntil : null,
			reminderMinutes
		};
		},

		submitPreparation(): FormEventData | null {
			if (this.endBeforeStart) return null;
			saveRecentAttendants();
			return this.toEventData();
		},

		reset() {
			title = '';
			date = '';
			startTime = '';
			endTime = '';
			endDate = '';
			location = '';
			description = '';
			attendants = [];
			inviteTypes = {};
			allDay = false;
			multiDay = false;
			recurrenceFrequency = null;
			recurrenceInterval = 1;
			recurrenceByDay = null;
			recurrenceCount = null;
			recurrenceUntil = null;
			reminderMinutes = null;
			userTouchedFields = {};
			nlpDetectedFields = {};
			lastNlpValues = {};
		}
	};
}
