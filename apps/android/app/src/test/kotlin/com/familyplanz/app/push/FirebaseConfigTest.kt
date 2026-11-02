package com.familyplanz.app.push

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Issue #273: firebase.properties absent or partial → push disabled; present → trimmed values. */
class FirebaseConfigTest {
	@Test
	fun `any blank value disables push`() {
		assertNull(FirebaseConfig.of("", "", "", ""))
		assertNull(FirebaseConfig.of("fp-prod", "1:2:android:3", " ", "123"))
		assertNull(FirebaseConfig.of("fp-prod", "", "key", "123"))
	}

	@Test
	fun `complete values are trimmed`() {
		assertEquals(
			FirebaseConfig("fp-prod", "1:2:android:3", "key", "123"),
			FirebaseConfig.of(" fp-prod", "1:2:android:3 ", "key", "123\n"),
		)
	}
}
