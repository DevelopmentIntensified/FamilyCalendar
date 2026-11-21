/**
 * The browser client for the calendar API, over `kernel/client`'s
 * `createApiClient`. One method per endpoint the app calls, so a component
 * never hand-builds a URL or a body and every caller sees the same result
 * shape (`ApiResult`, never a throw).
 *
 * Doc: ./README.md#public-interface
 */
import type { ApiClient, ApiResult } from '$lib/kernel/client/apiClient';
import type {
	CalendarBulkAppliedResponse,
	CalendarBulkBody,
	CalendarBulkPlanResponse,
	CalendarEventCreateBody,
	CalendarEventCreatedResponse,
	CalendarEventUpdateBody,
	CalendarEventUpdatedResponse,
	CalendarEventsResponse,
	CalendarGuestInvitedResponse,
	CalendarImportCommitBody,
	CalendarImportCommitResponse,
	CalendarImportPreviewBody,
	CalendarImportPreviewResponse,
	CalendarImportTargetsResponse,
	CalendarImportUndoBody,
	CalendarImportUndoResponse,
	CalendarListResponse,
	CalendarLocationResponse,
	CalendarPrintResponse,
	CalendarRsvpResponse,
	CalendarRsvpUpdatedResponse,
	CalendarSeriesNoteResponse,
	CalendarSuccessResponse
} from './calendar.contract';

export interface EventScope {
	readonly scope: 'this' | 'all';
	readonly occurrenceDate?: string | null;
}

export interface ImportFileInput {
	readonly name: string;
	readonly contentBase64: string;
}

/** Every request the calendar screens make, typed by its wire response. */
export interface CalendarApi {
	listEvents(from: string, to: string): Promise<ApiResult<CalendarEventsResponse>>;
	createEvent(body: CalendarEventCreateBody): Promise<ApiResult<CalendarEventCreatedResponse>>;
	updateEvent(
		id: string,
		body: CalendarEventUpdateBody
	): Promise<ApiResult<CalendarEventUpdatedResponse | CalendarSeriesNoteResponse>>;
	deleteEvent(id: string, options: EventScope): Promise<ApiResult<CalendarSuccessResponse>>;
	getRsvp(id: string): Promise<ApiResult<CalendarRsvpResponse>>;
	setRsvp(id: string, status: string): Promise<ApiResult<CalendarRsvpUpdatedResponse>>;
	inviteGuest(id: string, guest: string): Promise<ApiResult<CalendarGuestInvitedResponse>>;
	icsUrl(id: string): string;
	bulkEdit(
		body: CalendarBulkBody
	): Promise<ApiResult<CalendarBulkAppliedResponse | CalendarBulkPlanResponse>>;
	listCalendars(): Promise<ApiResult<CalendarListResponse>>;
	importTargets(): Promise<ApiResult<CalendarImportTargetsResponse>>;
	importPreview(
		calendarId: string,
		files: readonly ImportFileInput[]
	): Promise<ApiResult<CalendarImportPreviewResponse>>;
	importCommit(body: CalendarImportCommitBody): Promise<ApiResult<CalendarImportCommitResponse>>;
	importUndo(body: CalendarImportUndoBody): Promise<ApiResult<CalendarImportUndoResponse>>;
	printMonth(year: number, month: number): Promise<ApiResult<CalendarPrintResponse>>;
	searchLocations(query: string): Promise<ApiResult<CalendarLocationResponse>>;
}

const EVENTS = '/api/events';

export function createCalendarApi(client: ApiClient): CalendarApi {
	return {
		listEvents: (from, to) =>
			client.request<CalendarEventsResponse>(
				'GET',
				`${EVENTS}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
			),
		createEvent: (body) =>
			client.request<CalendarEventCreatedResponse>('POST', EVENTS, body),
		updateEvent: (id, body) =>
			client.request<CalendarEventUpdatedResponse | CalendarSeriesNoteResponse>(
				'PUT',
				`${EVENTS}/${encodeURIComponent(id)}`,
				body
			),
		deleteEvent: (id, options) =>
			client.request<CalendarSuccessResponse>(
				'DELETE',
				`${EVENTS}/${encodeURIComponent(id)}`,
				options
			),
		getRsvp: (id) =>
			client.request<CalendarRsvpResponse>('GET', `${EVENTS}/${encodeURIComponent(id)}/rsvp`),
		setRsvp: (id, status) =>
			client.request<CalendarRsvpUpdatedResponse>(
				'POST',
				`${EVENTS}/${encodeURIComponent(id)}/rsvp`,
				{ status }
			),
		inviteGuest: (id, guest) =>
			client.request<CalendarGuestInvitedResponse>(
				'POST',
				`${EVENTS}/${encodeURIComponent(id)}/rsvp`,
				{ guest }
			),
		icsUrl: (id) => `${EVENTS}/${encodeURIComponent(id)}/ics`,
		bulkEdit: (body) =>
			client.request<CalendarBulkAppliedResponse | CalendarBulkPlanResponse>(
				'POST',
				`${EVENTS}/bulk`,
				body
			),
		listCalendars: () => client.request<CalendarListResponse>('GET', '/api/calendars'),
		importTargets: () => client.request<CalendarImportTargetsResponse>('GET', '/api/import'),
		importPreview: (calendarId, files) =>
			client.request<CalendarImportPreviewResponse>('POST', '/api/import/preview', {
				calendarId,
				files: [...files]
			} satisfies CalendarImportPreviewBody),
		importCommit: (body) =>
			client.request<CalendarImportCommitResponse>('POST', '/api/import/commit', body),
		importUndo: (body) =>
			client.request<CalendarImportUndoResponse>('POST', '/api/import/undo', body),
		printMonth: (year, month) =>
			client.request<CalendarPrintResponse>('GET', `/api/print?year=${year}&month=${month}`),
		searchLocations: (query) =>
			client.request<CalendarLocationResponse>(
				'GET',
				`/api/location-search?q=${encodeURIComponent(query)}`
			)
	};
}
