package com.familyplanz.app.ui.gesture

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.onAllNodesWithText
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.ui.AppViewModel
import com.familyplanz.app.ui.CalendarViewModel
import com.familyplanz.app.ui.FamilyPlanzHost
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.QuickAddViewModel
import kotlinx.coroutines.runBlocking
import org.robolectric.RuntimeEnvironment

private const val WAIT_MS = 5_000L

/**
 * Mounts the real [FamilyPlanzHost] with real ViewModels over a
 * [FakeRepository]; only the network edge is faked. The token store is the
 * production DataStore, seeded per test so state never leaks between tests.
 */
class HostHarness(private val rule: ComposeContentTestRule, val repo: FakeRepository = FakeRepository()) {
	fun launch(tab: PhoneTab = PhoneTab.TASKS, token: String? = "fp_test") {
		val store = DataStoreTokenStore(RuntimeEnvironment.getApplication())
		runBlocking { if (token == null) store.clear() else store.save(token) }
		val vm = AppViewModel(repo, store)
		val calVm = CalendarViewModel(repo)
		val quickVm = QuickAddViewModel(repo)
		rule.setContent {
			MaterialTheme { FamilyPlanzHost(vm, calVm, quickVm, tab) }
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
