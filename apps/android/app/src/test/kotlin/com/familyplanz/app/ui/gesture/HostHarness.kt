package com.familyplanz.app.ui.gesture

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.onAllNodesWithText
import com.familyplanz.app.AppModules
import com.familyplanz.app.AppServices
import com.familyplanz.app.data.AuthSource
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.ui.FamilyPlanzHost
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.nav.StartRouteProvider
import com.familyplanz.app.ui.nav.rememberAppNav
import kotlinx.coroutines.runBlocking
import org.robolectric.RuntimeEnvironment

private const val WAIT_MS = 5_000L

/**
 * Mounts the real [FamilyPlanzHost] with the real lane modules over a
 * [FakeRepository]; only the network edge is faked. The token store is the
 * production DataStore, seeded per test so state never leaks between tests.
 * [auth] backs the sign-in screen and sign-out revoke (#288).
 */
class HostHarness(
	private val rule: ComposeContentTestRule,
	val repo: FakeRepository = FakeRepository(),
	var auth: AuthSource = FakeAuthSource(),
	/** The user's start-screen setting (G3); applies when [launch] names no tab. */
	var startRoute: StartRouteProvider = StartRouteProvider.Calendar,
) {
	val store = DataStoreTokenStore(RuntimeEnvironment.getApplication())

	fun launch(tab: PhoneTab? = PhoneTab.TASKS, token: String? = "fp_test") {
		runBlocking { if (token == null) store.clear() else store.save(token) }
		val modules = AppModules(AppServices(repo, store, auth, startRoute = startRoute))
		rule.setContent {
			MaterialTheme { FamilyPlanzHost(modules, rememberAppNav(tab?.route)) }
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
