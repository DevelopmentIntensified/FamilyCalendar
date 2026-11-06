package com.familyplanz.app.ui.gesture

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.ComposeTimeoutException
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import com.familyplanz.app.AppModules
import com.familyplanz.app.AppServices
import com.familyplanz.app.data.AuthSource
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.ui.FamilyPlanzHost
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.nav.StartRouteProvider
import com.familyplanz.app.ui.nav.rememberAppNav
import com.familyplanz.app.ui.shell.NetworkStatus
import com.familyplanz.app.ui.shell.PendingWrites
import com.familyplanz.app.ui.shell.ShellSource
import kotlinx.coroutines.runBlocking
import org.robolectric.RuntimeEnvironment

private const val WAIT_MS = 10_000L

/** The shell's own edges: its `/api` source (badge/bell/`/api/me`), connectivity and queued writes. */
data class ShellEdges(
	val shell: ShellSource = ShellSource.None,
	val network: NetworkStatus = NetworkStatus.Online,
	val pendingWrites: PendingWrites = PendingWrites.None,
)

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
	/** The shell chrome edges (G1/G12): badge, bell, `/api/me` banners, offline. */
	var edges: ShellEdges = ShellEdges(),
) {
	private fun scrollStep(count: Int) {
		try {
			if (rule.onAllNodesWithTag("tasks-list").fetchSemanticsNodes().isNotEmpty()) {
				rule.onNodeWithTag("tasks-list").performScrollToIndex(count % 10)
			} else {
				rule.onRoot().performTouchInput { swipeUp() }
			}
		} catch (_: Exception) {
			rule.onRoot().performTouchInput { swipeUp() }
		}
	}
	val store = DataStoreTokenStore(RuntimeEnvironment.getApplication())

	fun launch(tab: PhoneTab? = PhoneTab.TASKS, token: String? = "fp_test") {
		runBlocking { if (token == null) store.clear() else store.save(token) }
		val modules = AppModules(
			AppServices(
				repo,
				store,
				auth,
				startRoute = startRoute,
				shell = edges.shell,
				network = edges.network,
				pendingWrites = edges.pendingWrites,
			),
		)
		rule.setContent {
			MaterialTheme { FamilyPlanzHost(modules, rememberAppNav(tab?.route)) }
		}
	}

	fun waitForText(text: String, substring: Boolean = false) {
		val found = {
			rule.onAllNodesWithText(text, substring = substring).fetchSemanticsNodes().isNotEmpty()
		}
		val deadline = System.currentTimeMillis() + WAIT_MS
		var scrollIndex = 0
		while (System.currentTimeMillis() < deadline) {
			try {
				rule.waitUntil(500) { found() }
				return
			} catch (_: ComposeTimeoutException) {
				scrollStep(scrollIndex++)
			}
		}
		rule.waitUntil(1) { found() }
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

