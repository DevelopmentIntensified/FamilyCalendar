package com.familyplanz.app.ui.account

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #310: a text setting in Calendar Settings is saved on purpose, not per keystroke —
 * the server refuses half-typed zones and colours, and the dead default-calendar
 * field is gone.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h2400dp")
class AccountCalendarSectionTest {
	@get:Rule
	val rule = createComposeRule()

	private val zones = mutableListOf<String>()
	private val colours = mutableListOf<String>()

	private fun show() {
		val state = AccountState(loading = false)
		rule.setContent {
			FamilyPlanzTheme {
				Column {
					CalendarSettingsSection(
						state,
						AccountActions(onTimeZone = { zones += it }, onColour = { colours += it }),
					)
				}
			}
		}
	}

	@Test
	fun typing_a_time_zone_sends_nothing_until_save_is_tapped() {
		show()

		rule.onNodeWithText("Time Zone").performTextReplacement("America/Chi")
		assertTrue(zones.isEmpty())
		rule.onNodeWithContentDescription("Save Time Zone").assertExists()

		rule.onNodeWithText("Time Zone").performTextReplacement("America/Chicago")
		rule.onNodeWithContentDescription("Save Time Zone").performClick()

		assertEquals(listOf("America/Chicago"), zones)
	}

	@Test
	fun an_unchanged_field_offers_no_save() {
		show()

		rule.onNodeWithContentDescription("Save Time Zone").assertDoesNotExist()
		rule.onNodeWithContentDescription("Save Colour").assertDoesNotExist()
	}

	@Test
	fun a_colour_is_sent_once_on_save() {
		show()

		rule.onNodeWithText("Colour").performTextReplacement("#10b981")
		rule.onNodeWithContentDescription("Save Colour").performClick()

		assertEquals(listOf("#10b981"), colours)
	}

	@Test
	fun there_is_no_default_calendar_text_field() {
		show()

		assertTrue(rule.onAllNodesWithText("Default calendar").fetchSemanticsNodes().isEmpty())
	}
}
