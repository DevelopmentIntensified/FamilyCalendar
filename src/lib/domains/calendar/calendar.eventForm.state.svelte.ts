/**
 * The event form's runes state: the draft (`calendar.eventForm.rules.ts`
 * supplies every rule), the Quick Add parser flow, the invite prefill and the
 * create/update call. One class per modal instance; the components take it as
 * a prop and call its methods, so no component fetches anything.
 *
 * Ported from `EventFormModel.svelte.ts` + `EventFormModal.svelte` (the form
 * half). `$effect` is deliberately absent: every side effect here is a method,
 * so the class runs and is tested in node.
 *
 * Doc: ./README.md#invariants
 */
import { localPref } from '$lib/kernel/client/localPref';
import type { CalendarApi } from './calendar.api';
import {
	calendarNameForEvent,
	type CalendarAttendanceRow,
	type CalendarEventView
} from './calendar.eventView.rules';
import {
	calendarActionErrorCopy,
	calendarApplyParse,
	calendarCanSubmit,
	calendarEmptyForm,
	calendarEndBeforeStart,
	calendarEndDateBeforeStart,
	calendarEventBody,
	calendarFormFromEvent,
	calendarShiftEventDates,
	type CalendarEventBody,
	type CalendarEventFormFields,
	type CalendarFormDraft,
	type CalendarNlpInput
} from './calendar.eventForm.rules';

/** A family member the form can invite (#282: the roster arrives from the page). */
export interface CalendarFamilyMember {
	readonly userId: string;
	readonly firstName?: string;
	readonly lastName?: string;
	readonly email?: string;
}

/** The event parser as the screen wires it (parsing owns the endpoint). */
export type CalendarParseEvent = (
	input: string
) => Promise<{ parsed?: CalendarNlpInput; results?: { parsed: CalendarNlpInput; confidence: number }[] } | null>;

export interface CalendarEventFormInit {
	readonly event?: CalendarEventView | null;
	readonly calendars: readonly { id: string; name: string; color?: string | null }[];
	readonly familyMembers?: readonly CalendarFamilyMember[];
	readonly defaultCalendarId?: string | null;
	readonly initialDate?: string;
	readonly initialTitle?: string;
}

/** What the screen does with a successful save. */
export interface CalendarSaveOutcome {
	readonly body: CalendarEventBody;
	readonly created: unknown;
}

export class CalendarEventFormState {
	draft = $state<CalendarFormDraft>({
		fields: calendarEmptyForm(),
		touched: {},
		detected: {},
		lastNlp: {}
	});
	quickAdd = $state('');
	parsing = $state(false);
	parseError = $state(false);
	multiResults = $state<{ parsed: CalendarNlpInput; confidence: number }[] | null>(null);
	lastParse = $state<CalendarNlpInput | null>(null);
	phraseReportable = $state(false);
	phraseReported = $state(false);
	reportingPhrase = $state(false);
	saving = $state(false);
	/** The one-line failure under the form (submit error). */
	error = $state('');
	/** Member invitees learned from the event's own attendance rows (#274). */
	invitedUsers = $state<CalendarFamilyMember[]>([]);
	/** Guest names this device used before, most recent last (legacy `recent_attendants`). */
	recentAttendants = $state<string[]>([]);
	invitesLoaded = false;

	readonly isEdit: boolean;
	readonly eventId: string | null;
	readonly masterId: string | null;
	readonly occurrenceDate: string | null;
	private readonly api: CalendarApi;
	private readonly parseEvent: CalendarParseEvent | null;
	private readonly familyMemberIds: Set<string>;
	private readonly invitedUserIds = new Set<string>();
	private readonly recentPref = localPref<string[]>({
		key: 'calendar:recentAttendants',
		version: 1,
		fallback: [],
		parse: (raw) =>
			Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : null
	});
	private parseTimer: ReturnType<typeof setTimeout> | undefined;
	private readonly autoParse: boolean;

	constructor(
		api: CalendarApi,
		parseEvent: CalendarParseEvent | null,
		init: CalendarEventFormInit & { autoParse?: boolean }
	) {
		this.api = api;
		this.parseEvent = parseEvent;
		this.calendars = init.calendars;
		this.members = init.familyMembers ?? [];
		this.recentAttendants = this.recentPref.read();
		this.autoParse = init.autoParse ?? true;
		this.familyMemberIds = new Set((init.familyMembers ?? []).map((member) => member.userId));
		this.invitedUserIds = new Set();
		this.isEdit = !!init.event;
		this.eventId = init.event?.id ?? null;
		this.masterId = init.event?.masterId || init.event?.id || null;
		this.occurrenceDate = init.event?.occurrenceDate ?? null;

		if (init.event) {
			const { fields, invitedUserIds } = calendarFormFromEvent(
				init.event,
				init.calendars,
				init.defaultCalendarId
			);
			for (const id of invitedUserIds) this.invitedUserIds.add(id);
			this.draft = { fields, touched: {}, detected: {}, lastNlp: {} };
			// Invites this event already carries are "loaded": an edit may send them.
			if (init.event.attendees?.length) this.invitesLoaded = true;
		} else {
			const fields = calendarEmptyForm();
			fields.selectedCalendarId =
				init.defaultCalendarId &&
				init.calendars.some((calendar) => calendar.id === init.defaultCalendarId)
					? init.defaultCalendarId
					: init.calendars.length > 0
						? init.calendars[0].id
						: '';
			if (init.initialDate) {
				fields.date = init.initialDate;
			}
			if (init.initialTitle) fields.title = init.initialTitle;
			this.draft = {
				fields,
				touched: init.initialDate ? { date: true } : {},
				detected: {},
				lastNlp: {}
			};
		}
	}

	get fields(): CalendarEventFormFields {
		return this.draft.fields;
	}

	get canSubmit(): boolean {
		return calendarCanSubmit(this.draft.fields);
	}

	get endBeforeStart(): boolean {
		return calendarEndBeforeStart(this.draft.fields);
	}

	get endDateBeforeStart(): boolean {
		return calendarEndDateBeforeStart(this.draft.fields);
	}

	get isRecurringOccurrence(): boolean {
		return !!this.fields.recurrenceFrequency && !!this.occurrenceDate;
	}

	get calendarName(): string {
		return calendarNameForEvent(
			{
				id: this.eventId ?? '',
				title: this.fields.title,
				start: '',
				calendarId: this.fields.selectedCalendarId
			},
			this.calendars
		);
	}

	/** The calendar picker's rows, as the form received them. */
	calendars: readonly { id: string; name: string; color?: string | null }[] = [];
	/** The family roster the picker offers. */
	members: readonly CalendarFamilyMember[] = [];

	/** Merge one field change and remember the user touched it. */
	patch(patch: Partial<CalendarEventFormFields>, touchedField?: string): void {
		this.draft = {
			...this.draft,
			fields: { ...this.draft.fields, ...patch },
			touched: touchedField
				? { ...this.draft.touched, [touchedField]: true }
				: this.draft.touched
		};
	}

	isDetected(field: string): boolean {
		return !!this.draft.detected[field] && !this.draft.touched[field];
	}

	toggleAttendant(value: string): void {
		const fields = this.draft.fields;
		if (fields.attendants.includes(value)) {
			const inviteTypes = { ...fields.inviteTypes };
			delete inviteTypes[value];
			this.patch(
				{ attendants: fields.attendants.filter((item) => item !== value), inviteTypes },
				'attendants'
			);
			return;
		}
		const inviteTypes = this.isMemberId(value)
			? { ...fields.inviteTypes, [value]: 'optional' as const }
			: fields.inviteTypes;
		this.patch({ attendants: [...fields.attendants, value], inviteTypes }, 'attendants');
	}

	setInviteType(value: string, type: 'required' | 'optional'): void {
		if (!this.draft.fields.attendants.includes(value)) return;
		this.patch({ inviteTypes: { ...this.draft.fields.inviteTypes, [value]: type } }, 'attendants');
	}

	/**
	 * Seed the chips + roles from the event's attendance rows. Never call this
	 * with an empty list: an empty answer would be re-sent as "no invites" and
	 * wipe the real ones.
	 */
	prefillInvites(rows: readonly CalendarAttendanceRow[]): void {
		if (rows.length === 0) return;
		this.invitesLoaded = true;
		const values = rows
			.map((row) => row.userId || row.name)
			.filter((value): value is string => !!value)
			.filter((value, index, all) => all.indexOf(value) === index);
		const inviteTypes: Record<string, 'required' | 'optional'> = {};
		for (const row of rows) {
			if (row.userId) inviteTypes[row.userId] = row.inviteType === 'required' ? 'required' : 'optional';
		}
		const learned: CalendarFamilyMember[] = [];
		for (const row of rows) {
			if (!row.userId || this.invitedUserIds.has(row.userId)) continue;
			this.invitedUserIds.add(row.userId);
			if (this.familyMemberIds.has(row.userId)) continue;
			learned.push({
				userId: row.userId,
				firstName: row.firstName ?? '',
				lastName: row.lastName ?? '',
				email: ''
			});
		}
		if (learned.length > 0) this.invitedUsers = [...this.invitedUsers, ...learned];
		this.patch({ attendants: values, inviteTypes }, 'attendants');
	}

	/** Quick Add changed: description follows it, then the parse is debounced 300 ms. */
	onQuickAddInput(value: string): void {
		this.quickAdd = value;
		this.parseError = false;
		if (!this.isDetected('description')) {
			this.patch({ description: value });
		}
		clearTimeout(this.parseTimer);
		if (!this.autoParse || !this.parseEvent) return;
		this.parseTimer = setTimeout(() => void this.runParse(), 300);
	}

	/** Parse now (the manual path and the debounce's target). */
	async runParse(): Promise<void> {
		if (!this.parseEvent || !this.quickAdd.trim()) return;
		this.parsing = true;
		this.parseError = false;
		this.phraseReported = false;
		try {
			const result = await this.parseEvent(this.quickAdd);
			const first =
				result?.results && result.results.length > 1 ? result.results[0].parsed : result?.parsed;
			if (first) {
				this.multiResults =
					result?.results && result.results.length > 1 ? result.results : null;
				this.draft = calendarApplyParse(this.draft, first);
				this.lastParse = first;
				this.phraseReportable = true;
				const wantedCalendar = first.calendarName?.toLowerCase();
				const match = wantedCalendar
					? this.calendars.find((calendar) => calendar.name.toLowerCase() === wantedCalendar)
					: undefined;
				if (match) this.patch({ selectedCalendarId: match.id });
			} else {
				this.parseError = true;
			}
		} catch {
			this.parseError = true;
		} finally {
			this.parsing = false;
		}
	}

	/** One POST per parsed segment, each built on a throwaway form. */
	async createAllParsed(): Promise<CalendarSaveOutcome[]> {
		if (!this.multiResults || this.multiResults.length < 2 || this.saving) return [];
		this.saving = true;
		this.error = '';
		const outcomes: CalendarSaveOutcome[] = [];
		try {
			for (const result of this.multiResults) {
				const draft = calendarApplyParse(this.draft, result.parsed);
				const body = calendarEventBody(draft.fields, {
					isEdit: false,
					invitesLoaded: false,
					isMember: (value) => this.isMemberId(value)
				});
				if (!body) continue;
				const response = await this.api.createEvent(body);
				if (!response.ok) {
					this.error = calendarActionErrorCopy('create', response.error, response.status);
					return outcomes;
				}
				outcomes.push({ body, created: response.data.event ?? null });
			}
			return outcomes;
		} finally {
			this.saving = false;
		}
	}

	/**
	 * The one submit path. Update targets the master id with the edit scope on a
	 * recurring occurrence; create also POSTs the shifted copies of a
	 * multi-date parse. Returns null when the form is not submittable or the
	 * call failed (the error/toast says why).
	 */
	async save(scope: 'this' | 'all' = 'this'): Promise<CalendarSaveOutcome | null> {
		if (this.saving) return null;
		if (this.endBeforeStart || this.endDateBeforeStart) return null;
		const body = calendarEventBody(this.draft.fields, {
			isEdit: this.isEdit,
			invitesLoaded: this.invitesLoaded,
			isMember: (value) => this.isMemberId(value)
		});
		if (!body) return null;
		this.saving = true;
		this.error = '';
		this.rememberRecentGuests();
		try {
			if (this.isEdit && this.eventId) {
				const payload = this.isRecurringOccurrence
					? { ...body, scope, occurrenceDate: this.occurrenceDate }
					: body;
				const response = await this.api.updateEvent(this.masterId || this.eventId, payload);
				if (!response.ok) {
					this.error = calendarActionErrorCopy('save', response.error, response.status);
					return null;
				}
				return { body, created: null };
			}
			const response = await this.api.createEvent(body);
			if (!response.ok) {
				this.error = calendarActionErrorCopy('create', response.error, response.status);
				return null;
			}
			const created = response.data.event ?? null;
			for (const shifted of calendarShiftEventDates(body, this.lastParse?.dates)) {
				const extra = await this.api.createEvent(shifted);
				if (!extra.ok) {
					this.error = calendarActionErrorCopy('create', extra.error, extra.status);
					return null;
				}
			}
			return { body, created };
		} finally {
			this.saving = false;
		}
	}

	/** Report a wrong parse to the parser's admins (best effort). */
	async reportPhrase(report: (phrase: string, matched: unknown) => Promise<boolean>): Promise<void> {
		if (this.reportingPhrase || !this.quickAdd.trim()) return;
		this.reportingPhrase = true;
		try {
			const matched =
				this.multiResults && this.multiResults.length > 1
					? { results: this.multiResults.map((result) => result.parsed) }
					: this.lastParse;
			if (await report(this.quickAdd.trim(), matched)) this.phraseReported = true;
		} finally {
			this.reportingPhrase = false;
		}
	}

	/** Clear the form for another creation (the modal stays open). */
	reset(): void {
		const selectedCalendarId = this.draft.fields.selectedCalendarId;
		this.draft = {
			fields: calendarEmptyForm({ selectedCalendarId }),
			touched: {},
			detected: {},
			lastNlp: {}
		};
		this.quickAdd = '';
		this.parseError = false;
		this.multiResults = null;
		this.lastParse = null;
		this.phraseReportable = false;
		this.phraseReported = false;
		this.error = '';
		this.invitesLoaded = false;
	}

	/** Keep the guest names this device used, so the picker offers them again. */
	private rememberRecentGuests(): void {
		const names = this.fields.attendants.filter(
			(value) => !value.includes('@') && value.length < 50 && !this.isMemberId(value)
		);
		const existing = new Set(this.recentAttendants);
		const additions = names.filter((name) => !existing.has(name));
		if (additions.length === 0) return;
		this.recentAttendants = [...this.recentAttendants, ...additions].slice(-20);
		this.recentPref.write(this.recentAttendants);
	}

	private isMemberId(value: string): boolean {
		return this.familyMemberIds.has(value) || this.invitedUserIds.has(value);
	}
}

/** The toast the edit save shows (#223: the stale prop never returns to the detail view). */
export function calendarSavedToast(title: string): string {
	return `Saved "${title.trim()}".`;
}

