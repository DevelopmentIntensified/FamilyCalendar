package com.familyplanz.app.ui.admin

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.AdminCountsDto
import com.familyplanz.app.testing.fixturesBugs
import com.familyplanz.app.testing.fixturesNlp
import com.familyplanz.app.ui.secondary.Load
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** #299: the admin landing counts, the bug register and the unmatched-phrase register. */
@RunWith(RobolectricTestRunner::class)
class AdminScreensTest {
	@get:Rule
	val rule = createComposeRule()

	private fun show(content: @Composable () -> Unit) {
		rule.setContent {
			FamilyPlanzTheme {
				Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) { content() }
			}
		}
	}

	@Test
	fun the_admin_home_counts_open_bugs_and_phrases_and_opens_each_door() {
		var bugs = 0
		var nlp = 0
		show {
			AdminHomeScreen(
				Load.Loaded(AdminCountsDto(openBugs = 3, openPhrases = 2)),
				onRetry = {},
				onBugs = { bugs++ },
				onNlp = { nlp++ },
			)
		}

		rule.onNodeWithText("Triage user feedback and parser gaps.").assertExists()
		rule.onNodeWithText("3 open").assertExists()
		rule.onNodeWithText("2 open").assertExists()
		rule.onNodeWithTag("admin-card-bugs").performClick()
		rule.onNodeWithTag("admin-card-nlp").performClick()

		assertEquals(1, bugs)
		assertEquals(1, nlp)
	}

	@Test
	fun the_bug_register_lists_open_reports_with_their_reporter_and_resolves_them() {
		var resolved: String? = null
		var copied: String? = null
		show {
			AdminBugsScreen(
				Load.Loaded(fixturesBugs()),
				BugActions(onResolve = { resolved = it }, onCopy = { copied = it }, onDownload = {}),
			)
		}

		rule.onNodeWithText("The month grid drops Sunday events.").assertExists()
		rule.onNodeWithText("Reported by Ada Lovelace").assertExists()
		rule.onNodeWithTag("bug-card").assertExists()
		rule.onNodeWithTag("bug-resolve").performClick()

		assertEquals("b1", resolved)
		rule.onNodeWithTag("resolved-toggle").performClick()
		rule.onNodeWithText("Tasks: Old report").assertExists()

		rule.onNodeWithTag("export-toggle").performClick()
		rule.onNodeWithTag("export-copy").performClick()
		assertEquals(fixturesBugs().exportText, copied)
	}

	@Test
	fun an_empty_bug_register_says_no_open_reports() {
		show { AdminBugsScreen(Load.Loaded(fixturesBugs().copy(open = emptyList(), resolved = emptyList())), BugActions()) }

		rule.onNodeWithText(BUGS_EMPTY).assertExists()
	}

	@Test
	fun the_phrase_register_groups_by_source_and_resolves_a_phrase() {
		var resolved: String? = null
		show {
			AdminNlpScreen(Load.Loaded(fixturesNlp()), NlpActions(onResolve = { resolved = it }, onCopy = {}, onDownload = {}))
		}

		rule.onNodeWithText("Event parse").assertExists()
		rule.onNodeWithText("(2)").assertExists()
		rule.onNodeWithText("Bulk edit").assertExists()
		rule.onNodeWithText("meeting third tuesday").assertExists()
		rule.onNodeWithText("title: meeting").assertExists()
		rule.onAllNodesWithTag("phrase-resolve")[0].performClick()

		assertEquals("p1", resolved)
	}

	@Test
	fun an_empty_phrase_register_says_the_parsers_are_holding_up() {
		show { AdminNlpScreen(Load.Loaded(fixturesNlp().copy(phrases = emptyList(), resolved = emptyList())), NlpActions()) }

		rule.onNodeWithText(NLP_EMPTY).assertExists()
	}

	@Test
	fun a_failed_register_shows_retry() {
		var retried = 0
		show { AdminBugsScreen(Load.Failed("You don't have access to this page."), BugActions(onRetry = { retried++ })) }

		rule.onNodeWithText("You don't have access to this page.").assertExists()
		rule.onNodeWithText("Try again").performClick()

		assertEquals(1, retried)
	}
}
