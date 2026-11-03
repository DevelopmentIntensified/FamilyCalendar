package com.familyplanz.app.ui.gesture

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.onAllNodesWithText
import com.familyplanz.app.data.AuthSource
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.ui.AppViewModel
import com.familyplanz.app.ui.CalendarViewModel
import com.familyplanz.app.ui.FamilyPlanzHost
import com.familyplanz.app.ui.HostViewModels
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.QuickAddViewModel
import com.familyplanz.app.ui.SignInViewModel
import kotlinx.coroutines.runBlocking
import org.robolectric.RuntimeEnvironment

private const val WAIT_MS = 5_000L

/**
 * Mounts the real [FamilyPlanzHost] with real ViewModels over a
 * [FakeRepository]; only the network edge is faked. The token store is the
 * production DataStore, seeded per test so state never leaks between tests.
 * [auth] backs the sign-in screen and sign-out revoke (#288).
 */
class HostHarness(
	private val rule: ComposeContentTestRule,
	val repo: FakeRepository = FakeRepository(),
	var auth: AuthSource = FakeAuthSource(),
) {
	val store = DataStoreTokenStore(RuntimeEnvironment.getApplication())

	fun launch(tab: PhoneTab = PhoneTab.TASKS, token: String? = "fp_test") {
		runBlocking { if (token == null) store.clear() else store.save(token) }
		val vm = AppViewModel(repo, store, auth = auth)
		val calVm = CalendarViewModel(repo)
		val quickVm = QuickAddViewModel(repo)
		val signInVm = SignInViewModel(auth)
		rule.setContent {
			MaterialTheme { FamilyPlanzHost(HostViewModels(vm, calVm, quickVm, signInVm), tab) }
		}
	}

	fun waitForText(text: String, substring: Boolean = false) {
		rule.waitUntil(WAIT_MS) {
			rule.onAllNodesWithText(text, substring = substring).fetchSemanticsNodes().isNotEmpty()
		}
	}

	fun waitForGone(text: String) {
		rule.waitUntil(WAIT_MS) {
			rule.onAllNodesWithText(text).fetchSemanticsNodes().isEmpty()
		}
	}

	fun waitFor(condition: () -> Boolean) {
		rule.waitUntil(WAIT_MS) { condition() }
	}
}
