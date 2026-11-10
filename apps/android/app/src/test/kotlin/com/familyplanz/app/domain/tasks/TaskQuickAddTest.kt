package com.familyplanz.app.domain.tasks

import com.familyplanz.app.domain.TaskPriority
import java.io.File
import java.time.LocalDate
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The web's quick-add phrase table (src/lib/utils/taskQuickAdd.test.ts),
 * vector for vector: `NOW` is Fri 2026-08-28, due dates compare calendar days.
 *
 * Issue 323 (Lane B): both suites read the same table from
 * shared/parse-vectors.json, so the web parser and this port cannot drift
 * apart unnoticed. Only the keys present in a vector are asserted.
 */
class TaskQuickAddTest {
	private val now: LocalDate = LocalDate.of(2026, 8, 28)

	/**
	 * Gradle's unit-test working directory is the module (apps/android/app) on
	 * some AGP versions and the Gradle root (apps/android) on others, so walk up
	 * from user.dir to the checkout root that holds shared/.
	 */
	private val vectors: JsonObject = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
		.map { it.resolve("shared/parse-vectors.json") }
		.firstOrNull { it.exists() }
		?.let { Json.parseToJsonElement(it.readText()).jsonObject }
		?: error("shared/parse-vectors.json not found above ${System.getProperty("user.dir")}")

	private val rosters: Map<String, List<QuickAddMember>> = vectors.getValue("rosters").jsonObject
		.mapValues { (_, members) ->
			members.jsonArray.map { member ->
				val m = member.jsonObject
				QuickAddMember(m.text("userId"), m.text("firstName"), m.text("lastName"))
			}
		}

	private val sections: List<JsonObject> = vectors.getValue("sections").jsonArray.map { it.jsonObject }

	private fun JsonObject.text(key: String): String = getValue(key).jsonPrimitive.content

	private fun JsonObject.number(key: String): Int = getValue(key).jsonPrimitive.int

	private fun JsonObject.flag(key: String): Boolean = getValue(key).jsonPrimitive.boolean

	private fun JsonObject.textOrNull(key: String): String? =
		get(key)?.takeUnless { it is JsonNull }?.jsonPrimitive?.content

	private fun assertDue(phrase: String, actual: LocalDate?, due: JsonElement) {
		if (due is JsonNull) {
			assertNull(phrase, actual)
			return
		}
		val spec = due.jsonObject
		val expected = if (spec.containsKey("days")) {
			now.plusDays(spec.number("days").toLong())
		} else {
			LocalDate.parse(spec.text("date"))
		}
		assertEquals(phrase, expected, actual)
	}

	private fun assertRecurrence(phrase: String, r: TaskQuickAddResult, recurrence: JsonElement) {
		if (recurrence is JsonNull) {
			assertNull(phrase, r.recurrenceFrequency)
			assertNull(phrase, r.recurrenceInterval)
			return
		}
		val spec = recurrence.jsonObject
		assertEquals(phrase, spec.text("frequency"), r.recurrenceFrequency)
		assertEquals(phrase, spec.number("interval"), r.recurrenceInterval)
	}

	private fun assertVector(vector: JsonObject) {
		val phrase = vector.text("phrase")
		val members = vector.textOrNull("roster")?.let { rosters.getValue(it) } ?: emptyList()
		val expectedMatch = vector["findAssignee"]
		if (expectedMatch != null) {
			val match = findTaskAssignee(phrase, members)
			if (expectedMatch is JsonNull) {
				assertNull(phrase, match)
				return
			}
			val want = expectedMatch.jsonObject
			assertEquals(phrase, want.text("userId"), match?.userId)
			if (want.containsKey("length")) assertEquals(phrase, want.number("length"), match?.length)
			return
		}
		val r = parseTaskQuickAdd(phrase, now, members)
		assertTextFields(phrase, vector, r)
		assertStateFields(phrase, vector, r)
	}

	/** Title, priority, due, assignee and tags: asserted only when the vector names them. */
	private fun assertTextFields(phrase: String, vector: JsonObject, r: TaskQuickAddResult) {
		if (vector.containsKey("title")) assertEquals(phrase, vector.text("title"), r.title)
		if (vector.containsKey("priority")) {
			assertEquals(phrase, TaskPriority.valueOf(vector.text("priority").uppercase()), r.priority)
		}
		if (vector.containsKey("due")) assertDue(phrase, r.due, vector.getValue("due"))
		if (vector.containsKey("assignedTo")) assertEquals(phrase, vector.textOrNull("assignedTo"), r.assignedTo)
		if (vector.containsKey("unknownMember")) {
			assertEquals(phrase, vector.textOrNull("unknownMember"), r.unknownMember)
		}
		if (vector.containsKey("tags")) {
			val tags = vector.getValue("tags").jsonArray.map { it.jsonPrimitive.content }
			assertEquals(phrase, tags, r.tags)
		}
	}

	/** Recurrence, visibility and the family flag: asserted only when the vector names them. */
	private fun assertStateFields(phrase: String, vector: JsonObject, r: TaskQuickAddResult) {
		if (vector.containsKey("recurrence")) assertRecurrence(phrase, r, vector.getValue("recurrence"))
		if (vector.containsKey("visibility")) assertEquals(phrase, vector.text("visibility"), r.visibility)
		if (vector.containsKey("visibilityExplicit")) {
			assertEquals(phrase, vector.flag("visibilityExplicit"), r.visibilityExplicit)
		}
		if (vector.containsKey("familyTask")) assertEquals(phrase, vector.flag("familyTask"), r.familyTask)
	}

	private fun runSections(vararg ids: String) {
		for (id in ids) {
			sections.first { it.text("id") == id }.getValue("vectors").jsonArray.forEach {
				assertVector(it.jsonObject)
			}
		}
	}

	@Test
	fun due_date_phrases() = runSections("dueDatePhrases")

	@Test
	fun priority_keywords_in_any_order() = runSections("priorityKeywords")

	@Test
	fun date_and_priority_combine() = runSections("dateAndPriority")

	@Test
	fun find_task_assignee_is_roster_scoped() = runSections("findAssignee")

	@Test
	fun assignee_phrases_strip_and_assign() = runSections("assigneePhrases")

	@Test
	fun hashtags_collect_lowercased_sorted() = runSections("hashtags")

	@Test
	fun recurrence_cadences() = runSections("recurrence")

	@Test
	fun scoping_visibility_family_and_handles() = runSections("scoping")

	@Test
	fun multi_word_handles_take_the_greedy_longest_match() = runSections("multiWordHandles")

	@Test
	fun richer_date_phrases() = runSections("richerDates", "canvasDueLines")

	@Test
	fun vector_file_matches_web_suite() {
		assertEquals(LocalDate.parse(vectors.text("nowDate")), now)
		assertEquals(145, sections.sumOf { it.getValue("vectors").jsonArray.size })
	}
}
