package com.familyplanz.app.domain

import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/*
 * TaskFocus focus time (#290). The desktop is the only clock: `focusMinutes`
 * holds closed spans only and `focusStartedAt` the start of the open span,
 * so adding the open span's whole minutes never double-counts.
 * Mirrors TaskFocus mobile/app.js liveMinutes / isRunning.
 */

/** A task is focusing exactly while the desktop has an open span on it. */
fun isFocusing(task: Task): Boolean = task.focusStartedAt != null

/**
 * Closed minutes plus whole minutes of the open span at [now]; closed minutes
 * alone when idle; null when the task has no focus time at all. A start
 * stamped after [now] (clock skew) adds nothing rather than subtracting.
 */
fun liveFocusMinutes(task: Task, now: Instant): Int? {
	val started = task.focusStartedAt ?: return task.focusMinutes
	val running = Duration.between(started, now).toMinutes().coerceAtLeast(0).toInt()
	return (task.focusMinutes ?: 0) + running
}

/** Tolerant ISO-8601 read (`Z` or offset); anything else reads as not focusing. */
internal fun parseFocusInstant(value: String?): Instant? {
	if (value.isNullOrBlank()) return null
	return try {
		OffsetDateTime.parse(value).toInstant()
	} catch (_: DateTimeParseException) {
		null
	}
}
