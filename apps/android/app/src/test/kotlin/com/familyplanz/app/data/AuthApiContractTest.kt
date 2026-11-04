package com.familyplanz.app.data

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** Issue #288 wire contract (docs/issues/288-android-native-login.md, "Contract"). */
class AuthApiContractTest {
	private lateinit var server: MockWebServer
	private lateinit var auth: AuthSource

	private val sessionBody =
		"""{"token":"fp_new","user":{"id":"u1","firstName":"Ada","lastName":"L","email":"ada@example.com"}}"""

	@Before
	fun setUp() {
		server = MockWebServer()
		server.start()
		auth = NetworkAuthSource(ApiFactory.createAuth(server.url("/").toString())) { "Pixel 9" }
	}

	@After
	fun tearDown() {
		server.shutdown()
	}

	private fun ok(body: String) = server.enqueue(MockResponse().setResponseCode(200).setBody(body))

	private fun fail(code: Int, error: String) =
		server.enqueue(MockResponse().setResponseCode(code).setBody("""{"error":"$error"}"""))

	@Test
	fun `login email posts the trimmed address and intent as JSON, with no bearer or Origin`() = runBlocking {
		ok("""{"sent":true}""")
		assertEquals(AuthResult.Ok(Unit), auth.requestCode(" ada@example.com ", AuthIntent.LOGIN))

		val recorded = server.takeRequest()
		assertEquals("POST", recorded.method)
		assertEquals("/api/mobile/auth/email", recorded.path)
		assertNull(recorded.getHeader("Authorization"))
		assertNull(recorded.getHeader("Origin"))
		assertTrue(recorded.getHeader("Content-Type")!!.startsWith("application/json"))
		assertEquals("""{"email":"ada@example.com","intent":"login"}""", recorded.body.readUtf8())
	}

	@Test
	fun `signup email carries first and last name`() = runBlocking {
		ok("""{"sent":true}""")
		auth.requestCode("new@example.com", AuthIntent.SIGNUP, SignupNames(" Ada ", "Lovelace"))

		assertEquals(
			"""{"email":"new@example.com","intent":"signup","firstName":"Ada","lastName":"Lovelace"}""",
			server.takeRequest().body.readUtf8(),
		)
	}

	@Test
	fun `G12 signup posts names, email, password and device name and parses the unverified session`() = runBlocking {
		ok(
			"""
			{"token":"fp_s","user":{"id":"u9","firstName":"Ada","lastName":"L","email":"a@b.co","emailVerified":false},"emailVerification":"pending"}
			""".trimIndent(),
		)
		val result = auth.signUpWithPassword(SignupNames(" Ada ", "L "), " a@b.co ", "longenough")

		val recorded = server.takeRequest()
		assertEquals("/api/mobile/auth/signup", recorded.path)
		assertNull(recorded.getHeader("Authorization"))
		assertEquals(
			"""{"firstName":"Ada","lastName":"L","email":"a@b.co","password":"longenough","deviceName":"Pixel 9"}""",
			recorded.body.readUtf8(),
		)
		assertEquals(AuthResult.Ok(AuthSessionDto("fp_s", AuthUserDto("u9", "Ada", "L", "a@b.co", emailVerified = false))), result)
	}

	@Test
	fun `G12 signup refusal keeps the server text`() = runBlocking {
		fail(400, "Password must be at least 8 characters")
		assertEquals(
			AuthResult.Err(AuthError.Rejected("Password must be at least 8 characters")),
			auth.signUpWithPassword(SignupNames("A", "B"), "a@b.co", "short"),
		)
	}

	@Test
	fun `G12 forgot posts only the trimmed email`() = runBlocking {
		ok("""{"sent":true}""")
		assertEquals(AuthResult.Ok(Unit), auth.forgotPassword(" a@b.co "))
		val recorded = server.takeRequest()
		assertEquals("/api/mobile/auth/forgot", recorded.path)
		assertEquals("""{"email":"a@b.co"}""", recorded.body.readUtf8())
	}

	@Test
	fun `a stored bearer never rides on sign-in calls`() = runBlocking {
		// The auth client is separate from the bearer-carrying task client (stale Bearer = 401 at the server).
		ok(sessionBody)
		auth.continueAsGuest()
		assertNull(server.takeRequest().getHeader("Authorization"))
	}

	@Test
	fun `verify sends code, intent and the device name, and parses the session`() = runBlocking {
		ok(sessionBody)
		val result = auth.verifyCode("ada@example.com", "12345678", AuthIntent.LOGIN)

		val recorded = server.takeRequest()
		assertEquals("/api/mobile/auth/verify", recorded.path)
		assertEquals(
			"""{"email":"ada@example.com","code":"12345678","intent":"login","deviceName":"Pixel 9"}""",
			recorded.body.readUtf8(),
		)
		val expected = AuthSessionDto("fp_new", AuthUserDto("u1", "Ada", "L", "ada@example.com"))
		assertEquals(AuthResult.Ok(expected), result)
	}

	@Test
	fun `password sends email, password and device name`() = runBlocking {
		ok(sessionBody)
		val result = auth.signInWithPassword("ada@example.com", "hunter2")

		val recorded = server.takeRequest()
		assertEquals("/api/mobile/auth/password", recorded.path)
		assertEquals(
			"""{"email":"ada@example.com","password":"hunter2","deviceName":"Pixel 9"}""",
			recorded.body.readUtf8(),
		)
		assertTrue(result is AuthResult.Ok && result.value.token == "fp_new")
	}

	@Test
	fun `guest sends only the device name and tolerates a null email`() = runBlocking {
		ok("""{"token":"fp_guest","user":{"id":"g1","firstName":"Guest","lastName":null,"email":null}}""")
		val result = auth.continueAsGuest()

		val recorded = server.takeRequest()
		assertEquals("/api/mobile/auth/guest", recorded.path)
		assertEquals("""{"deviceName":"Pixel 9"}""", recorded.body.readUtf8())
		assertEquals(AuthResult.Ok(AuthSessionDto("fp_guest", AuthUserDto("g1", "Guest"))), result)
	}

	@Test
	fun `logout revokes the named bearer`() = runBlocking {
		ok("""{"success":true}""")
		assertEquals(AuthResult.Ok(Unit), auth.logout("fp_old"))

		val recorded = server.takeRequest()
		assertEquals("POST", recorded.method)
		assertEquals("/api/mobile/auth/logout", recorded.path)
		assertEquals("Bearer fp_old", recorded.getHeader("Authorization"))
	}

	@Test
	fun `400 and 401 surface the server text as Rejected`() = runBlocking {
		fail(400, "Enter a valid email")
		assertEquals(AuthResult.Err(AuthError.Rejected("Enter a valid email")), auth.requestCode("nope", AuthIntent.LOGIN))

		fail(400, "That code is wrong or expired")
		assertEquals(
			AuthResult.Err(AuthError.Rejected("That code is wrong or expired")),
			auth.verifyCode("a@b.co", "00000000", AuthIntent.LOGIN),
		)

		fail(401, "Email or password is incorrect")
		assertEquals(
			AuthResult.Err(AuthError.Rejected("Email or password is incorrect")),
			auth.signInWithPassword("a@b.co", "bad"),
		)
	}

	@Test
	fun `409 on signup verify surfaces the server text`() = runBlocking {
		fail(409, "An account with this email already exists — sign in instead")
		assertEquals(
			AuthResult.Err(AuthError.Rejected("An account with this email already exists — sign in instead")),
			auth.verifyCode("ada@example.com", "12345678", AuthIntent.SIGNUP),
		)
	}

	@Test
	fun `429 surfaces the server text as RateLimited`() = runBlocking {
		fail(429, "Too many attempts — try again in a few minutes")
		assertEquals(
			AuthResult.Err(AuthError.RateLimited("Too many attempts — try again in a few minutes")),
			auth.requestCode("a@b.co", AuthIntent.LOGIN),
		)
	}

	@Test
	fun `5xx keeps the body text and a non-contract 200 is a Server error`() = runBlocking {
		fail(500, "Couldn't send the email — try again")
		assertEquals(
			AuthResult.Err(AuthError.Server("Couldn't send the email — try again")),
			auth.requestCode("a@b.co", AuthIntent.LOGIN),
		)

		ok("<html>captive portal</html>")
		val result = auth.continueAsGuest()
		assertTrue(result is AuthResult.Err && result.error is AuthError.Server)
	}

	@Test
	fun `a dropped connection is a Network error`() = runBlocking {
		server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
		val result = auth.continueAsGuest()
		assertTrue(result is AuthResult.Err && result.error is AuthError.Network)
	}
}
