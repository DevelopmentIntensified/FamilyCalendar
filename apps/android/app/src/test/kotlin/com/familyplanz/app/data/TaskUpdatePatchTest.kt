package com.familyplanz.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

/**
 * regression guard for the TaskFocus rule: phone-side writes never carry
 * focusMinutes (desktop is the only focus writer). These tests fail if
 * anyone adds that field to a phone write path.
 */
class TaskUpdatePatchTest {
	@Test
	fun `completeToggle serializes exactly the toggle field`() {
		val patch = TaskUpdatePatch.completeToggle()
		assertEquals("""{"toggleComplete":true}""", patch.json.toString())
	}

	@Test
	fun `phone patch can never carry focusMinutes`() {
		val json = TaskUpdatePatch.completeToggle().json.toString()
		assertFalse("focusMinutes must not appear on phone writes", json.contains("focusMinutes"))
	}
}
