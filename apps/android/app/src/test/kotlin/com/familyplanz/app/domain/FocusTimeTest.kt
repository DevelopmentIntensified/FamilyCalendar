package com.familyplanz.app.domain

import com.familyplanz.app.data.ApiFactory
import com.familyplanz.app.data.TaskDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration
import java.time.Instant

/**
 * TaskFocus fusion (#289): the desktop is the only clock. `focusMinutes` holds
 * closed spans only, `focusStartedAt` the start of the open span, so the live
 * value is their sum with no double count (TaskFocus 079 "Field contract").
 */
class FocusTimeTest {
	private val now = Instant.parse("2026-11-03T10:00:00Z")

	private fun task(minutes: Int?, startedAt: Instant?) =
		TaskMapper.fromDto(TaskDto(id = "t", title = "x", focusMinutes = minutes)).copy(focusStartedAt = startedAt)

	@Test
	fun `idle task shows its closed minutes`() {
		assertEquals(40, liveFocusMinutes(task(40, null), now))
	}

	@Test
	fun `no focus time at all reads as null`() {
		assertNull(liveFocusMinutes(task(null, null), now))
	}

	@Test
	fun `running task adds whole minutes of the open span`() {
		val started = now.minus(Duration.ofMinutes(25).plusSeconds(59))
		assertEquals(65, liveFocusMinutes(task(40, started), now))
	}

	@Test
	fun `running task with no closed minutes counts the open span alone`() {
		assertEquals(25, liveFocusMinutes(task(null, now.minus(Duration.ofMinutes(25))), now))
	}

	@Test
	fun `a span younger than a minute adds nothing`() {
		assertEquals(10, liveFocusMinutes(task(10, now.minusSeconds(59)), now))
		assertEquals(0, liveFocusMinutes(task(null, now.minusSeconds(5)), now))
	}

	@Test
	fun `a start stamped in the future (clock skew) never subtracts`() {
		assertEquals(10, liveFocusMinutes(task(10, now.plusSeconds(300)), now))
	}

	@Test
	fun `focusing is exactly an open span`() {
		assertTrue(isFocusing(task(null, now)))
		assertTrue(isFocusing(task(5, now)))
		assertFalse(isFocusing(task(5, null)))
	}

	@Test
	fun `GET parse reads focusStartedAt tolerantly`() {
		fun parse(json: String) = TaskMapper.fromDto(ApiFactory.json.decodeFromString<TaskDto>(json)).focusStartedAt
		assertEquals(Instant.parse("2026-11-03T09:35:00Z"), parse("""{"id":"a","title":"x","focusStartedAt":"2026-11-03T09:35:00.000Z"}"""))
		assertEquals(Instant.parse("2026-11-03T09:35:00Z"), parse("""{"id":"a","title":"x","focusStartedAt":"2026-11-03T10:35:00+01:00"}"""))
		assertNull(parse("""{"id":"a","title":"x"}"""))
		assertNull(parse("""{"id":"a","title":"x","focusStartedAt":null}"""))
		assertNull(parse("""{"id":"a","title":"x","focusStartedAt":"not a time"}"""))
	}
}
