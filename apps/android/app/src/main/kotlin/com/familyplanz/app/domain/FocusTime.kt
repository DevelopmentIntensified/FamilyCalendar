@file:Suppress("MatchingDeclarationName")
package com.familyplanz.app.domain

import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/*
 * TaskFocus focus time (#290, #293). Two clocks, one writer per field:
 * the desktop owns `focusMinutes` / `focusStartedAt`; the phone's own
 * sessions surface as `phoneFocusMinutes` (closed, not yet absorbed by the
 * desktop) and `phoneFocusStartedAt` (the open phone session). Display rule
 * (TaskFocus #124):
 *
 *   live = focusMinutes + phoneFocusMinutes
 *        + (focusStartedAt      ? now − focusStartedAt      : 0)
 *        + (phoneFocusStartedAt ? now − phoneFocusStartedAt : 0)
 */

/** Where a running task is being timed; the chip says "Focusing (desktop|phone)". */
@Suppress("MatchingDeclarationName")
enum class FocusSource(val label: String) {
	DESKTOP("desktop"),
	PHONE("phone"),
}

/** Running = either start field set. */
fun isFocusing(task: Task): Boolean = task.focusStartedAt != null || task.phoneFocusStartedAt != null

/** The clock a running task is on; the phone wins when both run (it is the one in hand). */
fun focusSource(task: Task): FocusSource? = when {
	task.phoneFocusStartedAt != null -> FocusSource.PHONE
	task.focusStartedAt != null -> FocusSource.DESKTOP
	else -> null
}

private fun runningMinutes(started: Instant?, now: Instant): Int =
	started?.let { Duration.between(it, now).toMinutes().coerceAtLeast(0).toInt() } ?: 0

/**
 * The #124 display rule at [now]; null when the task has no focus time at
 * all. A start stamped after [now] (clock skew) adds nothing.
 */
fun liveFocusMinutes(task: Task, now: Instant): Int? {
	val anyTime = task.focusMinutes != null || task.phoneFocusMinutes > 0 || isFocusing(task)
	if (!anyTime) return null
	return (task.focusMinutes ?: 0) +
		task.phoneFocusMinutes +
		runningMinutes(task.focusStartedAt, now) +
		runningMinutes(task.phoneFocusStartedAt, now)
}

/** Phone-only share of [liveFocusMinutes]: closed unabsorbed minutes plus the open phone span. */
fun phoneFocusMinutesLive(task: Task, now: Instant): Int =
	task.phoneFocusMinutes + runningMinutes(task.phoneFocusStartedAt, now)

/** Tolerant ISO-8601 read (`Z` or offset); anything else reads as not focusing. */
internal fun parseFocusInstant(value: String?): Instant? {
	if (value.isNullOrBlank()) return null
	return try {
		OffsetDateTime.parse(value).toInstant()
	} catch (_: DateTimeParseException) {
		null
	}
}
