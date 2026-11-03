package com.familyplanz.app.ui.auth

import android.os.Looper
import com.familyplanz.app.data.AuthError
import com.familyplanz.app.data.AuthIntent
import com.familyplanz.app.data.AuthResult
import com.familyplanz.app.data.AuthSessionDto
import com.familyplanz.app.data.AuthUserDto
import com.familyplanz.app.data.SignupNames
import com.familyplanz.app.ui.gesture.FakeAuthSource
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.channels.Channel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/** Issue #288 sign-in state machine over a fake [com.familyplanz.app.data.AuthSource]. */
@RunWith(RobolectricTestRunner::class)
class SignInViewModelTest {
	private val auth = FakeAuthSource()
	private val ticks = Channel<Unit>(Channel.UNLIMITED)
	private val pauses = mutableListOf<Long>()
	private val vm = SignInViewModel(auth) {
		pauses += it
		ticks.receive()
	}

	private fun idle() = shadowOf(Looper.getMainLooper()).idle()

	private fun awaitUntil(condition: () -> Boolean) {
		val deadline = System.currentTimeMillis() + 5_000
		while (!condition() && System.currentTimeMillis() < deadline) {
			idle()
			Thread.sleep(5)
		}
		assertEquals(true, condition())
	}

	@Test
	fun `the card opens on the Password segment of Welcome Back`() {
		assertEquals(SignInStep.PASSWORD, vm.ui.value.step)
		assertEquals(AuthIntent.LOGIN, vm.ui.value.intent)
	}

	@Test
	fun `email then code signs in with the response token and user id`() {
		vm.showStep(SignInStep.EMAIL)
		vm.requestCode(" ada@example.com ")
		idle()
		assertEquals(SignInStep.CODE, vm.ui.value.step)
		assertEquals(listOf("ada@example.com" to AuthIntent.LOGIN), auth.codeRequests)

		vm.verifyCode("1234 5678")
		idle()
		assertEquals(listOf(Triple("ada@example.com", "12345678", AuthIntent.LOGIN)), auth.verifications)
		assertEquals(SessionCredentials("fp_signed_in", "u-1", guest = false), vm.signedIn.value)

		vm.consumeSignedIn()
		assertNull(vm.signedIn.value)
		assertEquals(SignInUiState(email = "ada@example.com"), vm.ui.value)
	}

	@Test
	fun `signup intent rides on both the email and the verify call`() {
		vm.setIntent(AuthIntent.SIGNUP)
		vm.requestCode("new@example.com", SignupNames("Ada", "Lovelace"))
		idle()
		vm.verifyCode("87654321")
		idle()
		assertEquals(AuthIntent.SIGNUP, auth.codeRequests.single().second)
		assertEquals(SignupNames("Ada", "Lovelace"), auth.codeNames.single())
		assertEquals(AuthIntent.SIGNUP, auth.verifications.single().third)
	}

	@Test
	fun `signup without both names is refused locally, login drops names`() {
		vm.setIntent(AuthIntent.SIGNUP)
		vm.requestCode("new@example.com", SignupNames("Ada", " "))
		assertEquals("First and last name are required", vm.ui.value.error)
		assertEquals(0, auth.codeRequests.size)

		vm.setIntent(AuthIntent.LOGIN)
		vm.requestCode("ada@example.com", SignupNames("Ada", "L"))
		idle()
		assertEquals(listOf<SignupNames?>(null), auth.codeNames)
	}

	@Test
	fun `a call in flight shows its pending state and ignores repeat taps`() {
		val gate = CompletableDeferred<Unit>()
		auth.gate = gate
		vm.requestCode("ada@example.com")
		idle()
		assertEquals(SignInPending.SEND_CODE, vm.ui.value.pending)
		vm.requestCode("ada@example.com")
		vm.continueAsGuest()
		idle()
		assertEquals(1, auth.codeRequests.size)
		assertEquals(0, auth.guests)

		gate.complete(Unit)
		awaitUntil { vm.ui.value.pending == null }
		assertEquals(SignInStep.CODE, vm.ui.value.step)
	}

	@Test
	fun `server error text shows inline and the step stays put`() {
		auth.codeResult = AuthResult.Err(AuthError.Rejected("Enter a valid email"))
		vm.showStep(SignInStep.EMAIL)
		vm.requestCode("nope")
		idle()
		assertEquals(SignInStep.EMAIL, vm.ui.value.step)
		assertEquals("Enter a valid email", vm.ui.value.error)
		assertNull(vm.ui.value.pending)
	}

	@Test
	fun `wrong code and 429 keep the code step with the server text`() {
		vm.requestCode("ada@example.com")
		idle()
		auth.session = AuthResult.Err(AuthError.Rejected("That code is wrong or expired"))
		vm.verifyCode("00000000")
		idle()
		assertEquals("That code is wrong or expired", vm.ui.value.error)
		assertEquals(SignInStep.CODE, vm.ui.value.step)

		auth.session = AuthResult.Err(AuthError.RateLimited("Too many attempts — try again in a few minutes"))
		vm.verifyCode("11111111")
		idle()
		assertEquals("Too many attempts — try again in a few minutes", vm.ui.value.error)
		assertNull(vm.signedIn.value)
	}

	@Test
	fun `a short code is refused locally without a call`() {
		vm.requestCode("ada@example.com")
		idle()
		vm.verifyCode("123456")
		assertEquals("Enter the 8-digit code from the email", vm.ui.value.error)
		assertEquals(0, auth.verifications.size)
	}

	@Test
	fun `resend sends again and flashes Sent again for three seconds`() {
		vm.requestCode("ada@example.com")
		idle()
		assertEquals(false, vm.ui.value.sentAgain)
		vm.resendCode()
		idle()
		assertEquals(2, auth.codeRequests.size)
		assertEquals(true, vm.ui.value.sentAgain)
		assertEquals(listOf(SignInViewModel.SENT_AGAIN_MS), pauses)

		ticks.trySend(Unit)
		awaitUntil { !vm.ui.value.sentAgain }
	}

	@Test
	fun `going back from the code step clears Sent again`() {
		vm.requestCode("typo@example.com")
		idle()
		vm.resendCode()
		idle()
		vm.showStep(SignInStep.EMAIL)
		assertEquals(SignInStep.EMAIL, vm.ui.value.step)
		assertEquals(false, vm.ui.value.sentAgain)
	}

	@Test
	fun `password signup checks the confirmation and length, then creates the account`() {
		vm.setIntent(AuthIntent.SIGNUP)
		val names = SignupNames("Ada", "Lovelace")
		vm.signInWithPassword("ada@example.com", "longenough", PasswordSignup(names, "different"))
		assertEquals("Passwords do not match", vm.ui.value.error)
		vm.signInWithPassword("ada@example.com", "short", PasswordSignup(names, "short"))
		assertEquals("Password must be at least 8 characters", vm.ui.value.error)
		vm.signInWithPassword("ada@example.com", "longenough", PasswordSignup(SignupNames("", "L"), "longenough"))
		assertEquals("All fields are required", vm.ui.value.error)
		assertEquals(0, auth.signups.size)

		vm.signInWithPassword(" ada@example.com", "longenough", PasswordSignup(names, "longenough"))
		idle()
		assertEquals(listOf(Triple(names, "ada@example.com", "longenough")), auth.signups)
		assertEquals(0, auth.passwords.size)
		assertEquals("fp_signed_in", vm.signedIn.value?.token)
	}

	@Test
	fun `signup server refusal shows inline`() {
		vm.setIntent(AuthIntent.SIGNUP)
		auth.session = AuthResult.Err(AuthError.Rejected("An account with this email already exists"))
		vm.signInWithPassword("ada@example.com", "longenough", PasswordSignup(SignupNames("Ada", "L"), "longenough"))
		idle()
		assertEquals("An account with this email already exists", vm.ui.value.error)
		assertNull(vm.signedIn.value)
	}

	@Test
	fun `forgot password sends the reset email and shows Check Your Email`() {
		vm.showStep(SignInStep.FORGOT)
		vm.requestCode("")
		assertEquals("Email is required", vm.ui.value.error)
		vm.requestCode(" ada@example.com ")
		idle()
		assertEquals(listOf("ada@example.com"), auth.forgot)
		assertEquals(0, auth.codeRequests.size)
		assertEquals(true, vm.ui.value.resetSent)

		vm.showStep(SignInStep.PASSWORD)
		assertEquals(false, vm.ui.value.resetSent)
	}

	@Test
	fun `forgot password rate limit text shows inline`() {
		auth.forgotResult = AuthResult.Err(AuthError.RateLimited("Too many attempts. Try again shortly."))
		vm.showStep(SignInStep.FORGOT)
		vm.requestCode("ada@example.com")
		idle()
		assertEquals("Too many attempts. Try again shortly.", vm.ui.value.error)
		assertEquals(false, vm.ui.value.resetSent)
	}

	@Test
	fun `switching to signup keeps the toggle segment`() {
		vm.showStep(SignInStep.EMAIL)
		vm.setIntent(AuthIntent.SIGNUP)
		assertEquals(SignInStep.EMAIL, vm.ui.value.step)
		vm.showStep(SignInStep.FORGOT)
		vm.setIntent(AuthIntent.LOGIN)
		assertEquals(SignInStep.PASSWORD, vm.ui.value.step)
	}

	@Test
	fun `password sign-in passes credentials and opens a session`() {
		vm.signInWithPassword("ada@example.com ", "hunter2")
		idle()
		assertEquals(listOf("ada@example.com" to "hunter2"), auth.passwords)
		assertEquals("fp_signed_in", vm.signedIn.value?.token)

		vm.consumeSignedIn()
		auth.session = AuthResult.Err(AuthError.Rejected("Email or password is incorrect"))
		vm.signInWithPassword("ada@example.com", "bad")
		idle()
		assertEquals("Email or password is incorrect", vm.ui.value.error)
	}

	@Test
	fun `guest opens a session flagged as guest`() {
		auth.session = AuthResult.Ok(AuthSessionDto("fp_guest", AuthUserDto(id = "g1")))
		vm.continueAsGuest()
		assertEquals(SignInPending.GUEST, vm.ui.value.pending)
		idle()
		assertEquals(SessionCredentials("fp_guest", "g1", guest = true), vm.signedIn.value)
	}

	@Test
	fun `blank email is refused locally`() {
		vm.requestCode("  ")
		assertEquals("Enter your email", vm.ui.value.error)
		assertEquals(0, auth.codeRequests.size)
	}
}
