package com.familyplanz.app.ui.gesture

import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.familyplanz.app.data.ApiFactory
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.AuthError
import com.familyplanz.app.data.AuthResult
import com.familyplanz.app.data.NetworkAuthSource
import com.familyplanz.app.ui.GUEST_NOTE_TEXT
import com.familyplanz.app.ui.SignInTags
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.TimeUnit

/** Issue #288: the sign-in screen driven end to end into the Tasks tab. */
@RunWith(RobolectricTestRunner::class)
class SignInUiTest {
	@get:Rule
	val rule = createComposeRule()

	private val server = MockWebServer().apply { start() }
	private val fakeAuth = FakeAuthSource()
	private val host = HostHarness(rule, auth = fakeAuth)

	@After
	fun tearDown() {
		server.shutdown()
	}

	private fun useServer() {
		host.auth = NetworkAuthSource(ApiFactory.createAuth(server.url("/").toString())) { "Robo Phone" }
	}

	private fun json(body: String, code: Int = 200) =
		server.enqueue(MockResponse().setResponseCode(code).setBody(body))

	@Test
	fun email_code_flow_against_the_server_lands_on_the_tasks_tab() {
		useServer()
		host.repo.tasks = ApiResult.Ok(listOf(task("t1", "Water the plants")))
		json("""{"sent":true}""")
		json("""{"token":"fp_from_code","user":{"id":"u-code","firstName":"Ada","lastName":null,"email":"ada@example.com"}}""")
		host.launch(token = null)

		host.waitForText("Email me a code")
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("ada@example.com")
		rule.onNodeWithText("Email me a code").performClick()
		host.waitForText("Enter the 8-digit code", substring = true)
		rule.onNodeWithText("Resend code in 30 s").assertIsNotEnabled()

		// Pasting a spaced code is reduced to digits and submits itself.
		rule.onNodeWithTag(SignInTags.CODE).performTextInput("1234 5678")
		host.waitForText("Water the plants")

		val email = server.takeRequest(1, TimeUnit.SECONDS)!!
		assertEquals("/api/mobile/auth/email", email.path)
		assertEquals("""{"email":"ada@example.com","intent":"login"}""", email.body.readUtf8())
		val verify = server.takeRequest(1, TimeUnit.SECONDS)!!
		assertEquals(
			"""{"email":"ada@example.com","code":"12345678","intent":"login","deviceName":"Robo Phone"}""",
			verify.body.readUtf8(),
		)
		assertEquals("fp_from_code", runBlocking { host.store.token() })
	}

	@Test
	fun create_account_collects_names_before_sending_the_code() {
		useServer()
		json("""{"sent":true}""")
		host.launch(token = null)

		host.waitForText("Create an account")
		rule.onNodeWithText("Create an account").performClick()
		host.waitForText("Create your account")
		rule.onNodeWithTag(SignInTags.FIRST_NAME).performTextInput("Ada")
		rule.onNodeWithTag(SignInTags.LAST_NAME).performTextInput("Lovelace")
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("new@example.com")
		rule.onNodeWithText("Email me a code").performClick()

		host.waitForText("Wrong email?")
		assertEquals(
			"""{"email":"new@example.com","intent":"signup","firstName":"Ada","lastName":"Lovelace"}""",
			server.takeRequest(1, TimeUnit.SECONDS)!!.body.readUtf8(),
		)
		rule.onNodeWithText("Create account").assertExists()
	}

	@Test
	fun advanced_token_entry_still_signs_in() {
		host.repo.tasks = ApiResult.Ok(listOf(task("t1", "Pasted token chore")))
		host.launch(token = null)

		host.waitForText("Advanced")
		rule.onNodeWithText("Advanced").performClick()
		rule.onNodeWithTag(SignInTags.TOKEN).performTextInput("fp_pasted")
		rule.onNodeWithText("Save and sync").performClick()

		host.waitForText("Pasted token chore")
		assertEquals("fp_pasted", runBlocking { host.store.token() })
	}

	@Test
	fun wrong_password_shows_the_server_text() {
		useServer()
		json("""{"error":"Email or password is incorrect"}""", code = 401)
		host.launch(token = null)

		host.waitForText("Use password instead")
		rule.onNodeWithText("Use password instead").performClick()
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("ada@example.com")
		rule.onNodeWithTag(SignInTags.PASSWORD).performTextInput("nope")
		rule.onNodeWithText("Sign in").performClick()

		host.waitForText("Email or password is incorrect")
	}

	@Test
	fun rate_limit_text_is_shown_inline() {
		fakeAuth.codeResult = AuthResult.Err(AuthError.RateLimited("Too many attempts — try again in a few minutes"))
		host.launch(token = null)

		host.waitForText("Email me a code")
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("ada@example.com")
		rule.onNodeWithText("Email me a code").performClick()

		host.waitForText("Too many attempts — try again in a few minutes")
	}

	@Test
	fun sending_shows_a_pending_label_until_the_server_answers() {
		val gate = CompletableDeferred<Unit>()
		fakeAuth.gate = gate
		host.launch(token = null)

		host.waitForText("Email me a code")
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("ada@example.com")
		rule.onNodeWithText("Email me a code").performClick()
		host.waitForText("Sending code…")
		rule.onNodeWithText("Continue without an account").assertIsNotEnabled()

		gate.complete(Unit)
		host.waitForText("Wrong email?")
	}

	@Test
	fun guest_lands_on_tasks_with_a_dismissible_guest_note() {
		host.launch(token = null)

		host.waitForText("Continue without an account")
		rule.onNodeWithText("Continue without an account").performClick()
		host.waitForText(GUEST_NOTE_TEXT)
		assertEquals(1, fakeAuth.guests)

		rule.onNodeWithText("Dismiss").performClick()
		host.waitForGone(GUEST_NOTE_TEXT)
	}

	@Test
	fun sign_out_revokes_the_token_and_returns_to_sign_in() {
		host.launch(token = "fp_live")

		host.waitForText("No tasks yet")
		rule.onNodeWithContentDescription("Sign out").performClick()

		host.waitForText("Email me a code")
		host.waitFor { fakeAuth.loggedOut == listOf("fp_live") }
	}

	@Test
	fun wrong_email_returns_to_the_email_step() {
		host.launch(token = null)

		host.waitForText("Email me a code")
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("typo@example.com")
		rule.onNodeWithText("Email me a code").performClick()
		host.waitForText("Wrong email?")
		rule.onNodeWithText("Wrong email?").performClick()

		host.waitForText("Email me a code")
	}
}
