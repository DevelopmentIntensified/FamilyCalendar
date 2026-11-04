package com.familyplanz.app.ui.dashboard

import com.familyplanz.app.data.CompletedTaskDto
import com.familyplanz.app.data.FamilyMemberDto
import com.familyplanz.app.data.GlanceEventDto
import com.familyplanz.app.data.GroceryCardItemDto
import com.familyplanz.app.data.KidsEventDto
import com.familyplanz.app.data.KidDto
import com.familyplanz.app.data.TaskDto
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.util.TimeZone

/**
 * §2.3's pure model, one row per phrasing the cards draw: the date line, the
 * due/time labels, the Top-3 grouping and numbering, the board roster with its
 * empty columns, the kids and grocery groupings, and the empty-state copy
 * (AC-DB-1, 2, 7, 8, 11, 13, 14).
 */
class DashboardModelsTest {
	private val zone = ZoneId.of("America/Chicago")
	private lateinit var defaultZone: TimeZone

	@Before
	fun pinZone() {
		defaultZone = TimeZone.getDefault()
		TimeZone.setDefault(TimeZone.getTimeZone(zone))
	}

	@After
	fun restoreZone() {
		TimeZone.setDefault(defaultZone)
	}

	@Test
	fun `an absent module key is visible, only an explicit false hides`() {
		val modules = mapOf("kids" to false, "glance" to true)
		assertTrue(moduleVisible(modules, "verse"))
		assertTrue(moduleVisible(modules, "glance"))
		assertEquals(false, moduleVisible(modules, "kids"))
	}

	@Test
	fun `the date line names the day and adds today only on today`() {
		val day = LocalDate.of(2026, 11, 3)
		assertEquals("Tuesday, November 3", dateLabel(day))
		assertEquals("Tuesday, November 3 · today", dateLine(dateLabel(day), true))
		assertEquals("Tuesday, November 3", dateLine(dateLabel(day), false))
	}

	@Test
	fun `dayISO from any zone form lands on the same day`() {
		val expected = LocalDate.of(2026, 11, 3)
		assertEquals(expected, dayOf("2026-11-03T00:00:00.000-06:00"))
		assertEquals(expected, dayOf("2026-11-03T05:00:00.000Z"))
		assertEquals(expected, dayOf("2026-11-03"))
		assertEquals(expected, dayOf("not-a-date", today = expected))
	}

	@Test
	fun `the due badge is a short month and day`() {
		assertEquals("Nov 3", dueBadge("2026-11-03T00:00:00.000Z"))
		assertEquals("Nov 3", dueBadge("2026-11-03"))
		assertNull(dueBadge(null))
	}

	@Test
	fun `timed rows read start over end in the viewer's zone`() {
		assertEquals("8:00 AM", timeLabel("2026-11-03T14:00:00.000Z", zone))
		assertEquals("9:30 AM", timeLabel("2026-11-03T15:30:00.000Z", zone))
		assertEquals(" — 9:30 AM", endSuffix("2026-11-03T15:30:00.000Z"))
		assertEquals("", endSuffix(null))
		assertEquals("", endSuffix("  "))
	}

	@Test
	fun `kids rows say All day or the start time`() {
		assertEquals("All day", kidsTimeLabel(KidsEventDto(id = "k1", title = "Camp", start = "2026-11-03T00:00:00.000Z", allDay = true)))
		assertTrue(kidsTimeLabel(KidsEventDto(id = "k2", title = "Soccer", start = "2026-11-03T22:00:00.000Z")).isNotBlank())
	}

	@Test
	fun `top 3 groups one-off first, numbering carries on into recurring`() {
		val tasks = listOf(
			task("t1", "Bins"),
			task("t2", "Rent", recurring = "monthly"),
			task("t3", "Email"),
			task("t4", "Water", recurring = "weekly"),
		)
		val groups = top3Groups(tasks)
		assertEquals(listOf("one-off", "recurring"), groups.map { it.key })
		assertEquals(listOf("t1", "t3"), groups[0].tasks.map { it.id })
		assertEquals(0, groups[0].start)
		assertEquals(2, groups[1].start)
		assertEquals(listOf("t2", "t4"), groups[1].tasks.map { it.id })
	}

	@Test
	fun `only the groups that have rows are drawn`() {
		assertEquals(listOf("recurring"), top3Groups(listOf(task("t2", "Rent", recurring = "monthly"))).map { it.key })
		assertTrue(top3Groups(emptyList()).isEmpty())
	}

	@Test
	fun `initials take the first letters of the first two names`() {
		assertEquals("Y", initialOf("You"))
		assertEquals("DS", initialOf("Dad Smith"))
		assertEquals("AD", initialOf("  ada   dee "))
		assertEquals("?", initialOf(""))
	}

	@Test
	fun `a member with no tasks still gets a column, viewer first`() {
		val members = listOf(
			FamilyMemberDto(userId = "u2", firstName = "Dad", lastName = "Smith"),
			FamilyMemberDto(userId = "u3", firstName = "Ada", lastName = "Smith"),
			FamilyMemberDto(userId = "u1", firstName = "Mum", lastName = "Smith"),
		)
		val groups = boardRoster(listOf(task("t1", "Bins", assignedTo = "u2", family = true)), members, meId = "u1")
		assertEquals(listOf("u1", "u3", "u2"), groups.map { it.ownerId })
		assertEquals("You", groups[0].name)
		assertTrue(groups[0].tasks.isEmpty())
		assertEquals(listOf("t1"), groups[2].tasks.map { it.id })
	}

	@Test
	fun `the roster is exactly the people named plus the family, never a phantom column`() {
		val members = listOf(FamilyMemberDto(userId = "u2", firstName = "Dad", lastName = "Smith"))
		val groups = boardRoster(listOf(task("t1", "Bins", assignedTo = "u2", family = true)), members, meId = "u1")
		assertEquals(listOf("u2"), groups.map { it.ownerId })
	}

	@Test
	fun `an assignee the roster forgot is named by the first 8 characters of the id`() {
		val groups = boardRoster(listOf(task("t1", "Bins", assignedTo = "ghost-1234", family = true)), emptyList(), meId = "u1")
		assertEquals("ghost-12", groups.single().name)
		assertEquals("Unassigned", memberName(null, emptyList(), "u1"))
	}

	@Test
	fun `kids group in first-event order, a shared event under both children`() {
		val shared = KidsEventDto(
			id = "k1", title = "Church", start = "2026-11-03T15:00:00.000Z",
			kids = listOf(KidDto("kid-1", "Ada"), KidDto("kid-2", "Bo")),
		)
		val solo = KidsEventDto(id = "k2", title = "Soccer", start = "2026-11-03T22:00:00.000Z", kids = listOf(KidDto("kid-2", "Bo")))
		val groups = kidsGroups(listOf(solo, shared))
		assertEquals(listOf("kid-1", "kid-2"), groups.map { it.id })
		assertEquals(listOf("k1"), groups[0].events.map { it.id })
		assertEquals(listOf("k1", "k2"), groups[1].events.map { it.id })
		assertEquals("A", groups[0].initials)
	}

	@Test
	fun `grocery scopes lead with the shared list and total both`() {
		val family = listOf(item("milk"), item("eggs"))
		val mine = listOf(item("bread"))
		val scopes = groceryScopes(true, family, mine)
		assertEquals(listOf("family", "mine"), scopes.map { it.key })
		assertEquals(listOf("Family", "Mine"), scopes.map { it.label })
		assertEquals(3, groceryOpenTotal(family, mine))
		assertEquals(listOf("mine"), groceryScopes(false, family, mine).map { it.key })
		assertTrue(groceryScopes(true, emptyList(), emptyList()).isEmpty())
	}

	@Test
	fun `store chips are one per primary store, Any store included`() {
		val items = listOf(item("milk", "Aldi"), item("eggs", "Kroger"), item("bread", "Aldi"), item("jam"))
		assertEquals(listOf("Aldi", "Any store", "Kroger"), groceryStoreNames(items))
	}

	@Test
	fun `names stop at 3 and count the rest as more`() {
		val four = listOf(item("milk"), item("eggs"), item("bread"), item("jam"))
		assertEquals("milk, eggs, bread, +1 more", groceryNames(four))
		assertEquals("milk, eggs", groceryNames(four.take(2)))
	}

	@Test
	fun `the wins line is singular only at one`() {
		assertEquals("0 wins", winsLabel(0))
		assertEquals("1 win", winsLabel(1))
		assertEquals("2 wins", winsLabel(2))
	}

	@Test
	fun `completed rows lead with the newest and carry their time`() {
		val rows = listOf(
			CompletedTaskDto("t1", "Milk", "2026-11-03T14:00:00.000Z"),
			CompletedTaskDto("t2", "Eggs", "2026-11-03T16:30:00.000Z"),
		)
		val completed = completedWithTime(rows, zone)
		assertEquals(listOf("t2", "t1"), completed.map { it.first.id })
		assertEquals("10:30 AM", completed[0].second)
	}

	@Test
	fun `a warning names what could not load`() {
		assertNull(warningBanner(emptyList()))
		assertEquals(
			"Couldn't load Homework just now — everything else is up to date.",
			warningBanner(listOf("Homework")),
		)
	}

	@Test
	fun `the glance leads with all-day rows, then timed rows by start`() {
		val late = GlanceEventDto(id = "e2", title = "Dinner", start = "2026-11-03T23:00:00.000Z")
		val early = GlanceEventDto(id = "e3", title = "Dentist", start = "2026-11-03T14:00:00.000Z")
		val allDay = GlanceEventDto(id = "e1", title = "Camp", start = "2026-11-03T00:00:00.000Z", allDay = true)
		val (head, tail) = glanceBuckets(listOf(late, early, allDay))
		assertEquals(listOf("e1"), head.map { it.id })
		assertEquals(listOf("e3", "e2"), tail.map { it.id })
	}

	@Test
	fun `rsvp words match the three answers and nothing else`() {
		assertEquals("✓ Going", rsvpVisual("going")?.let { "${it.icon} ${it.label}" })
		assertEquals("? Maybe", rsvpVisual("maybe")?.let { "${it.icon} ${it.label}" })
		assertEquals("✕ Can't go", rsvpVisual("declined")?.let { "${it.icon} ${it.label}" })
		assertNull(rsvpVisual("undecided"))
		assertNull(rsvpVisual(null))
	}

	private fun task(id: String, title: String, recurring: String? = null, assignedTo: String? = null, family: Boolean = false) =
		TaskDto(
			id = id,
			title = title,
			recurrenceFrequency = recurring,
			assignedTo = assignedTo,
			familyId = if (family) "fam-1" else null,
			userId = "u1",
		)

	private fun item(name: String, store: String? = null) =
		GroceryCardItemDto(name = name, stores = listOfNotNull(store))
}
