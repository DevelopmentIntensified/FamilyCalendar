package com.familyplanz.app.ui.shell

import android.os.Looper
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.data.AuthResult
import com.familyplanz.app.data.AuthSource
import com.familyplanz.app.push.SessionHooks
import com.familyplanz.app.ui.gesture.FakeAuthSource
import com.familyplanz.app.ui.auth.SessionCredentials
import com.familyplanz.app.ui.gesture.FakeRepository
import com.familyplanz.app.ui.tasks.TasksViewModel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
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
		val vm = SessionViewModel(store, hooks)
		vm.signIn(SessionCredentials("  fp_new "))
		awaitCalls(listOf("in fp_new"))
	}

	@Test
	fun `clearing reports sign-out with the previous bearer, after it is gone from the store`() {
		runBlocking { store.save("fp_old") }
		val vm = SessionViewModel(store, hooks)
		vm.clearToken()
		awaitCalls(listOf("out fp_old null"))
		assertNull(runBlocking { store.token() })
	}

	private fun awaitUserId(expected: String?) {
		val deadline = System.currentTimeMillis() + 5_000
		while (runBlocking { store.userId() } != expected && System.currentTimeMillis() < deadline) {
			shadowOf(Looper.getMainLooper()).idle()
			Thread.sleep(10)
		}
		assertEquals(expected, runBlocking { store.userId() })
	}

	@Test
	fun `GET me id is stored for the push worker (#281) and dropped on sign-out`() {
		runBlocking { store.save("fp_me") }
		TasksViewModel(FakeRepository(), store)
		awaitUserId(FakeRepository.ME)
		SessionViewModel(store, hooks).clearToken()
		awaitUserId(null)
	}

	@Test
	fun `a new token forgets the previous account's id until GET me answers`() {
		runBlocking {
			store.save("fp_a")
			store.saveUserId("someone-else")
			store.save("fp_b")
		}
		assertNull(runBlocking { store.userId() })
	}

	@Test
	fun `native sign-in stores the token and the response's user id, then runs the sign-in hook`() {
		runBlocking { store.clear() }
		val vm = SessionViewModel(store, hooks)
		vm.signIn(SessionCredentials("fp_native", userId = "u-native"))
		awaitCalls(listOf("in fp_native"))
		assertEquals("u-native", runBlocking { store.userId() })
	}

	@Test
	fun `sign-out unregisters with the old bearer first, then revokes it at the server (#288)`() {
		runBlocking { store.save("fp_old") }
		val auth = object : AuthSource by FakeAuthSource() {
			override suspend fun logout(bearer: String): AuthResult<Unit> {
				calls += "logout $bearer"
				return AuthResult.Ok(Unit)
			}
		}
		val vm = SessionViewModel(store, hooks, auth)
		vm.clearToken()
		awaitCalls(listOf("out fp_old null", "logout fp_old"))
	}

	@Test
	fun `guest sign-in shows the guest note until dismissed, across a restart`() {
		runBlocking { store.clear() }
		val vm = SessionViewModel(store, hooks)
		vm.signIn(SessionCredentials("fp_guest", userId = "g1", guest = true))
		awaitCalls(listOf("in fp_guest"))
		assertEquals(true, vm.guestNote.visible.value)

		val restarted = SessionViewModel(store, hooks)
		awaitTrue { restarted.guestNote.visible.value }
		restarted.guestNote.dismiss()
		awaitTrue { !runBlocking { store.guestNote() } }
	}

	@Test
	fun `leaving the session drops its lane ViewModels, a new sign-in starts fresh (#292)`() {
		runBlocking { store.save("fp_lanes") }
		val vm = SessionViewModel(store, hooks)
		awaitTrue { vm.state.value is SessionState.SignedIn }
		val first = (vm.state.value as SessionState.SignedIn).lanes
		val lane = ViewModelProvider(first, viewModelFactory { initializer { Probe() } })[Probe::class.java]

		vm.invalidateSession()
		assertEquals(SessionState.SignedOut(SESSION_ENDED_NOTE), vm.state.value)
		assertEquals(true, lane.cleared)

		vm.signIn(SessionCredentials("fp_again"))
		awaitTrue { vm.state.value is SessionState.SignedIn }
		assertNotSame(first, (vm.state.value as SessionState.SignedIn).lanes)
	}

	private class Probe : ViewModel() {
		var cleared = false

		override fun onCleared() {
			cleared = true
		}
	}

	private fun awaitTrue(condition: () -> Boolean) {
		val deadline = System.currentTimeMillis() + 5_000
		while (!condition() && System.currentTimeMillis() < deadline) {
			shadowOf(Looper.getMainLooper()).idle()
			Thread.sleep(10)
		}
		assertEquals(true, condition())
	}
}
