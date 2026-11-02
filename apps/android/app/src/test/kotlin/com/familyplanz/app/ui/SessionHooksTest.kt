package com.familyplanz.app.ui

import android.os.Looper
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.push.SessionHooks
import com.familyplanz.app.ui.gesture.FakeRepository
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

/** Issue #273: token entry registers the device; sign-out unregisters with the token being cleared. */
@RunWith(RobolectricTestRunner::class)
class SessionHooksTest {
	private val store = DataStoreTokenStore(RuntimeEnvironment.getApplication())
	private val calls = mutableListOf<String>()
	private val hooks = object : SessionHooks {
		override suspend fun signedIn() {
			calls += "in ${store.token()}"
		}

		override suspend fun signedOut(previousBearer: String?) {
			calls += "out $previousBearer ${store.token()}"
		}
	}

	private fun awaitCalls(expected: List<String>) {
		val deadline = System.currentTimeMillis() + 5_000
		while (calls != expected && System.currentTimeMillis() < deadline) {
			shadowOf(Looper.getMainLooper()).idle()
			Thread.sleep(10)
		}
		assertEquals(expected, calls)
	}

	@Test
	fun `saving a token reports sign-in after it is stored`() {
		runBlocking { store.clear() }
		val vm = AppViewModel(FakeRepository(), store, hooks)
		vm.saveToken("  fp_new ")
		awaitCalls(listOf("in fp_new"))
	}

	@Test
	fun `clearing reports sign-out with the previous bearer, after it is gone from the store`() {
		runBlocking { store.save("fp_old") }
		val vm = AppViewModel(FakeRepository(), store, hooks)
		vm.clearToken()
		awaitCalls(listOf("out fp_old null"))
		assertNull(runBlocking { store.token() })
	}
}
