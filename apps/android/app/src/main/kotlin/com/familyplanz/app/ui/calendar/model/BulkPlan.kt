package com.familyplanz.app.ui.calendar.model

import com.familyplanz.app.domain.CalendarEvent
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Port of src/lib/utils/bulkPlan.ts: how a reviewed smart plan reads, and whether it moves into the past. */

private val fmtPlanDay = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.ENGLISH)

private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.booleanOrNull

fun isPastDate(date: String, today: LocalDate): Boolean =
	runCatching { LocalDate.parse(date.take(10)) < today }.getOrDefault(false)

fun describePlanOp(op: JsonObject, events: List<CalendarEvent>, calendars: List<Pair<String, String>>, today: LocalDate): String {
	val id = op.str("id")
	val ev = events.firstOrNull { it.serverId == id || it.id == id }
	val name = ev?.title ?: op.str("title") ?: "Event"
	if (op.bool("delete") == true) return "Delete \"$name\""
	val changes = describeChanges(op, ev, calendars, today)
	return if (changes.isEmpty()) name else "$name: $changes"
}

/** One op's bullet, comma-joined: only the fields the server sent change. */
private fun describeChanges(
	op: JsonObject,
	ev: CalendarEvent?,
	calendars: List<Pair<String, String>>,
	today: LocalDate,
): String = buildList {
	op.str("title")?.takeIf { it != ev?.title }?.let { add("rename to \"$it\"") }
	op.str("date")?.let { d ->
		val day = runCatching { fmtPlanDay.format(LocalDate.parse(d.take(10))) }.getOrDefault(d)
		add("move to $day" + if (isPastDate(d, today)) " (past)" else "")
	}
	op.str("startTime")?.let { add("start $it") }
	op.str("endTime")?.let { add("end $it") }
	op.str("location")?.let { add("at $it") }
	op.bool("allDay")?.let { add(if (it) "all day" else "timed") }
	op.str("calendarId")?.let { cid -> calendars.firstOrNull { it.first == cid }?.let { add("→ ${it.second}") } }
}.joinToString(", ")

fun planMovesToPast(ops: List<JsonObject>, today: LocalDate): Boolean =
	ops.any { op -> op.str("date")?.let { isPastDate(it, today) } == true }

/** `{n} event(s)` with the web's plural rule. */
fun events(n: Int): String = if (n == 1) "1 event" else "$n events"

/** The BulkOp union payloads (`+page.svelte` runBulk / runSmart). */
object BulkOps {
	fun delete(): JsonObject = buildJsonObject { put("type", "delete") }

	fun calendar(id: String): JsonObject = buildJsonObject {
		put("type", "calendar")
		put("calendarId", id)
	}

	fun location(text: String): JsonObject = buildJsonObject {
		put("type", "location")
		put("location", text)
	}

	/** "Ann, Bob" is two attendants, never one guest named "Ann, Bob" (#226). */
	fun attendants(raw: String): JsonObject? {
		val names = raw.split(',').map { it.trim() }.filter { it.isNotEmpty() }
		if (names.isEmpty()) return null
		return buildJsonObject {
			put("type", "attendants")
			putJsonArray("add") { names.forEach { add(JsonPrimitive(it)) } }
		}
	}

	fun smart(instruction: String): JsonObject = buildJsonObject {
		put("type", "smart")
		put("instruction", instruction)
	}
}
