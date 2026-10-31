package com.familyplanz.app.domain

import com.familyplanz.app.data.ApiFactory
import com.familyplanz.app.data.TaskDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TaskDtoParsingTest {
	private val sample = """
		{"id":"t1","title":"Sweep porch","notes":null,
		"dueDate":"2026-10-30T00:00:00.000Z","recurrenceFrequency":"weekly","recurrenceInterval":2,
		"completionCount":3,"assignedTo":"u2","assignmentStatus":"accepted","priority":"high",
		"visibility":"public","assigneeFirstName":"Rae","userId":"u1","familyId":"fam1",
		"createdAt":"2026-10-01T00:00:00.000Z","focusMinutes":120,"tags":["outside"],
		"brandNewServerField":"ignored"}
	""".trimIndent()

	@Test
	fun `parses spec task, tolerates unknown fields, maps focus minutes`() {
		val task = TaskMapper.fromDto(ApiFactory.json.decodeFromString<TaskDto>(sample))
		assertEquals(TaskPriority.HIGH, task.priority)
		assertEquals(120, task.focusMinutes)
		assertEquals("Rae", task.assignedName)
		assertEquals("Sweep porch", task.title)
		assertEquals(false, task.completed)
		assertEquals(true, task.familyTask)
		assertEquals("weekly", task.recurringLabel)
	}

	@Test
	fun `focusMinutes absent or null reads as null`() {
		val absent = """{"id":"t2","title":"x"}"""
		val nulled = """{"id":"t3","title":"x","focusMinutes":null}"""
		val zero = """{"id":"t4","title":"x","focusMinutes":0}"""
		assertEquals(0, TaskMapper.fromDto(ApiFactory.json.decodeFromString<TaskDto>(zero)).focusMinutes)
		assertNull(TaskMapper.fromDto(ApiFactory.json.decodeFromString<TaskDto>(absent)).focusMinutes)
		assertNull(TaskMapper.fromDto(ApiFactory.json.decodeFromString<TaskDto>(nulled)).focusMinutes)
	}

	@Test
	fun `unknown priority value normalizes to normal`() {
		val dto = ApiFactory.json.decodeFromString<TaskDto>("""{"id":"t5","title":"x","priority":"urgent"}""")
		assertEquals(TaskPriority.NORMAL, TaskMapper.fromDto(dto).priority)
	}
}
