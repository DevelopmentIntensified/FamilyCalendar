package com.familyplanz.app.ui.secondary.importer

import com.familyplanz.app.data.ImportFileSummaryDto
import com.familyplanz.app.data.ImportPreviewDto
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

/** The server's limits (`MAX_FILES`, `MAX_FILE_BYTES` of `icsImportFlow.ts`); the same words are used for the local checks. */
const val IMPORT_MAX_FILES = 10
const val IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024

/** A file the user picked, read into memory. */
class PickedFile(val name: String, val bytes: ByteArray)

/** Why a likely duplicate was flagged (`duplicateReason`). */
enum class DuplicateReason(val wire: String, val note: String) {
	ALREADY_ON_CALENDAR("already-on-calendar", "Likely duplicate — already on %s"),
	EARLIER_IN_FILE("earlier-in-file", "Likely duplicate — appears earlier in this file"),
	EARLIER_IN_IMPORT("earlier-in-import", "Likely duplicate — appears earlier in this import"),
	;

	companion object {
		fun of(wire: String?): DuplicateReason? = entries.firstOrNull { it.wire == wire }
	}
}

/**
 * One previewed event. [raw] is the whole server object: commit posts the
 * ticked rows back exactly as received (`pickedJson()` on the web).
 */
class ImportItem(
	val key: String,
	val title: String,
	val fileName: String,
	val whenText: String,
	val location: String?,
	val duplicate: Boolean,
	val reason: DuplicateReason?,
	val raw: JsonObject,
)

private fun JsonObject.text(name: String): String? = (this[name] as? JsonPrimitive)?.contentOrNull

fun importItemOf(raw: JsonObject): ImportItem = ImportItem(
	key = raw.text("key").orEmpty(),
	title = raw.text("title").orEmpty(),
	fileName = raw.text("fileName").orEmpty(),
	whenText = raw.text("whenText").orEmpty(),
	location = raw.text("location")?.takeIf { it.isNotBlank() },
	duplicate = (raw["duplicate"] as? JsonPrimitive)?.booleanOrNull == true,
	reason = DuplicateReason.of(raw.text("duplicateReason")),
	raw = raw,
)

/** The previewed file(s): everything the preview card draws. */
class ImportPreview(
	val calendarId: String,
	val calendarName: String,
	val fileName: String,
	val items: List<ImportItem>,
	val duplicates: Int,
	val files: List<ImportFileSummaryDto>,
	val defaultSelection: Set<String>,
)

fun importPreviewOf(dto: ImportPreviewDto): ImportPreview = ImportPreview(
	calendarId = dto.calendarId,
	calendarName = dto.calendarName,
	fileName = dto.fileName,
	items = dto.items.map(::importItemOf),
	duplicates = dto.duplicates,
	files = dto.files,
	defaultSelection = dto.defaultSelection.toSet(),
)

/** A change to the ticked set. */
sealed interface Pick {
	data class Toggle(val key: String, val on: Boolean) : Pick

	data object All : Pick

	data object None : Pick

	/** Untick every row of one file ("remove it from this import"); the rows stay on screen. */
	data class DropFile(val fileName: String) : Pick

	/** Back to the server's suggestion (duplicates unticked). */
	data object Suggested : Pick
}

/** Applies [change] to the user's tick set ([current], null = still following the suggestion). */
fun applyPick(change: Pick, current: Set<String>?, preview: ImportPreview): Set<String>? {
	val picked = current ?: preview.defaultSelection
	return when (change) {
		is Pick.Toggle -> if (change.on) picked + change.key else picked - change.key
		Pick.All -> preview.items.map { it.key }.toSet()
		Pick.None -> emptySet()
		is Pick.DropFile -> picked - preview.items.filter { it.fileName == change.fileName }.map { it.key }.toSet()
		Pick.Suggested -> null
	}
}

/** "1 event" / "3 events" (a count and its noun, as the page writes them). */
fun plural(n: Int, noun: String): String = "$n $noun${if (n == 1) "" else "s"}"

/** "5 KB" - the size beside a chosen file (at least 1). */
fun sizeLabel(bytes: Int): String = "${maxOf(1, Math.round(bytes / 1024f))} KB"

/** "Tue, Nov 3, 2026" for the earliest imported day, or null if no events landed / the date will not parse. */
fun firstLandedLabel(startIsos: List<String>): Pair<String, String>? {
	val earliest = startIsos.minOrNull() ?: return null
	val day = earliest.take(10)
	return try {
		day to LocalDate.parse(day).format(DateTimeFormatter.ofPattern("EEE, LLL d, yyyy", Locale.ENGLISH))
	} catch (_: DateTimeParseException) {
		null
	}
}

/** The local checks that mirror the server's messages (checked again there). */
fun fileProblem(files: List<PickedFile>): String? = when {
	files.isEmpty() -> "Choose an .ics file to import."
	files.size > IMPORT_MAX_FILES -> "Choose up to $IMPORT_MAX_FILES files at a time."
	else -> files.firstOrNull { it.bytes.size > IMPORT_MAX_FILE_BYTES }?.let { "${it.name} is larger than 5 MB." }
}
