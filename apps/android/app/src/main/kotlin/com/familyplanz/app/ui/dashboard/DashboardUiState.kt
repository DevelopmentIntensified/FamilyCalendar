package com.familyplanz.app.ui.dashboard

import com.familyplanz.app.data.CompletedTaskDto
import com.familyplanz.app.data.DashboardDto
import com.familyplanz.app.data.FamilyMemberDto
import com.familyplanz.app.data.GlanceEventDto
import com.familyplanz.app.data.GroceryCardItemDto
import com.familyplanz.app.data.KidsEventDto
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.data.VerseDto
import java.time.LocalDate

/**
 * The Day Dashboard as the screen draws it (§2.3): the server payload plus
 * the two things the phone owns before the reload lands — the rows a check
 * removed and the priority a tap re-toned.
 */
data class DashboardUiState(
	val loading: Boolean = true,
	val loadError: String? = null,
	val unauthorized: Boolean = false,
	/** The requested `?date=` (null = today, the server's own answer). */
	val requestedDate: String? = null,
	val payload: DashboardDto? = null,
	val busyId: String? = null,
	val quickTitle: String = "",
	val quickCategory: String = "",
	val quickError: String = "",
	val adding: Boolean = false,
	val hiddenIds: Set<String> = emptySet(),
	val priorityOverrides: Map<String, String> = emptyMap(),
) {
	private val data get() = payload?.data

	val meId: String get() = payload?.meId.orEmpty()

	val familyId: String? get() = payload?.familyId

	val hasFamily: Boolean get() = familyId != null

	val modules: Map<String, Boolean> get() = payload?.modules.orEmpty()

	/** A module switched off (by the user or the family) does not render. */
	fun shows(id: String): Boolean = moduleVisible(modules, id)

	/** The viewed day in the viewer's zone. */
	val day: LocalDate get() = dayOf(payload?.dayISO.orEmpty())

	val dateLabel: String get() = dateLabel(day)

	val dateLine: String get() = dateLine(dateLabel, isToday)

	val isToday: Boolean get() = payload?.isToday == true

	val verse: VerseDto? get() = payload?.dailyVerse?.takeIf { shows("verse") && it.text.isNotBlank() }

	val showsGlance: Boolean get() = shows("glance")

	val showsTop3: Boolean get() = shows("top3")

	val showsCompleted: Boolean get() = shows("completed")

	val showsBoard: Boolean get() = hasFamily && shows("board")

	val showsKids: Boolean get() = hasFamily && shows("kids")

	val showsGroceries: Boolean get() = shows("groceries")

	val glanceEvents: List<GlanceEventDto> get() = data?.dayEvents.orEmpty()

	/** One-off then Recurring, minus the rows a check just removed. */
	val top3: List<TaskDto> get() = data?.top3.orEmpty().mapNotNull(::tone)

	val top3Groups: List<Top3Group> get() = top3Groups(top3)

	val completed: List<Pair<CompletedTaskDto, String>> get() = completedWithTime(data?.completedToday.orEmpty())

	val hasAnyCard: Boolean get() = showsGlance || showsTop3 || showsCompleted || showsBoard || showsKids || showsGroceries

	val boardTasks: List<TaskDto> get() = data?.familyTasks.orEmpty().mapNotNull(::tone)

	val boardGroups: List<BoardGroup> get() = boardRoster(boardTasks, members, meId)

	val members: List<FamilyMemberDto> get() = data?.familyMembers.orEmpty()

	val weekStreak: Int get() = data?.glance?.weekStreak ?: 0

	val kidsGroups: List<KidGroup> get() = kidsGroups(data?.kidsSchedule.orEmpty())

	val familyGroceries: List<GroceryCardItemDto> get() = data?.familyGroceries.orEmpty()

	val mineGroceries: List<GroceryCardItemDto> get() = data?.mineGroceries.orEmpty()

	val groceryScopes: List<GroceryScopeCard> get() = groceryScopes(hasFamily, familyGroceries, mineGroceries)

	val groceryOpenTotal: Int get() = groceryOpenTotal(familyGroceries, mineGroceries)

	val categories: List<String> get() = payload?.taskCategories.orEmpty().map { it.name }.filter { it.isNotBlank() }

	val warningBanner: String? get() = warningBanner(payload?.warnings.orEmpty())

	/** A row's live priority, including a tap that has not reloaded yet. */
	fun priorityOf(task: TaskDto): String = priorityOverrides[task.id] ?: task.priority

	private fun tone(task: TaskDto): TaskDto? = when {
		task.id in hiddenIds -> null
		priorityOverrides[task.id].let { it != null && it != task.priority } -> task.copy(priority = priorityOf(task))
		else -> task
	}

	/** The glance card's header line: "Today at a Glance" only on today. */
	val glanceTitle: String get() = if (isToday) "Today at a Glance" else "Day at a Glance"

	val completedTitle: String get() = if (isToday) "Completed today" else "Completed this day"

	val completedEmpty: String
		get() = if (isToday) "Nothing checked off yet — your wins will land here." else "Nothing was completed this day."

	val glanceEmpty: String get() = if (isToday) "No events scheduled today" else "No events scheduled on this day"

	val kidsEmpty: String get() = if (isToday) "No kids' events today — free afternoon!" else "No kids' events this day"
}
