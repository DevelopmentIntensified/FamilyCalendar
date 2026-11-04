package com.familyplanz.app.ui.auth

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performFirstLinkClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.ApiFactory
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.AuthError
import com.familyplanz.app.data.AuthResult
import com.familyplanz.app.data.NetworkAuthSource
import com.familyplanz.app.data.SignupNames
import com.familyplanz.app.ui.gesture.FakeAuthSource
import com.familyplanz.app.ui.gesture.HostHarness
import com.familyplanz.app.ui.gesture.task
import com.familyplanz.app.ui.nav.AppRoute
import java.util.concurrent.TimeUnit
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

/** #288 native sign-in, cloned to the web's /login, /signup and /forgot-password (#292 §2.13, AC-AU-1…7). */
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

	private fun entryShown(route: AppRoute) {
		host.waitFor { rule.onAllNodesWithTag("entry-${route.name.lowercase()}").fetchSemanticsNodes().isNotEmpty() }
	}

	@Test
	fun signed_out_shows_welcome_back_with_the_verbatim_subline_and_password_first() {
		host.launch(token = null)

		host.waitForText("Welcome Back")
		rule.onNodeWithText("Family Planz").assertExists()
		rule.onNodeWithText("Don't have an account? Sign up or start planning with no account needed.").assertExists()
		rule.onNode(hasText("Password") and isSelectable()).assertIsSelected()
		rule.onNodeWithText("Email Link").assertExists()
		rule.onNodeWithText("Forgot your password?").assertExists()
		rule.onNodeWithText("Login").assertExists()
		rule.onNodeWithText(GUEST_LABEL).assertExists()
		rule.onNodeWithText("Creates a private calendar on this device. Add an email later to sync.").assertExists()
	}

	@Test
	fun wrong_password_shows_the_server_text_in_the_red_alert() {
		useServer()
		json("""{"error":"Email or password is incorrect"}""", code = 401)
		host.launch(token = null)

		host.waitForText("Welcome Back")
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("ada@example.com")
		rule.onNodeWithTag(SignInTags.PASSWORD).performTextInput("nope")
		rule.onNodeWithText("Login").performClick()

		host.waitForText("Email or password is incorrect")
		val sent = server.takeRequest(1, TimeUnit.SECONDS)!!
		assertEquals("/api/mobile/auth/password", sent.path)
	}

	@Test
	fun email_link_sends_a_code_and_the_code_step_signs_in() {
		useServer()
		host.repo.tasks = ApiResult.Ok(listOf(task("t1", "Water the plants")))
		json("""{"sent":true}""")
		json("""{"sent":true}""")
		json("""{"token":"fp_from_code","user":{"id":"u-code","firstName":"Ada","lastName":null,"email":"ada@example.com"}}""")
		host.launch(token = null)

		host.waitForText("Email Link")
		rule.onNodeWithText("Email Link").performClick()
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("ada@example.com")
		rule.onNodeWithText("Send Login Link").performClick()

		host.waitForText("Check Your Email")
		rule.onNodeWithText("We've sent a login code to ada@example.com").assertExists()
		rule.onNodeWithText("Login code").assertExists()
		rule.onNodeWithText("Didn't receive the code? Resend").performClick()
		host.waitForText("Sent again ✓")

		// Pasting a spaced code is reduced to digits and submits itself.
		rule.onNodeWithTag(SignInTags.CODE).performTextInput("1234 5678")
		host.waitForText("Water the plants")

		val email = server.takeRequest(1, TimeUnit.SECONDS)!!
		assertEquals("/api/mobile/auth/email", email.path)
		assertEquals("""{"email":"ada@example.com","intent":"login"}""", email.body.readUtf8())
		server.takeRequest(1, TimeUnit.SECONDS)!!
		val verify = server.takeRequest(1, TimeUnit.SECONDS)!!
		assertEquals(
			"""{"email":"ada@example.com","code":"12345678","intent":"login","deviceName":"Robo Phone"}""",
			verify.body.readUtf8(),
		)
		assertEquals("fp_from_code", runBlocking { host.store.token() })
	}

	@Test
	fun sign_up_switches_to_create_account_and_email_link_verifies_with_verify_code() {
		useServer()
		json("""{"sent":true}""")
		host.launch(token = null)

		host.waitForText("Welcome Back")
		rule.onNodeWithText("Don't have an account? Sign up or start planning with no account needed.").performFirstLinkClick()
		host.waitForText("Create Account")
		rule.onNodeWithText("Already have an account? Sign in").assertExists()
		rule.onNodeWithText("Confirm Password").assertExists()
		rule.onNodeWithText("At least 8 characters").assertExists()

		rule.onNodeWithText("Email Link").performClick()
		rule.onNodeWithTag(SignInTags.FIRST_NAME).performTextInput("Ada")
		rule.onNodeWithTag(SignInTags.LAST_NAME).performTextInput("Lovelace")
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("new@example.com")
		rule.onNodeWithText("Send Verification Link").performClick()

		host.waitForText("We've sent a verification code to new@example.com")
		assertEquals(
			"""{"email":"new@example.com","intent":"signup","firstName":"Ada","lastName":"Lovelace"}""",
			server.takeRequest(1, TimeUnit.SECONDS)!!.body.readUtf8(),
		)
		rule.onNodeWithText("Verify Code").assertExists()
	}

	@Test
	fun password_signup_creates_the_account_and_lands_on_calendar() {
		useServer()
		json(
			"""
			{"token":"fp_new","user":{"id":"u-new","firstName":"Ada","lastName":"Lovelace","email":"new@example.com","emailVerified":false},"emailVerification":"pending"}
			""".trimIndent(),
		)
		host.launch(tab = null, token = null)

		host.waitForText("Welcome Back")
		rule.onNodeWithText("Don't have an account? Sign up or start planning with no account needed.").performFirstLinkClick()
		host.waitForText("Create Account")
		rule.onNodeWithTag(SignInTags.FIRST_NAME).performTextInput("Ada")
		rule.onNodeWithTag(SignInTags.LAST_NAME).performTextInput("Lovelace")
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("new@example.com")
		rule.onNodeWithTag(SignInTags.PASSWORD).performTextInput("longenough")
		rule.onNodeWithTag(SignInTags.CONFIRM_PASSWORD).performTextInput("longenough")
		rule.onNodeWithTag(SignInTags.SUBMIT).performClick()

		entryShown(AppRoute.CALENDAR)
		val sent = server.takeRequest(1, TimeUnit.SECONDS)!!
		assertEquals("/api/mobile/auth/signup", sent.path)
		assertEquals(
			"""{"firstName":"Ada","lastName":"Lovelace","email":"new@example.com","password":"longenough","deviceName":"Robo Phone"}""",
			sent.body.readUtf8(),
		)
		assertEquals("fp_new", runBlocking { host.store.token() })
	}

	@Test
	fun mismatched_passwords_are_refused_before_any_request() {
		host.launch(token = null)

		host.waitForText("Welcome Back")
		rule.onNodeWithText("Don't have an account? Sign up or start planning with no account needed.").performFirstLinkClick()
		host.waitForText("Create Account")
		rule.onNodeWithTag(SignInTags.FIRST_NAME).performTextInput("Ada")
		rule.onNodeWithTag(SignInTags.LAST_NAME).performTextInput("Lovelace")
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("new@example.com")
		rule.onNodeWithTag(SignInTags.PASSWORD).performTextInput("longenough")
		rule.onNodeWithTag(SignInTags.CONFIRM_PASSWORD).performTextInput("different")
		rule.onNodeWithTag(SignInTags.SUBMIT).performClick()

		host.waitForText("Passwords do not match")
		assertEquals(emptyList<Triple<SignupNames, String, String>>(), fakeAuth.signups)
	}

	@Test
	fun start_planning_creates_a_guest_and_lands_on_calendar() {
		host.launch(tab = null, token = null)

		host.waitForText(GUEST_LABEL)
		rule.onNodeWithText(GUEST_LABEL).performClick()
		entryShown(AppRoute.CALENDAR)
		assertEquals(1, fakeAuth.guests)
	}

	@Test
	fun submit_is_a_48dp_pill_that_disables_while_sending() {
		val gate = CompletableDeferred<Unit>()
		fakeAuth.gate = gate
		host.launch(token = null)

		host.waitForText("Welcome Back")
		rule.onNodeWithTag(SignInTags.SUBMIT).assertHeightIsAtLeast(48.dp).assertIsEnabled()
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("ada@example.com")
		rule.onNodeWithTag(SignInTags.PASSWORD).performTextInput("hunter22")
		rule.onNodeWithTag(SignInTags.SUBMIT).performClick()
		host.waitForText("Logging in...")
		rule.onNodeWithTag(SignInTags.SUBMIT).assertIsNotEnabled()
		rule.onNodeWithText(GUEST_LABEL).assertIsNotEnabled()

		gate.complete(Unit)
	}

	@Test
	fun forgot_password_sends_the_reset_link_and_names_the_address() {
		host.launch(token = null)

		host.waitForText("Forgot your password?")
		rule.onNodeWithText("Forgot your password?").performClick()
		host.waitForText("Reset Password")
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("ada@example.com")
		rule.onNodeWithText("Send Reset Link").performClick()

		host.waitForText("If an account exists for ada@example.com, we've sent a password reset link.")
		assertEquals(listOf("ada@example.com"), fakeAuth.forgot)
		rule.onNodeWithText("Remember your password? Log in").performFirstLinkClick()
		host.waitForText("Welcome Back")
	}

	@Test
	fun rate_limit_text_is_shown_inline() {
		fakeAuth.codeResult = AuthResult.Err(AuthError.RateLimited("Too many attempts — try again in a few minutes"))
		host.launch(token = null)

		host.waitForText("Email Link")
		rule.onNodeWithText("Email Link").performClick()
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("ada@example.com")
		rule.onNodeWithText("Send Login Link").performClick()

		host.waitForText("Too many attempts — try again in a few minutes")
	}

	@Test
	fun advanced_token_entry_still_signs_in() {
		host.repo.tasks = ApiResult.Ok(listOf(task("t1", "Pasted token chore")))
		host.launch(token = null)

		host.waitForText("Advanced")
		rule.onNodeWithText("Advanced").performScrollTo().performClick()
		rule.onNodeWithTag(SignInTags.TOKEN).performScrollTo().performTextInput("fp_pasted")
		rule.onNodeWithText("Save and sync").performScrollTo().performClick()

		host.waitForText("Pasted token chore")
		assertEquals("fp_pasted", runBlocking { host.store.token() })
	}

	@Test
	fun sign_out_revokes_the_token_and_returns_to_sign_in() {
		host.launch(token = "fp_live")

		host.waitForText("No tasks yet")
		rule.onNodeWithContentDescription("Sign out").performClick()

		host.waitForText("Welcome Back")
		host.waitFor { fakeAuth.loggedOut == listOf("fp_live") }
	}

	@Test
	fun a_different_email_returns_from_the_code_step() {
		host.launch(token = null)

		host.waitForText("Email Link")
		rule.onNodeWithText("Email Link").performClick()
		rule.onNodeWithTag(SignInTags.EMAIL).performTextInput("typo@example.com")
		rule.onNodeWithText("Send Login Link").performClick()
		host.waitForText("Use a different email")
		rule.onNodeWithText("Use a different email").performClick()

		host.waitForText("Send Login Link")
	}
}
