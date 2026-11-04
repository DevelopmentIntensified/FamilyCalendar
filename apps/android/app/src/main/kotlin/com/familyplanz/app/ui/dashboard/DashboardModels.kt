@file:Suppress("TooManyFunctions")
package com.familyplanz.app.ui.dashboard

import com.familyplanz.app.data.CompletedTaskDto
import com.familyplanz.app.data.FamilyMemberDto
import com.familyplanz.app.data.GlanceEventDto
import com.familyplanz.app.data.GroceryCardItemDto
import com.familyplanz.app.data.KidsEventDto
import com.familyplanz.app.data.TaskDto
import com.familyplanz.app.ui.groceries.NO_STORE_LABEL
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/*
 * The Day Dashboard's pure model (§2.3): every grouping, label and empty-state
 * word the cards use, ported from the Svelte cards, with no Compose in sight
 * so the table-driven tests can pin each AC.
 */

/** How many grocery names a scope shows before it says "+N more" (`GroceriesCard.svelte:16`). */
const val NAMED_GROCERY_ITEMS = 3

private val DAY_LABEL = DateTimeFormatter.ofPattern("EEEE, MMMM d", Locale.ENGLISH)
private val DUE_LABEL = DateTimeFormatter.ofPattern("MMM d", Locale.ENGLISH)
private val TIME_LABEL = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH)

/** `showsModule` (109): an absent key is VISIBLE, only an explicit false hides. */
fun moduleVisible(modules: Map<String, Boolean>, id: String): Boolean = modules[id] != false

/** The `dayISO` the API sends, as the viewed local day (falls back to today when unreadable). */
fun dayOf(dayISO: String, today: LocalDate = LocalDate.now()): LocalDate =
	parseDay(dayISO) ?: today

private fun parseDay(iso: String): LocalDate? = runCatching { OffsetDateTime.parse(iso).toLocalDate() }
	.recoverCatching { ZonedDateTime.parse(iso).toLocalDate() }
	.recoverCatching { LocalDateTime.parse(iso).toLocalDate() }
	.recoverCatching { LocalDate.parse(iso.take(10)) }
	.getOrNull()

/** "Tuesday, November 3" (`cccc, LLLL d`). */
fun dateLabel(day: LocalDate): String = DAY_LABEL.format(day)

/** The header's second line: the date, then " · today" only on today. */
fun dateLine(label: String, isToday: Boolean): String = if (isToday) "$label · today" else label

/** "Nov 3" — `toLocaleDateString({month:'short', day:'numeric'})`. */
fun dueBadge(dueDate: String?): String? = parseDay(dueDate.orEmpty())?.let(DUE_LABEL::format)

/** "9:30 AM"; blank when the timestamp is unreadable (the cards show nothing then). */
@Suppress("ReturnCount")
fun timeLabel(iso: String?, zone: ZoneId = ZoneId.systemDefault()): String {
	val raw = iso?.takeIf { it.isNotBlank() } ?: return ""
	val time = runCatching { OffsetDateTime.parse(raw).atZoneSameInstant(zone).toLocalTime() }.getOrNull()
		?: runCatching { ZonedDateTime.parse(raw).withZoneSameInstant(zone).toLocalTime() }.getOrNull()
		?: runCatching { LocalDateTime.parse(raw).toLocalTime() }.getOrNull()
		?: return ""
	return TIME_LABEL.format(time)
}

/** Kids' / glance time column: "All day", else start (the glance row shows the end under it). */
fun kidsTimeLabel(event: KidsEventDto): String =
	if (event.allDay) "All day" else timeLabel(event.start)

/** " — 10:30 AM" when the event has an end, else "". */
fun endSuffix(end: String?): String = end?.takeIf { it.isNotBlank() }?.let { " — ${timeLabel(it)}" }.orEmpty()

/** `splitByRecurrence` + `groups` of TopPrioritiesCard: one-off leads, numbering continues. */
data class Top3Group(val key: String, val label: String, val start: Int, val tasks: List<TaskDto>)

fun isRecurring(task: TaskDto): Boolean = !task.recurrenceFrequency.isNullOrBlank()

fun top3Groups(tasks: List<TaskDto>): List<Top3Group> {
	val oneOff = tasks.filterNot(::isRecurring)
	val recurring = tasks.filter(::isRecurring)
	return listOf(
		Top3Group("one-off", "One-off", 0, oneOff),
		Top3Group("recurring", "Recurring", oneOff.size, recurring),
	).filter { it.tasks.isNotEmpty() }
}

/** "✓ Going" / "? Maybe" / "✕ Can't go"; null = nothing shows. */
data class RsvpVisual(val label: String, val icon: String)

fun rsvpVisual(status: String?): RsvpVisual? = when (status) {
	"going" -> RsvpVisual("Going", "✓")
	"maybe" -> RsvpVisual("Maybe", "?")
	"declined" -> RsvpVisual("Can't go", "✕")
	else -> null
}

/** The board's assignee name (`memberName` in FamilyTaskBoardCard): You / roster name / first 8. */
@Suppress("ReturnCount")
fun memberName(userId: String?, members: List<FamilyMemberDto>, meId: String): String {
	if (userId == null) return "Unassigned"
	if (userId == meId) return "You"
	val member = members.firstOrNull { it.userId == userId } ?: return userId.take(8)
	return "${member.firstName} ${member.lastName}".trim().ifEmpty { userId.take(8) }
}

/** One board column: a member and the open tasks assigned to them (empty included). */
data class BoardGroup(val ownerId: String, val name: String, val initial: String, val tasks: List<TaskDto>)

/**
 * THE COMPLETE ROSTER, empty columns included: the union of the people the
 * rows name and the people the family has, viewer first then by name.
 */
fun boardRoster(tasks: List<TaskDto>, members: List<FamilyMemberDto>, meId: String): List<BoardGroup> {
	val byOwner = tasks.groupBy { it.assignedTo ?: it.userId }
	val ids = (byOwner.keys + members.map { it.userId }).distinct()
	return ids
		.map { id -> BoardGroup(id, memberName(id, members, meId), initialOf(memberName(id, members, meId)), byOwner[id].orEmpty()) }
		.sortedWith(compareBy({ it.ownerId != meId }, { it.name.lowercase() }, { it.ownerId }))
}

/** The avatar's one or two letters (`initials()` in the Svelte cards); "Y" for You. */
@Suppress("ReturnCount")
fun initialOf(name: String): String {
	if (name == "You") return "Y"
	val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
	if (parts.isEmpty()) return "?"
	return parts.take(2).map { it.first().uppercaseChar() }.joinToString("")
}

/** One Kids' Schedule column: a child and the day's events they attend. */
data class KidGroup(val id: String, val name: String, val initials: String, val events: List<KidsEventDto>)

/** One group per child in first-event order; a shared event shows under both children. */
fun kidsGroups(events: List<KidsEventDto>): List<KidGroup> {
	val order = mutableListOf<String>()
	val names = mutableMapOf<String, String>()
	val byKid = mutableMapOf<String, MutableList<KidsEventDto>>()
	events.sortedWith(compareBy({ !it.allDay }, { it.start })).forEach { event ->
		event.kids.forEach { kid ->
			if (byKid[kid.id] == null) {
				order += kid.id
				names[kid.id] = kid.name
				byKid[kid.id] = mutableListOf()
			}
			byKid.getValue(kid.id) += event
		}
	}
	return order.map { id -> KidGroup(id, names[id].orEmpty(), initialOf(names[id].orEmpty()), byKid.getValue(id)) }
}

/** One Groceries card scope: the shared list first, then the viewer's own. */
data class GroceryScopeCard(val key: String, val label: String, val items: List<GroceryCardItemDto>)

fun groceryScopes(
	hasFamily: Boolean,
	family: List<GroceryCardItemDto>,
	mine: List<GroceryCardItemDto>,
): List<GroceryScopeCard> = buildList {
	if (hasFamily && family.isNotEmpty()) add(GroceryScopeCard("family", "Family", family))
	if (mine.isNotEmpty()) add(GroceryScopeCard("mine", "Mine", mine))
}

/** "{n} open" over both lists. */
fun groceryOpenTotal(family: List<GroceryCardItemDto>, mine: List<GroceryCardItemDto>): Int =
	family.size + mine.size

/** The store chips: each group's label, in `groupGroceriesByStore` order. */
fun groceryStoreNames(items: List<GroceryCardItemDto>): List<String> = items
	.map { it.stores.firstOrNull() ?: NO_STORE_LABEL }
	.distinct()
	.sortedWith(String.CASE_INSENSITIVE_ORDER)

/** "milk, eggs, bread" + ", +4 more" past [cap] (`NAMED = 3`). */
fun groceryNames(items: List<GroceryCardItemDto>, cap: Int = NAMED_GROCERY_ITEMS): String {
	val named = items.take(cap).joinToString(", ") { it.name }
	val extra = items.size - cap
	return if (extra > 0) "$named, +$extra more" else named
}

/** "{n} win(s)": the Completed card's count line. */
fun winsLabel(count: Int): String = if (count == 1) "1 win" else "$count wins"

/** The Completed card's rows, newest first, with each row's completion time. */
fun completedWithTime(rows: List<CompletedTaskDto>, zone: ZoneId = ZoneId.systemDefault()): List<Pair<CompletedTaskDto, String>> =
	rows.sortedByDescending { it.completedAt.orEmpty() }.map { it to timeLabel(it.completedAt, zone) }

/** "Couldn't load {labels} just now — everything else is up to date." */
fun warningBanner(warnings: List<String>): String? =
	warnings.takeIf { it.isNotEmpty() }
		?.let { "Couldn't load ${it.joinToString(", ")} just now — everything else is up to date." }

/** The glance card's two buckets: all-day rows first, then timed rows by start. */
fun glanceBuckets(events: List<GlanceEventDto>): Pair<List<GlanceEventDto>, List<GlanceEventDto>> =
	events.filter { it.allDay } to events.filterNot { it.allDay }.sortedBy { it.start }
