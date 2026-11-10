package com.familyplanz.app.ui.account

import android.os.Looper
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.familyplanz.app.data.AccountSettingsSource
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.FamiliesOverviewDto
import com.familyplanz.app.data.UnavailableAccountSettingsSource
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/** #189: the Account screen's data export, and the email draft it must not lose. */
@RunWith(RobolectricTestRunner::class)
class AccountExportTest {
	@get:Rule
	val rule = createComposeRule()

	/** Every account call is refused, except the export this test scripts. */
	private class FakeSource(var export: ApiResult<String>) : AccountSettingsSource by UnavailableAccountSettingsSource {
		override suspend fun exportData() = export
	}

	private fun idle() = shadowOf(Looper.getMainLooper()).idle()

	private fun viewModel(source: FakeSource): AccountViewModel {
		val vm = AccountViewModel(source) { ApiResult.Ok(FamiliesOverviewDto()) }
		idle()
		return vm
	}

	@Test
	fun an_export_hands_the_json_to_the_writer_and_says_downloaded() {
		val vm = viewModel(FakeSource(ApiResult.Ok("{}")))
		var written: String? = null

		vm.exportData { json ->
			written = json
			true
		}
		idle()

		assertEquals("{}", written)
		assertEquals(AccountBanner(EXPORT_DONE), vm.state.value.banner)
		assertEquals(false, vm.state.value.exporting)
	}

	@Test
	fun a_failed_fetch_tells_the_writer_and_says_failed() {
		val vm = viewModel(FakeSource(ApiResult.Err(ApiError.Unsupported)))
		var written: String? = "not called"

		vm.exportData { json ->
			written = json
			false
		}
		idle()

		assertNull(written)
		assertEquals(AccountBanner(EXPORT_FAILED, success = false), vm.state.value.banner)
		assertEquals(false, vm.state.value.exporting)
	}

	@Test
	fun a_failed_write_says_failed() {
		val vm = viewModel(FakeSource(ApiResult.Ok("{}")))

		vm.exportData { false }
		idle()

		assertEquals(AccountBanner(EXPORT_FAILED, success = false), vm.state.value.banner)
		assertEquals(false, vm.state.value.exporting)
	}

	@Test
	fun the_export_button_is_busy_while_an_export_runs() {
		show(exporting = true)

		rule.onNodeWithTag("account-export").assertIsNotEnabled()
		rule.onNodeWithText(EXPORT_BUSY).assertExists()
	}

	@Test
	fun the_export_button_runs_the_export_when_idle() {
		var exports = 0
		show(exporting = false, actions = AccountActions(onExport = { exports++ }))

		rule.onNodeWithTag("account-export").assertIsEnabled()
		rule.onNodeWithText(EXPORT_ACTION).assertExists()
		rule.onNodeWithTag("account-export").performClick()

		assertEquals(1, exports)
	}

	@Test
	fun typing_in_the_email_field_keeps_the_draft() {
		val vm = viewModel(FakeSource(ApiResult.Ok("{}")))

		vm.setEmail("new@example.com")

		assertEquals("new@example.com", vm.state.value.emailDraft)
	}

	private fun show(exporting: Boolean, actions: AccountActions = AccountActions()) {
		rule.setContent {
			FamilyPlanzTheme {
				Column {
					DangerZoneSection(AccountState(loading = false, exporting = exporting), actions)
				}
			}
		}
	}
}
