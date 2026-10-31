package com.familyplanz.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Offline cache codec: round trip AND the corrupt-file path (truncated
 * writes on a device crash must read as "no cache", never crash the app).
 */
class TaskCacheCodecTest {
	private val task = TaskDto(id = "t1", title = "Water plants", priority = "high", focusMinutes = 12)
	private val event = EventDto(id = "e1", title = "Pumpkin carving", start = "2026-10-31T16:00:00.000Z")

	@Test
	fun `tasks round trip keeps fields`() {
		val restored = TaskCacheCodec.decodeTasks(TaskCacheCodec.encodeTasks(listOf(task)))
		assertEquals(listOf(task), restored)
	}

	@Test
	fun `events round trip keeps occurrence buckets`() {
		val restored = TaskCacheCodec.decodeEvents(TaskCacheCodec.encodeEvents(listOf(event)))
		assertEquals(listOf(event), restored)
	}

	@Test
	fun `corrupted json reads as nothing cached`() {
		assertNull(TaskCacheCodec.decodeTasks("{tasks:[truncated"))
		assertNull(TaskCacheCodec.decodeEvents("null"))
		assertNull(TaskCacheCodec.decodeEvents(""))
		assertNull(TaskCacheCodec.decodeTasks(null))
		assertTrue(true)
	}
}
