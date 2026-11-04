package com.familyplanz.app.testing

import com.familyplanz.app.data.AdminBugsDto
import com.familyplanz.app.data.AdminNlpDto
import com.familyplanz.app.data.ArchiveEventDto
import com.familyplanz.app.data.ArchiveResponse
import com.familyplanz.app.data.BugReportDto
import com.familyplanz.app.data.ImportCommitDto
import com.familyplanz.app.data.ImportFileSummaryDto
import com.familyplanz.app.data.ImportPreviewDto
import com.familyplanz.app.data.ImportedEventDto
import com.familyplanz.app.data.MonthStatsDto
import com.familyplanz.app.data.PrintCellDto
import com.familyplanz.app.data.PrintItemDto
import com.familyplanz.app.data.PrintMonthDto
import com.familyplanz.app.data.PrintMonthRef
import com.familyplanz.app.data.RecentlyCompletedDto
import com.familyplanz.app.data.StatsPersonDto
import com.familyplanz.app.data.StatsResponse
import com.familyplanz.app.data.StreakDto
import com.familyplanz.app.data.TaskStatsDto
import com.familyplanz.app.data.UnmatchedPhraseDto
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/*
 * #299 fixtures: the exact shapes the G15-G19 endpoints return, with today
 * pinned to 2026-11-04 (a Wednesday) so the streak and month labels are stable.
 */

const val FIXTURE_TODAY = "2026-11-04"

fun fixturesStats(): StatsResponse = StatsResponse(
	stats = TaskStatsDto(
		topAssigners = listOf(StatsPersonDto("Ada", 6), StatsPersonDto("Ben", 3)),
		topAssignees = listOf(StatsPersonDto("Ada", 4), StatsPersonDto("Ben", 2), StatsPersonDto("Cleo", 1)),
		recentlyCompleted = listOf(
			RecentlyCompletedDto("Water the plants", "2026-11-03T17:00:00Z", recurring = false),
			RecentlyCompletedDto("Take out bins", "2026-11-02T07:30:00Z", recurring = true),
		),
		month = MonthStatsDto(completed = 7, recurring = 2),
	),
	streak = StreakDto(current = 4, best = 9, freezeUsedInCurrentGap = true),
	completionIso = listOf(
		"2026-10-26T12:00:00Z",
		"2026-11-02T08:00:00Z",
		"2026-11-02T19:00:00Z",
	),
	todayIso = FIXTURE_TODAY,
	month = MonthStatsDto(completed = 7, recurring = 2),
)

fun fixturesArchive(): ArchiveResponse = ArchiveResponse(
	events = listOf(
		ArchiveEventDto("e1", "Autumn fair", "2026-11-03T10:00:00Z", location = "Town hall", calendar = "Family"),
		ArchiveEventDto("e2", "Harvest supper", "2026-10-12T18:00:00Z"),
		ArchiveEventDto("e3", "Lost memory", "not-a-date"),
	),
	archiveAllowed = true,
	planName = "Family",
	familyCount = 2,
	retentionDays = 30,
	archivedRetentionDays = 90,
)

fun fixturesArchiveGate(): ArchiveResponse = ArchiveResponse(
	archiveAllowed = false,
	reason = "Archive view unlocks on the Family plan.",
	planName = "Free",
	familyCount = 1,
	retentionDays = 7,
	archivedRetentionDays = 30,
)

private fun importItem(key: String, title: String, duplicate: Boolean = false): JsonObject = buildJsonObject {
	put("key", key)
	put("title", title)
	put("fileName", "family.ics")
	put("whenText", "Tue, Nov 3, 9:00 AM")
	put("location", "Town hall")
	put("duplicate", duplicate)
	if (duplicate) put("duplicateReason", "already-on-calendar")
}

fun fixturesPreviewDto(): ImportPreviewDto = ImportPreviewDto(
	calendarId = "c1",
	calendarName = "Personal Calendar",
	fileName = "family.ics",
	items = listOf(importItem("a", "Soccer practice"), importItem("b", "Dentist", duplicate = true)),
	duplicates = 1,
	files = listOf(ImportFileSummaryDto("family.ics", events = 2, duplicates = 1)),
	defaultSelection = listOf("a"),
)

fun fixturesCommit(): ImportCommitDto = ImportCommitDto(
	calendarId = "c1",
	calendarName = "Personal Calendar",
	imported = 2,
	selected = 2,
	skippedDuplicates = 1,
	importedEvents = listOf(
		ImportedEventDto("i1", "Soccer practice", "2026-11-03T09:00:00Z"),
		ImportedEventDto("i2", "Dentist", "2026-11-05T15:00:00Z"),
	),
)

private fun printItems(count: Int): List<PrintItemDto> = List(count) { i ->
	PrintItemDto(
		title = "Item ${i + 1}",
		color = "#fa8072",
		allDay = i % 2 == 0,
		time = if (i % 2 == 0) null else "9a",
	)
}

fun fixturesPrint(): PrintMonthDto = PrintMonthDto(
	year = 2026,
	month = 11,
	monthName = "November",
	weekStart = "monday",
	familyName = "The Smiths",
	grid = (1..7).map { day ->
		PrintCellDto(
			day = day,
			iso = "2026-11-0$day",
			inMonth = true,
			isToday = day == 4,
			items = if (day == 3) printItems(5) else printItems(1),
		)
	},
	prev = PrintMonthRef(2026, 10),
	next = PrintMonthRef(2026, 12),
	isCurrentMonth = false,
)

fun fixturesBugs(): AdminBugsDto = AdminBugsDto(
	open = listOf(
		BugReportDto(
			id = "b1",
			area = "calendar",
			description = "The month grid drops Sunday events.",
			url = "/calendar",
			createdAt = "2026-11-03T17:30:00Z",
			reporterFirstName = "Ada",
			reporterLastName = "Lovelace",
		),
	),
	resolved = listOf(
		BugReportDto(id = "b0", area = "tasks", description = "Old report", createdAt = "2026-10-01T09:00:00Z"),
	),
	exportText = "BUG REGISTER\nb1 calendar: The month grid drops Sunday events.",
)

fun fixturesNlp(): AdminNlpDto = AdminNlpDto(
	phrases = listOf(
		UnmatchedPhraseDto("p1", "event_parse", "meeting third tuesday", matched = """{"title":"meeting"}""",
			count = 4, createdAt = "2026-11-01T12:00:00Z"),
		UnmatchedPhraseDto("p2", "event_parse", "lunch every other week", matched = null, count = 2, createdAt = "2026-11-02T12:00:00Z"),
		UnmatchedPhraseDto("p3", "bulk_edit", "move all to next friday", matched = null, count = 1, createdAt = "2026-11-03T12:00:00Z"),
	),
	resolved = listOf(UnmatchedPhraseDto("p0", "event_parse", "old phrase", count = 1, createdAt = "2026-09-01T12:00:00Z")),
	exportText = "PHRASES\nevent_parse: meeting third tuesday ×4",
)
