package com.familyplanz.app.domain.tasks

import com.familyplanz.app.domain.TaskPriority
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The web's quick-add phrase table (src/lib/utils/taskQuickAdd.test.ts),
 * vector for vector: `NOW` is Fri 2026-08-28, due dates compare calendar days.
 */
class TaskQuickAddTest {
	private val now: LocalDate = LocalDate.of(2026, 8, 28)

	private fun parse(raw: String, members: List<QuickAddMember> = emptyList()) = parseTaskQuickAdd(raw, now, members)

	private fun assertDue(r: TaskQuickAddResult, daysFromNow: Long) = assertEquals(now.plusDays(daysFromNow), r.due)

	private fun assertRecurring(r: TaskQuickAddResult, frequency: String, interval: Int) {
		assertEquals(frequency, r.recurrenceFrequency)
		assertEquals(interval, r.recurrenceInterval)
	}

	private val roster = listOf(
		QuickAddMember("u-sam", "Sam", "Rivera"),
		QuickAddMember("u-mom", "Mom", ""),
		QuickAddMember("u-dad", "Dad", "Chen"),
	)

	@Test
	fun due_date_phrases() {
		listOf(
			Triple("buy milk tomorrow", "buy milk", 1L),
			Triple("clean gutters saturday", "clean gutters", 1L),
			Triple("call mom mon", "call mom", 3L),
			Triple("call mom today", "call mom", 0L),
			Triple("review budget friday", "review budget", 7L),
		).forEach { (phrase, title, days) ->
			val r = parse(phrase)
			assertEquals(phrase, title, r.title)
			assertEquals(phrase, TaskPriority.NORMAL, r.priority)
			assertDue(r, days)
		}
		val none = parse("plan homemade sushi")
		assertEquals("plan homemade sushi", none.title)
		assertNull(none.due)
	}

	@Test
	fun priority_keywords_in_any_order() {
		listOf(
			Triple("high priority buy milk", TaskPriority.HIGH, "buy milk"),
			Triple("urgent call dentist", TaskPriority.HIGH, "call dentist"),
			Triple("asap pay the invoice", TaskPriority.HIGH, "pay the invoice"),
			Triple("buy milk high priority", TaskPriority.HIGH, "buy milk"),
			Triple("pay the invoice ASAP", TaskPriority.HIGH, "pay the invoice"),
			Triple("urgent: call dentist", TaskPriority.HIGH, "call dentist"),
			Triple("priority high file taxes", TaskPriority.HIGH, "file taxes"),
			Triple("file taxes priority: high", TaskPriority.HIGH, "file taxes"),
			Triple("high-priority deploy build", TaskPriority.HIGH, "deploy build"),
			Triple("low priority tidy desk", TaskPriority.LOW, "tidy desk"),
			Triple("tidy desk low priority", TaskPriority.LOW, "tidy desk"),
			Triple("priority low water plants", TaskPriority.LOW, "water plants"),
			Triple("water the plants priority: low", TaskPriority.LOW, "water the plants"),
			Triple("file paperwork not urgent", TaskPriority.LOW, "file paperwork"),
		).forEach { (phrase, priority, title) ->
			val r = parse(phrase)
			assertEquals(phrase, title, r.title)
			assertEquals(phrase, priority, r.priority)
			assertNull(phrase, r.due)
		}
		assertEquals(TaskPriority.NORMAL, parse("take out trash").priority)
	}

	@Test
	fun date_and_priority_combine() {
		parse("buy milk high priority tomorrow").let {
			assertEquals("buy milk", it.title)
			assertEquals(TaskPriority.HIGH, it.priority)
			assertDue(it, 1)
		}
		parse("tomorrow high priority buy milk").let {
			assertEquals("buy milk", it.title)
			assertDue(it, 1)
		}
		parse("clean gutters saturday low priority").let {
			assertEquals("clean gutters", it.title)
			assertEquals(TaskPriority.LOW, it.priority)
			assertDue(it, 1)
		}
		parse("urgent friday file taxes").let {
			assertEquals("file taxes", it.title)
			assertDue(it, 7)
		}
		parse("call dentist asap on monday").let {
			assertEquals("call dentist on", it.title)
			assertEquals(TaskPriority.HIGH, it.priority)
			assertDue(it, 3)
		}
	}

	@Test
	fun find_task_assignee_is_roster_scoped() {
		assertNull(findTaskAssignee("buy milk @sam", emptyList()))
		assertEquals("u-sam", findTaskAssignee("@sam buy milk", roster)?.userId)
		assertEquals("u-sam", findTaskAssignee("@sam rivera clean gutters", roster)?.userId)
		val full = findTaskAssignee("assign to Sam Rivera clean gutters", roster)
		assertEquals("u-sam", full?.userId)
		assertEquals("assign to Sam Rivera".length, full?.length)
		assertEquals("u-dad", findTaskAssignee("water plants for dad", roster)?.userId)
		assertEquals("u-dad", findTaskAssignee("assign dad laundry", roster)?.userId)
		assertEquals("u-mom", findTaskAssignee("task mom fold towels", roster)?.userId)
		assertNull(findTaskAssignee("assign to Sammy take notes", roster))
		assertNull(findTaskAssignee("call @samitis", roster))
		assertEquals("u-dad", findTaskAssignee("FOR DAD pay bills", roster)?.userId)
		assertNull(findTaskAssignee("buy milk for grandma", roster))
		assertNull(findTaskAssignee("buy gift for the party", roster))
		assertNull(findTaskAssignee("send to the printer", roster))
		assertEquals("u-mom", findTaskAssignee("buy milk @mom and water plants for dad", roster)?.userId)
	}

	@Test
	fun assignee_phrases_strip_and_assign() {
		listOf(
			Triple("buy milk @sam", "buy milk", "u-sam"),
			Triple("@mom water plants", "water plants", "u-mom"),
			Triple("assign to Sam Rivera clean gutters", "clean gutters", "u-sam"),
			Triple("water plants for dad", "water plants", "u-dad"),
			Triple("assign dad laundry", "laundry", "u-dad"),
			Triple("task mom fold towels", "fold towels", "u-mom"),
			Triple("FOR DAD pay bills", "pay bills", "u-dad"),
			Triple("buy milk for grandma", "buy milk for grandma", null),
			Triple("assign to Sammy take notes", "assign to Sammy take notes", null),
		).forEach { (phrase, title, who) ->
			val r = parse(phrase, roster)
			assertEquals(phrase, title, r.title)
			assertEquals(phrase, who, r.assignedTo)
		}
		parse("high priority buy milk for dad tomorrow", roster).let {
			assertEquals("buy milk", it.title)
			assertEquals(TaskPriority.HIGH, it.priority)
			assertEquals("u-dad", it.assignedTo)
			assertDue(it, 1)
		}
		parse("for dad buy milk monday", roster).let {
			assertEquals("buy milk", it.title)
			assertDue(it, 3)
		}
		parse("call vet tomorrow for mom", roster).let {
			assertEquals("call vet", it.title)
			assertEquals("u-mom", it.assignedTo)
		}
		parse("buy milk for dad").let {
			assertEquals("buy milk for dad", it.title)
			assertNull(it.assignedTo)
		}
	}

	@Test
	fun hashtags_collect_lowercased_sorted() {
		listOf(
			Triple("buy milk #groceries", "buy milk", listOf("groceries")),
			Triple("#home clean gutters", "clean gutters", listOf("home")),
			Triple("call mom #phone #family today", "call mom", listOf("family", "phone")),
			Triple("file taxes#finance", "file taxes", listOf("finance")),
			Triple("deploy build #v2_release #ci-cd", "deploy build", listOf("ci-cd", "v2_release")),
			Triple("#Groceries buy milk #GROCERIES", "buy milk", listOf("groceries")),
		).forEach { (phrase, title, tags) ->
			val r = parse(phrase)
			assertEquals(phrase, title, r.title)
			assertEquals(phrase, tags, r.tags)
		}
		assertEquals(emptyList<String>(), parse("buy milk tomorrow").tags)
		parse("#plan").let {
			assertEquals("#plan", it.title)
			assertEquals(listOf("plan"), it.tags)
		}
	}

	@Test
	fun recurrence_cadences() {
		listOf(
			Cad("buy milk every day", "daily", 1, "buy milk"),
			Cad("buy milk daily", "daily", 1, "buy milk"),
			Cad("feed cat every 2 days", "daily", 2, "feed cat"),
			Cad("gym every other day", "daily", 2, "gym"),
			Cad("laundry weekly", "weekly", 1, "laundry"),
			Cad("clean gutters every week", "weekly", 1, "clean gutters"),
			Cad("take out trash every other week", "weekly", 2, "take out trash"),
			Cad("pay rent every 2 weeks", "weekly", 2, "pay rent"),
			Cad("file taxes monthly", "monthly", 1, "file taxes"),
			Cad("water plants every month", "monthly", 1, "water plants"),
			Cad("deep clean every other month", "monthly", 2, "deep clean"),
			Cad("service car every 3 months", "monthly", 3, "service car"),
			Cad("renew passport every year", "yearly", 1, "renew passport"),
			Cad("test smoke alarms annually", "yearly", 1, "test smoke alarms"),
		).forEach { cad ->
			val r = parse(cad.phrase)
			assertEquals(cad.phrase, cad.title, r.title)
			assertRecurring(r, cad.freq, cad.interval)
			assertNull(cad.phrase, r.due)
		}
		parse("take out trash every friday").let {
			assertEquals("take out trash", it.title)
			assertRecurring(it, "weekly", 1)
			assertDue(it, 7)
		}
		parse("mow lawn every saturday").let {
			assertRecurring(it, "weekly", 1)
			assertDue(it, 1)
		}
		parse("every other saturday deep clean").let {
			assertEquals("deep clean", it.title)
			assertRecurring(it, "weekly", 2)
			assertDue(it, 1)
		}
		parse("high priority buy milk #groceries every 2 weeks tomorrow").let {
			assertEquals("buy milk", it.title)
			assertEquals(listOf("groceries"), it.tags)
			assertRecurring(it, "weekly", 2)
			assertDue(it, 1)
		}
	}

	private data class Cad(val phrase: String, val freq: String, val interval: Int, val title: String)

	private data class Handle(
		val phrase: String,
		val roster: List<QuickAddMember>,
		val title: String,
		val assigned: String?,
		val unknown: String?,
	)

	private data class Scope(
		val phrase: String,
		val title: String,
		val visibility: String,
		val explicit: Boolean,
		val family: Boolean,
		val assigned: String?,
		val unknown: String?,
	)

	@Test
	fun scoping_visibility_family_and_handles() {
		val scoping = listOf(
			QuickAddMember("u-maya", "Maya", "Lopez"),
			QuickAddMember("u-leo", "Leo", ""),
			QuickAddMember("u-samr", "Sam", "Rivera"),
		)
		listOf(
			Scope("@family #private clean the garage", "clean the garage", "private", true, true, null, null),
			Scope("clean the garage @family #private", "clean the garage", "private", true, true, null, null),
			Scope("#private clean the garage @family", "clean the garage", "private", true, true, null, null),
			Scope("@maya buy milk #private", "buy milk", "private", true, false, "u-maya", null),
			Scope("buy milk", "buy milk", "public", false, false, null, null),
			Scope("#public buy milk", "buy milk", "public", true, false, null, null),
			Scope("clean the #private garage", "clean the garage", "private", true, false, null, null),
			Scope("#PRIVATE buy milk", "buy milk", "private", true, false, null, null),
			Scope("clean gutters #public #private", "clean gutters", "private", true, false, null, null),
			Scope("buy milk #private #groceries", "buy milk", "private", true, false, null, null),
			Scope("@zoe buy milk", "buy milk", "public", false, false, null, "@zoe"),
			Scope("@MAYA buy milk", "buy milk", "public", false, false, "u-maya", null),
			Scope("@sam rivera clean gutters", "clean gutters", "public", false, false, "u-samr", null),
			Scope("@family #private @maya clean the garage", "clean the garage", "private", true, true, "u-maya", null),
		).forEach { c ->
			val r = parse(c.phrase, scoping)
			assertEquals(c.phrase, c.title, r.title)
			assertEquals(c.phrase, c.visibility, r.visibility)
			assertEquals(c.phrase, c.explicit, r.visibilityExplicit)
			assertEquals(c.phrase, c.family, r.familyTask)
			assertEquals(c.phrase, c.assigned, r.assignedTo)
			assertEquals(c.phrase, c.unknown, r.unknownMember)
		}
		assertEquals(listOf("groceries"), parse("#private buy milk #groceries").tags)
		val ambiguous = parse("@sam buy milk", listOf(QuickAddMember("u-sam1", "Sam", "One"), QuickAddMember("u-sam2", "Sam", "Two")))
		assertEquals("buy milk", ambiguous.title)
		assertNull(ambiguous.assignedTo)
		assertEquals("@sam", ambiguous.unknownMember)
		parse("buy milk @zoe").let {
			assertEquals("buy milk @zoe", it.title)
			assertNull(it.unknownMember)
		}
		assertFalse(parse("family movie night").familyTask)
		parse("buy milk #privates").let {
			assertEquals("public", it.visibility)
			assertEquals(listOf("privates"), it.tags)
		}
	}

	@Test
	fun multi_word_handles_take_the_greedy_longest_match() {
		val mixed = listOf(
			QuickAddMember("u-maryann", "Mary Ann", "Smith"),
			QuickAddMember("u-mary", "Mary", "Jones"),
			QuickAddMember("u-aunty", "Auntie May", ""),
			QuickAddMember("u-leo", "Leo", ""),
			QuickAddMember("u-samr", "Sam", "Rivera"),
		)
		val tie = listOf(QuickAddMember("u-maw", "Mary Ann", "Wu"), QuickAddMember("u-mas", "Mary Ann", "Smith"))
		listOf(
			Handle("@mary ann buy milk", mixed, "buy milk", "u-maryann", null),
			Handle("Buy @Mary Ann cookies", mixed, "Buy cookies", "u-maryann", null),
			Handle("@mary ann smith call vet", mixed, "call vet", "u-maryann", null),
			Handle("@auntie may water plants", mixed, "water plants", "u-aunty", null),
			Handle("@mary jones pay bills", mixed, "pay bills", "u-mary", null),
			Handle("@jones pay bills", mixed, "pay bills", "u-mary", null),
			Handle("@leo take out trash", mixed, "take out trash", "u-leo", null),
			Handle("buy milk @Mary Ann", mixed, "buy milk", "u-maryann", null),
			Handle("@mary cookies", tie, "cookies", null, "@mary"),
			Handle("@mary ann buy milk", tie, "buy milk", null, "@mary"),
			Handle("@mary ann wu buy milk", tie, "buy milk", "u-maw", null),
			Handle("@mary ann smith walk dog", tie, "walk dog", "u-mas", null),
			Handle("@leo feed cat @mary ann", mixed, "feed cat", "u-maryann", null),
			Handle("@zoe buy milk @mary ann wash car", mixed, "buy milk wash car", "u-maryann", "@zoe"),
		).forEach { c ->
			val r = parse(c.phrase, c.roster)
			assertEquals(c.phrase, c.title, r.title)
			assertEquals(c.phrase, c.assigned, r.assignedTo)
			assertEquals(c.phrase, c.unknown, r.unknownMember)
		}
		assertTrue(parse("@family clean the garage", mixed).familyTask)
	}

	@Test
	fun richer_date_phrases() {
		parse("call vet next monday").let { assertEquals("call vet", it.title); assertDue(it, 3) }
		parse("book flight next friday").let { assertDue(it, 7) }
		parse("renew gym in 3 days").let { assertEquals("renew gym", it.title); assertDue(it, 3) }
		parse("pay invoice in 2 weeks").let { assertDue(it, 14) }
		parse("send reminder in a week").let { assertEquals("send reminder", it.title); assertDue(it, 7) }
		parse("clean gutters next week").let { assertDue(it, 7) }
		assertEquals(LocalDate.of(2026, 9, 28), parse("water plants next month").due)
		assertEquals(LocalDate.of(2027, 8, 28), parse("renew passport next year").due)
		assertEquals(LocalDate.of(2026, 12, 25), parse("wrap gifts december 25").due)
		assertEquals(LocalDate.of(2027, 1, 5), parse("buy gift jan 5").due)
		assertEquals(LocalDate.of(2025, 1, 5), parse("clean gutters january 5, 2025").due)
		parse("plan party february 14th 2027").let {
			assertEquals("plan party", it.title)
			assertEquals(LocalDate.of(2027, 2, 14), it.due)
		}
		parse("water plants once a month").let {
			assertEquals("water plants once a month", it.title)
			assertNull(it.due)
			assertNull(it.recurrenceFrequency)
		}
		assertNull(parse("plan a week long trip").due)
	}

	@Test
	fun canvas_due_lines() {
		listOf(
			Triple("Discussion Thread: Biblical Inerrancy Due Sep 10 at 11:59pm", "Discussion Thread: Biblical Inerrancy",
				LocalDate.of(2026, 9, 10)),
			Triple("Research Paper: Outline Assignment Due Sep 13 at 11:59pm", "Research Paper: Outline Assignment", LocalDate.of(2026, 9, 13)),
			Triple("Due Oct 4 at 11:59pm Practical Theology: The Word of God Assignment", "Practical Theology: The Word of God Assignment",
				LocalDate.of(2026, 10, 4)),
			Triple("due sept 20 at 11:59 pm Wonder of God", "Wonder of God", LocalDate.of(2026, 9, 20)),
			Triple("Discussion Thread: The Trinity Due Sep 24 at 11:59PM", "Discussion Thread: The Trinity", LocalDate.of(2026, 9, 24)),
		).forEach { (phrase, title, due) ->
			val r = parse(phrase)
			assertEquals(phrase, title, r.title)
			assertEquals(phrase, due, r.due)
		}
		parse("call dentist at 3pm").let {
			assertEquals("call dentist at 3pm", it.title)
			assertNull(it.due)
		}
		parse("high priority buy milk for mom #family in 3 days", listOf(QuickAddMember("u-mom", "Mom", ""))).let {
			assertEquals("buy milk", it.title)
			assertEquals("u-mom", it.assignedTo)
			assertEquals(listOf("family"), it.tags)
			assertDue(it, 3)
		}
	}
}
