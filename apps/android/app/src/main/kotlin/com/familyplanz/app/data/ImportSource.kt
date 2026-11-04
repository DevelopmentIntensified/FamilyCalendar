package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/** A calendar the user may import into ("Personal Calendar" / "Family Calendar"). */
@Serializable
data class ImportCalendarDto(val id: String = "", val name: String = "")

@Serializable
data class ImportCalendarsResponse(val calendars: List<ImportCalendarDto> = emptyList())

/** One .ics file travelling as base64 text inside the JSON body (no multipart). */
@Serializable
data class ImportFileDto(val name: String, val contentBase64: String)

@Serializable
data class ImportPreviewRequest(val calendarId: String, val files: List<ImportFileDto>)

/** What one uploaded export contributed ("What is in them"). */
@Serializable
data class ImportFileSummaryDto(val fileName: String = "", val events: Int = 0, val duplicates: Int = 0)

/**
 * `POST /api/import/preview` (G17). Each of [items] is an event draft plus
 * display fields; the app keeps them whole because commit wants the ticked
 * ones posted back exactly as received.
 */
@Serializable
data class ImportPreviewDto(
	val calendarId: String = "",
	val calendarName: String = "",
	val fileName: String = "",
	val items: List<JsonObject> = emptyList(),
	val duplicates: Int = 0,
	val files: List<ImportFileSummaryDto> = emptyList(),
	val defaultSelection: List<String> = emptyList(),
)

@Serializable
data class ImportPreviewResponse(val preview: ImportPreviewDto = ImportPreviewDto())

@Serializable
data class ImportCommitRequest(val calendarId: String, val picked: List<JsonObject>)

/** What a commit wrote: the only record of the batch, so an undo can reverse it. */
@Serializable
data class ImportedEventDto(val id: String = "", val title: String = "", val startIso: String = "")

@Serializable
data class ImportCommitDto(
	val calendarId: String = "",
	val calendarName: String = "",
	val imported: Int = 0,
	val selected: Int = 0,
	val skipped: Int = 0,
	val skippedDuplicates: Int = 0,
	val failed: List<String> = emptyList(),
	val importedEvents: List<ImportedEventDto> = emptyList(),
)

@Serializable
data class ImportUndoRequest(val calendarId: String, val batch: List<ImportedEventDto>)

/** A row the import wrote that the user edited since: left alone by undo. */
@Serializable
data class ImportKeptDto(val id: String = "", val title: String = "")

@Serializable
data class ImportUndoDto(
	val calendarName: String = "",
	val removed: Int = 0,
	val kept: List<ImportKeptDto> = emptyList(),
	val alreadyGone: Int = 0,
)

internal interface ImportApi {
	@GET("api/import")
	suspend fun calendars(): ImportCalendarsResponse

	@POST("api/import/preview")
	suspend fun preview(@Body body: ImportPreviewRequest): ImportPreviewResponse

	@POST("api/import/commit")
	suspend fun commit(@Body body: ImportCommitRequest): ImportCommitDto

	@POST("api/import/undo")
	suspend fun undo(@Body body: ImportUndoRequest): ImportUndoDto
}

/** The three steps of the .ics import page (G17): preview writes nothing, commit adds, undo reverses a commit. */
interface ImportSource {
	suspend fun calendars(): ApiResult<List<ImportCalendarDto>>

	suspend fun preview(request: ImportPreviewRequest): ApiResult<ImportPreviewDto>

	suspend fun commit(request: ImportCommitRequest): ApiResult<ImportCommitDto>

	suspend fun undo(request: ImportUndoRequest): ApiResult<ImportUndoDto>
}

internal class NetworkImportSource(private val api: ImportApi) : ImportSource {
	override suspend fun calendars(): ApiResult<List<ImportCalendarDto>> = apiCall { api.calendars().calendars }

	override suspend fun preview(request: ImportPreviewRequest): ApiResult<ImportPreviewDto> =
		apiCall { api.preview(request).preview }

	override suspend fun commit(request: ImportCommitRequest): ApiResult<ImportCommitDto> = apiCall { api.commit(request) }

	override suspend fun undo(request: ImportUndoRequest): ApiResult<ImportUndoDto> = apiCall { api.undo(request) }
}
