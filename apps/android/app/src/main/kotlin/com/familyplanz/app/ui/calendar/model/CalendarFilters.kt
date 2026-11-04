package com.familyplanz.app.ui.calendar.model

import com.familyplanz.app.domain.CalendarEvent
import com.familyplanz.app.domain.CalendarTask

/*
 * The three reading filters (Calendar.svelte:350-420), applied above every
 * view so month, week, day and list never disagree: calendars, then search,
 * then people. Ports of calendarFilter / calendarSearch / calendarAssignees.
 */

/** A sponsored row belongs to no calendar, so no calendar or person filter can hide it. */
internal fun CalendarEvent.isAdRow() = isAd || calendarId.isBlank()

fun visibleEventsByCalendar(events: List<CalendarEvent>, hidden: Set<String>): List<CalendarEvent> =
	if (hidden.isEmpty()) events else events.filter { it.isAdRow() || it.calendarId !in hidden }

fun visibleTasksByCalendar(tasks: List<CalendarTask>, hidden: Set<String>): List<CalendarTask> =
	if (hidden.isEmpty()) tasks else tasks.filter { it.calendarId == null || it.calendarId !in hidden }

internal fun CalendarEvent.person(): String? = if (isAdRow()) null else ownerId.trim().ifEmpty { null }

internal fun CalendarTask.person(): String? = if (calendarId == null) null else assignedTo?.trim()?.ifEmpty { null }

fun eventsByAssignee(events: List<CalendarEvent>, hidden: Set<String>): List<CalendarEvent> =
	if (hidden.isEmpty()) events else events.filter { e -> e.person()?.let { it !in hidden } ?: e.isAdRow() }

fun tasksByAssignee(tasks: List<CalendarTask>, hidden: Set<String>): List<CalendarTask> =
	if (hidden.isEmpty()) tasks else tasks.filter { t -> t.person()?.let { it !in hidden } ?: (t.calendarId == null) }
