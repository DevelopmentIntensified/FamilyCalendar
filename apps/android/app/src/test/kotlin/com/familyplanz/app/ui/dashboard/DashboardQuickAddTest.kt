package com.familyplanz.app.ui.dashboard

import com.familyplanz.app.data.FamilyMemberDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

/**
 * The board's quick-add grammar (AC-DB-12) as a phrase table: every line the
 * card invites ("saturday for Dad", "@Dad", "high priority", "#chores") plus
 * the word orders and near-misses a phone keyboard produces.
 */
class DashboardQuickAddTest {
	private val today = LocalDate.of(2026, 11, 4)
	private val members = listOf(
		FamilyMemberDto(userId = "u1", firstName = "Mum", lastName = "Smith"),
		FamilyMemberDto(userId = "u2", firstName = "Dad", lastName = "Smith"),
		FamilyMemberDto(userId = "u3", firstName = "Ada", lastName = "Smith"),
	)

	private fun parse(input: String) = parseBoardQuickAdd(input, members, today)

	@Test
	fun `a plain line is just a title`() {
		val parsed = parse("take out bins")
		assertEquals("take out bins", parsed.title)
		assertNull(parsed.dueDate)
		assertEquals("normal", parsed.priority)
		assertNull(parsed.assignedTo)
		assertNull(parsed.unknownMember)
		assertEquals(emptyList<String>(), parsed.tags)
	}

	@Test
	fun `AC-DB-12 take out bins saturday for Dad`() {
		val parsed = parse("take out bins saturday for Dad")
		assertEquals("take out bins", parsed.title)
		assertEquals(LocalDate.of(2026, 11, 7), parsed.dueDate)
		assertEquals("u2", parsed.assignedTo)
	}

	@Test
	fun `the assignee phrase survives any position`() {
		listOf(
			"for Dad take out bins saturday",
			"saturday for Dad take out bins",
			"take out bins for Dad saturday",
		).forEach { line ->
			val parsed = parse(line)
			assertEquals(line, "take out bins", parsed.title)
			assertEquals(line, "u2", parsed.assignedTo)
			assertEquals(line, LocalDate.of(2026, 11, 7), parsed.dueDate)
		}
	}

	@Test
	fun `an at handle works with or without the trigger word`() {
		assertEquals("u2", parse("@Dad pay rent").assignedTo)
		assertEquals("pay rent", parse("@Dad pay rent").title)
		assertEquals("u3", parse("assign to Ada tidy room").assignedTo)
		assertEquals("u3", parse("tidy room assign Ada").assignedTo)
	}

	@Test
	fun `a handle that names nobody is reported, never silently dropped`() {
		val parsed = parse("@ghost pay rent")
		assertEquals("@ghost", parsed.unknownMember)
		assertNull(parsed.assignedTo)
		assertEquals("pay rent", parsed.title)
	}

	@Test
	fun `every day phrase lands on the right day`() {
		val cases = mapOf(
			"bins today" to LocalDate.of(2026, 11, 4),
			"bins tomorrow" to LocalDate.of(2026, 11, 5),
			"bins saturday" to LocalDate.of(2026, 11, 7),
			"bins sat" to LocalDate.of(2026, 11, 7),
			"bins next friday" to LocalDate.of(2026, 11, 6),
			"bins next monday" to LocalDate.of(2026, 11, 9),
			"bins wednesday" to LocalDate.of(2026, 11, 11),
		)
		cases.forEach { (line, day) ->
			assertEquals(line, day, parse(line).dueDate)
			assertEquals(line, "bins", parse(line).title)
		}
	}

	@Test
	fun `a line with no day leaves the due date to the server`() {
		assertNull(parse("water the plants").dueDate)
	}

	@Test
	fun `priority words in both orders, plus the colloquial ones`() {
		listOf("bins tomorrow high priority", "bins tomorrow priority: high", "bins urgent", "bins asap").forEach { line ->
			assertEquals(line, "high", parse(line).priority)
			assertEquals(line, "bins", parse(line).title)
		}
		listOf("water plants low priority", "water plants priority=low", "water plants not urgent").forEach { line ->
			assertEquals(line, "low", parse(line).priority)
			assertEquals(line, "water plants", parse(line).title)
		}
		assertEquals("normal", parse("bins tomorrow").priority)
	}

	@Test
	fun `tags are collected, lowercased and sorted`() {
		val parsed = parse("bins #Home #chores tomorrow")
		assertEquals(listOf("chores", "home"), parsed.tags)
		assertEquals("bins", parsed.title)
	}

	@Test
	fun `everything at once`() {
		val parsed = parse("Take out bins saturday for Dad high priority #chores")
		assertEquals("Take out bins", parsed.title)
		assertEquals(LocalDate.of(2026, 11, 7), parsed.dueDate)
		assertEquals("u2", parsed.assignedTo)
		assertEquals("high", parsed.priority)
		assertEquals(listOf("chores"), parsed.tags)
	}

	@Test
	fun `a line that is only modifiers leaves no title`() {
		assertEquals("", parse("tomorrow").title)
		assertEquals("", parse("#chores").title)
		assertEquals("", parse("   ").title)
	}

	@Test
	fun `a first name is never eaten out of a longer word`() {
		val parsed = parse("admire the garden")
		assertEquals("admire the garden", parsed.title)
		assertNull(parsed.assignedTo)
	}
}
