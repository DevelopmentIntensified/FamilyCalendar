package com.familyplanz.app.sync

import androidx.work.ListenableWorker.Result
import org.junit.Assert.assertEquals
import org.junit.Test

/** Outcome → WorkManager result: only transient failures retry (issue #268). */
class RefreshWorkResultTest {
	@Test
	fun `outcomes map to work results`() {
		val expected = mapOf(
			RefreshOutcome.SKIPPED_NO_TOKEN to Result.success(),
			RefreshOutcome.REFRESHED to Result.success(),
			RefreshOutcome.UNAUTHORIZED to Result.success(),
			RefreshOutcome.RETRY to Result.retry(),
			RefreshOutcome.FAILED to Result.failure(),
		)
		expected.forEach { (outcome, result) -> assertEquals(outcome.name, result, outcome.toWorkResult()) }
	}
}
