package com.familyplanz.app.ui.admin

import com.familyplanz.app.data.BugReportDto
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

/** `areaLabel` of the bug register: the free-string `area` column to its display label. */
fun bugAreaLabel(area: String): String = when (area) {
	"calendar" -> "Calendar"
	"tasks" -> "Tasks"
	"account" -> "Account"
	"payments" -> "Payments"
	"dashboard" -> "Dashboard"
	"other" -> "Other"
	else -> area
}

/** `sourceLabel` of the unmatched-phrase register. */
fun phraseSourceLabel(source: String): String = when (source) {
	"event_parse" -> "Event parse"
	"bulk_edit" -> "Bulk edit"
	else -> source
}

/** `reporterName`: "First Last", or "Anonymous / deleted" for a report whose user is gone. */
fun reporterName(report: BugReportDto): String {
	val name = "${report.reporterFirstName.orEmpty()} ${report.reporterLastName.orEmpty()}".trim()
	return name.ifEmpty { "Anonymous / deleted" }
}

/**
 * `matchedSummary`: the stored `matched` JSON sample reduced to its non-empty
 * scalar fields (arrays and objects as compact JSON), or null when there is
 * nothing to show / it will not parse.
 */
fun matchedSummary(matched: String?): Map<String, String>? {
	if (matched.isNullOrBlank()) return null
	val parsed = runCatching { Json.parseToJsonElement(matched) }.getOrNull() as? JsonObject ?: return null
	val fields = LinkedHashMap<String, String>()
	for ((key, value) in parsed) {
		val text = when {
			value is JsonNull -> null
			value is JsonArray -> value.takeIf { it.isNotEmpty() }?.toString()
			value is JsonPrimitive -> value.content.takeIf { it.isNotEmpty() && !(value.content == "false" && !value.isString) }
			else -> value.toString()
		}
		if (text != null) fields[key] = text
	}
	return fields.takeIf { it.isNotEmpty() }
}

private fun instant(iso: String): OffsetDateTime? = try {
	OffsetDateTime.parse(iso)
} catch (_: DateTimeParseException) {
	null
}

/** "Nov 3, 5:30 PM" - when a bug was reported, in the phone's zone. */
fun reportedAtLabel(iso: String, zone: ZoneId = ZoneId.systemDefault()): String =
	instant(iso)?.atZoneSameInstant(zone)?.format(DateTimeFormatter.ofPattern("MMM d, h:mm a", Locale.ENGLISH)) ?: iso

/** "11/3/2026" - when a phrase was first seen. */
fun firstSeenLabel(iso: String, zone: ZoneId = ZoneId.systemDefault()): String =
	instant(iso)?.atZoneSameInstant(zone)?.format(DateTimeFormatter.ofPattern("M/d/yyyy", Locale.ENGLISH)) ?: iso
