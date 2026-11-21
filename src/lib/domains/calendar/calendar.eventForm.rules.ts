/**
 * The event form's pure half: the field shape, the create/edit body the form
 * submits, the parser merge and the multi-date shift. Ported from
 * `EventFormModel.svelte.ts` (whose runes state lives in
 * `calendar.eventForm.state.svelte.ts`).
 *
 * These are the legacy rules, unchanged: Title + date is a complete event (no
 * start time means all-day), a multi-day end defaults to end-of-day, a timed
 * event without an end gets +1 hour, recurrence columns only travel while a
 * frequency is set, and invites are replaced only once they actually loaded
 * (an edit that never loaded its invites must not send `attendees: []`).
 *
 * Doc: ./README.md#invariants
 */
import { DateTime } from 'luxon';

/** One event form's values, exactly as the fields hold them. */
export interface CalendarEventFormFields {
	title: string;
	date: string;
	startTime: string;
	endTime: string;
	endDate: string;
	location: string;
	description: string;
	selectedCalendarId: string;
	allDay: boolean;
	multiDay: boolean;
	attendants: string[];
	inviteTypes: Record<string, 'required' | 'optional'>;
	recurrenceFrequency: string | null;
	recurrenceInterval: number;
	recurrenceByDay: string[] | null;
	recurrenceCount: number | null;
	recurrenceUntil: string | null;
	reminderMinutes: number | null;
}

/** The body `POST /api/events` (and `PUT`) receives from the form. */
export interface CalendarEventBody {
	title: string;
	start: string;
	end: string | null;
	location: string;
	description: string;
	calendarId: string;
	allDay: boolean;
	attendants?: string[];
	attendees?: { value: string; isUser: boolean; inviteType: 'required' | 'optional' }[];
	recurrenceFrequency: string | null;
	recurrenceInterval: number | null;
	recurrenceByDay: string[] | null;
	recurrenceCount: number | null;
	recurrenceUntil: string | null;
	reminderMinutes: number | null;
}

/** What the parser hands back, field by field (legacy `NlpFormInput`). */
export interface CalendarNlpInput {
	title?: string;
	date?: string;
	startTime?: string;
	endTime?: string;
	endDate?: string;
	location?: string;
	attendants?: string[];
	allDay?: boolean;
	recurring?: string;
	recurringByDay?: string[];
	recurringCount?: number | null;
	recurringUntil?: string | null;
	reminderMinutes?: number | null;
	dates?: string[];
	calendarName?: string;
}

/** The form as a whole: values, which the user touched, which the parser filled. */
export interface CalendarFormDraft {
	fields: CalendarEventFormFields;
	touched: Record<string, boolean>;
	detected: Record<string, boolean>;
	/** The parser's last value per field, so a Quick Add change can undo it. */
	lastNlp: CalendarNlpInput;
}

/** An empty form, with the calendar chosen by the caller. */
export function calendarEmptyForm(fields: Partial<CalendarEventFormFields> = {}): CalendarEventFormFields {
	return {
		title: '',
		date: '',
		startTime: '',
		endTime: '',
		endDate: '',
		location: '',
		description: '',
		selectedCalendarId: '',
		allDay: false,
		multiDay: false,
		attendants: [],
		inviteTypes: {},
		recurrenceFrequency: null,
		recurrenceInterval: 1,
		recurrenceByDay: null,
		recurrenceCount: null,
		recurrenceUntil: null,
		reminderMinutes: null,
		...fields
	};
}

/**
 * The form for an existing event. The calendar keeps its own id only while it
 * is still visible; a stale id falls back to the first visible calendar.
 */
export function calendarFormFromEvent(
	event: {
		title?: string | null;
		description?: string | null;
		location?: string | null;
		calendarId?: string | null;
		start?: string | Date | null;
		end?: string | Date | null;
		allDay?: boolean | null;
		attendants?: readonly string[] | null;
		attendees?: readonly { value: string; isUser: boolean; inviteType?: string | null }[] | null;
		recurrenceFrequency?: string | null;
		recurrenceInterval?: number | null;
		recurrenceByDay?: readonly string[] | null;
		recurrenceCount?: number | null;
		recurrenceUntil?: string | null;
		reminderMinutes?: number | null;
	},
	calendars: readonly { id: string; name: string }[],
	defaultCalendarId?: string | null
): { fields: CalendarEventFormFields; invitedUserIds: string[] } {
	const fields = calendarEmptyForm();
	fields.title = event.title || '';
	fields.description = event.description || '';
	fields.location = event.location || '';
	fields.selectedCalendarId =
		event.calendarId && calendars.some((calendar) => calendar.id === event.calendarId)
			? event.calendarId
			: calendars.length > 0
				? calendars[0].id
				: '';

	if (event.start) {
		const start = DateTime.fromJSDate(new Date(event.start));
		if (start.isValid) {
			fields.date = start.toFormat('yyyy-MM-dd');
			fields.startTime = start.toFormat('HH:mm');
			fields.allDay = event.allDay || false;
		}
	}
	if (event.end) {
		const end = DateTime.fromJSDate(new Date(event.end));
		if (end.isValid) {
			fields.endTime = end.toFormat('HH:mm');
			if (end.toFormat('yyyy-MM-dd') !== fields.date) {
				fields.multiDay = true;
				fields.endDate = end.toFormat('yyyy-MM-dd');
			}
		}
	}
	if (event.attendants && Array.isArray(event.attendants)) {
		fields.attendants = [...event.attendants];
	}
	const invitedUserIds: string[] = [];
	if (event.attendees && Array.isArray(event.attendees)) {
		fields.attendants = event.attendees.map((attendee) => attendee.value);
		const types: Record<string, 'required' | 'optional'> = {};
		for (const attendee of event.attendees) {
			if (!attendee.isUser) continue;
			types[attendee.value] = attendee.inviteType === 'required' ? 'required' : 'optional';
			invitedUserIds.push(attendee.value);
		}
		fields.inviteTypes = types;
	}
	fields.recurrenceFrequency = event.recurrenceFrequency || null;
	fields.recurrenceInterval = event.recurrenceInterval ?? 1;
	fields.recurrenceByDay = event.recurrenceByDay ? [...event.recurrenceByDay] : null;
	fields.recurrenceCount = event.recurrenceCount ?? null;
	fields.recurrenceUntil = event.recurrenceUntil ?? null;
	fields.reminderMinutes =
		event.reminderMinutes != null && event.reminderMinutes > 0
			? Math.floor(event.reminderMinutes)
			: null;

	if (!event.title && !event.start && defaultCalendarId) {
		// A blank create form takes the explicit default, then the first calendar.
		if (calendars.some((calendar) => calendar.id === defaultCalendarId)) {
			fields.selectedCalendarId = defaultCalendarId;
		}
	}
	return { fields, invitedUserIds };
}

/** `biweekly` / `every_3_weeks` / a bare frequency → the picker's pair. */
export function calendarNlpFrequency(
	recurring: string
): { frequency: string; interval: number } | null {
	if (recurring === 'biweekly') return { frequency: 'weekly', interval: 2 };
	const every = recurring.match(/^every_(\d+)_(days?|weeks?|months?|years?)$/);
	if (every) {
		const interval = Math.max(1, parseInt(every[1], 10));
		const unit = every[2].toLowerCase();
		const frequency = unit.startsWith('day')
			? 'daily'
			: unit.startsWith('week')
				? 'weekly'
				: unit.startsWith('month')
					? 'monthly'
					: 'yearly';
		return { frequency, interval };
	}
	if (['daily', 'weekly', 'monthly', 'yearly'].includes(recurring)) {
		return { frequency: recurring, interval: 1 };
	}
	return null;
}

/** `date` + `time` on the viewer's clock; all-day takes the day's midnight. */
export function calendarTimestamp(
	date: string,
	time: string,
	isAllDay: boolean
): string | null {
	if (!date) return null;
	if (time && !isAllDay) {
		return DateTime.fromFormat(`${date} ${time}`, 'yyyy-MM-dd HH:mm').toISO();
	}
	return DateTime.fromFormat(date, 'yyyy-MM-dd').startOf('day').toISO();
}

/** The end time lands before the start time on the same day. */
export function calendarEndBeforeStart(fields: CalendarEventFormFields): boolean {
	if (fields.allDay || !fields.date || !fields.endTime) return false;
	const endDate = fields.multiDay && fields.endDate ? fields.endDate : fields.date;
	const start = DateTime.fromFormat(
		`${fields.date} ${fields.startTime || '00:00'}`,
		'yyyy-MM-dd HH:mm'
	);
	const end = DateTime.fromFormat(`${endDate} ${fields.endTime}`, 'yyyy-MM-dd HH:mm');
	if (!start.isValid || !end.isValid) return false;
	return end.valueOf() < start.valueOf();
}

/** The end date lands before the start date (a pure date comparison). */
export function calendarEndDateBeforeStart(fields: CalendarEventFormFields): boolean {
	if (!fields.multiDay || !fields.date || !fields.endDate) return false;
	return fields.endDate < fields.date;
}

/** Title + date, with the end checks passing — the submit button's gate. */
export function calendarCanSubmit(fields: CalendarEventFormFields): boolean {
	return (
		!!fields.title &&
		!!fields.date &&
		!calendarEndBeforeStart(fields) &&
		!calendarEndDateBeforeStart(fields)
	);
}

/**
 * The submit body, or null without a title/date. Invites travel only once they
 * loaded (or on a create), because the server treats any attendee array as
 * "replace all invitations".
 */
export function calendarEventBody(
	fields: CalendarEventFormFields,
	options: { isEdit: boolean; invitesLoaded: boolean; isMember: (value: string) => boolean }
): CalendarEventBody | null {
	if (!fields.title || !fields.date) return null;

	const effectiveAllDay = fields.allDay || !fields.startTime;
	const start = calendarTimestamp(fields.date, effectiveAllDay ? '' : fields.startTime, effectiveAllDay) || '';
	let end: string | null = null;

	if (fields.multiDay && fields.endDate) {
		end = calendarTimestamp(fields.endDate, fields.endTime, effectiveAllDay);
		if (!end && fields.endTime && !effectiveAllDay) {
			end = DateTime.fromFormat(`${fields.endDate} ${fields.endTime}`, 'yyyy-MM-dd HH:mm').toISO();
		} else if (!end) {
			end = DateTime.fromFormat(fields.endDate, 'yyyy-MM-dd').endOf('day').toISO();
		}
	} else if (fields.endTime && !effectiveAllDay) {
		end = DateTime.fromFormat(`${fields.date} ${fields.endTime}`, 'yyyy-MM-dd HH:mm').toISO();
	} else if (!fields.multiDay && !fields.endTime && !effectiveAllDay) {
		const startAt = DateTime.fromFormat(
			`${fields.date} ${fields.startTime || '09:00'}`,
			'yyyy-MM-dd HH:mm'
		);
		end = startAt.plus({ hours: 1 }).toISO();
	}

	const includeAttendees =
		fields.attendants.length > 0 || options.invitesLoaded || !options.isEdit;
	const body: CalendarEventBody = {
		title: fields.title,
		start,
		end,
		location: fields.location,
		description: fields.description,
		calendarId: fields.selectedCalendarId,
		allDay: effectiveAllDay,
		recurrenceFrequency: fields.recurrenceFrequency,
		recurrenceInterval: fields.recurrenceFrequency ? fields.recurrenceInterval : null,
		recurrenceByDay: fields.recurrenceFrequency ? fields.recurrenceByDay : null,
		recurrenceCount: fields.recurrenceFrequency ? fields.recurrenceCount : null,
		recurrenceUntil: fields.recurrenceFrequency ? fields.recurrenceUntil : null,
		reminderMinutes: fields.reminderMinutes
	};
	if (includeAttendees) {
		body.attendants = [...fields.attendants];
		body.attendees = fields.attendants.map((value) => ({
			value,
			isUser: options.isMember(value),
			inviteType: fields.inviteTypes[value] ?? 'optional'
		}));
	}
	return body;
}

const ACTION_WHAT = {
	create: "Couldn't create the event",
	save: "Couldn't save your changes",
	duplicate: "Couldn't duplicate the event",
	delete: "Couldn't delete the event"
} as const;

/**
 * The modal's failure sentence: the server's own message when it has one, and
 * otherwise what failed plus the next step the status implies (legacy
 * `utils/actionError.ts`, #195).
 */
export function calendarActionErrorCopy(
	action: keyof typeof ACTION_WHAT,
	serverMessage?: string | null,
	status?: number
): string {
	if (serverMessage) return serverMessage;
	const what = ACTION_WHAT[action];
	if (status === 401 || status === 403) {
		return `${what}. Your session expired. Sign in, then try again.`;
	}
	if (status === undefined || status >= 500) {
		return `${what}. Check your connection (a VPN can block it), then try again.`;
	}
	return `${what}. Check the details you entered, then try again.`;
}

/**
 * Multi-date quick-add (`sept 23 & 30`): every occurrence after the first, the
 * offsets applied from the parsed base date so a user-edited form date shifts
 * the whole set together. Dates go through Luxon `toISO()` in the HOST zone,
 * exactly like legacy (`EventFormModel.svelte.ts:36-56` at 66a11131) — the
 * suite's `TZ=UTC` therefore renders `+00:00`, not `Z`.
 */
export function calendarShiftEventDates(
	body: CalendarEventBody,
	parsedDates: readonly string[] | undefined
): CalendarEventBody[] {
	const extraDates =
		parsedDates && parsedDates.length > 1 && parsedDates[0] ? parsedDates.slice(1) : [];
	if (extraDates.length === 0 || !parsedDates?.[0] || !body.start) return [];
	const baseDay = DateTime.fromISO(parsedDates[0]).startOf('day');
	const shift = (iso: string, days: number) =>
		DateTime.fromISO(iso).plus({ days }).toISO() ?? iso;
	return extraDates.map((date) => {
		const offset = Math.round(
			DateTime.fromISO(date).startOf('day').diff(baseDay, 'days').days
		);
		return {
			...body,
			start: shift(body.start, offset),
			end: body.end ? shift(body.end, offset) : body.end
		};
	});
}

/**
 * Merge one parse into the draft. Values the user touched are never
 * overwritten; fields the previous parse filled and the user did not touch are
 * cleared first, so a new phrase replaces the last one instead of stacking.
 */
export function calendarApplyParse(
	draft: CalendarFormDraft,
	parsed: CalendarNlpInput | null
): CalendarFormDraft {
	if (!parsed) return draft;
	const { fields, cleared } = calendarClearDetected(draft);
	const touched = draft.touched;
	const detected: Record<string, boolean> = { ...draft.detected };
	for (const field of cleared) delete detected[field];
	const lastNlp: CalendarNlpInput = {};

	if (parsed.title && !touched.title) {
		fields.title = parsed.title;
		detected.title = true;
		lastNlp.title = parsed.title;
	}
	if (parsed.date && !touched.date) {
		fields.date = parsed.date;
		detected.date = true;
		lastNlp.date = parsed.date;
	}
	if (parsed.startTime && !touched.startTime) {
		fields.startTime = parsed.startTime;
		fields.allDay = false;
		detected.startTime = true;
		lastNlp.startTime = parsed.startTime;
	}
	if (parsed.endTime && !touched.endTime) {
		fields.endTime = parsed.endTime;
		detected.endTime = true;
		lastNlp.endTime = parsed.endTime;
	}
	if (parsed.endDate && !touched.endDate) {
		fields.endDate = parsed.endDate;
		fields.multiDay = true;
		detected.endDate = true;
		lastNlp.endDate = parsed.endDate;
	}
	if (parsed.location && !touched.location) {
		fields.location = parsed.location;
		detected.location = true;
		lastNlp.location = parsed.location;
	}
	if (parsed.attendants && Array.isArray(parsed.attendants) && !touched.attendants) {
		fields.attendants = [...parsed.attendants];
		detected.attendants = true;
		lastNlp.attendants = [...parsed.attendants];
	}
	if (parsed.allDay !== undefined && !touched.allDay) {
		fields.allDay = parsed.allDay;
		lastNlp.allDay = parsed.allDay;
	}
	if (parsed.recurring && fields.recurrenceFrequency == null) {
		const mapped = calendarNlpFrequency(parsed.recurring);
		if (mapped) {
			fields.recurrenceFrequency = mapped.frequency;
			fields.recurrenceInterval = mapped.interval;
			detected.recurrence = true;
			lastNlp.recurring = parsed.recurring;
			if (Array.isArray(parsed.recurringByDay) && parsed.recurringByDay.length > 0) {
				fields.recurrenceByDay = [...parsed.recurringByDay];
			}
			if (parsed.recurringCount != null) {
				fields.recurrenceCount = Math.max(1, Math.floor(parsed.recurringCount));
			}
			if (parsed.recurringUntil) fields.recurrenceUntil = parsed.recurringUntil;
		}
	}
	if (parsed.reminderMinutes != null && fields.reminderMinutes == null) {
		fields.reminderMinutes = parsed.reminderMinutes;
	}
	return { fields, touched, detected, lastNlp };
}

/** Undo the previous parse's untouched fields (a fresh Quick Add starts clean). */
function calendarClearDetected(draft: CalendarFormDraft): {
	fields: CalendarEventFormFields;
	cleared: string[];
} {
	const fields = { ...draft.fields };
	const cleared: string[] = [];
	const { lastNlp, touched } = draft;
	if (lastNlp.title && !touched.title && fields.title === lastNlp.title) {
		fields.title = '';
		cleared.push('title');
	}
	if (lastNlp.date && !touched.date && fields.date === lastNlp.date) {
		fields.date = '';
		cleared.push('date');
	}
	if (lastNlp.startTime && !touched.startTime && fields.startTime === lastNlp.startTime) {
		fields.startTime = '';
		fields.allDay = true;
		cleared.push('startTime');
	}
	if (lastNlp.endTime && !touched.endTime && fields.endTime === lastNlp.endTime) {
		fields.endTime = '';
		cleared.push('endTime');
	}
	if (lastNlp.endDate && !touched.endDate && fields.endDate === lastNlp.endDate) {
		fields.endDate = '';
		fields.multiDay = false;
		cleared.push('endDate');
	}
	if (lastNlp.location && !touched.location && fields.location === lastNlp.location) {
		fields.location = '';
		cleared.push('location');
	}
	if (
		lastNlp.attendants &&
		!touched.attendants &&
		sameList(fields.attendants, lastNlp.attendants)
	) {
		fields.attendants = [];
		fields.inviteTypes = {};
		cleared.push('attendants');
	}
	return { fields, cleared };
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((value, index) => value === b[index]);
}
