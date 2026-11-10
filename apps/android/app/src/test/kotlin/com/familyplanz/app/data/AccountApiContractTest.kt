package com.familyplanz.app.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * §2.12/§2.13 wire contract (docs/guides/task-api-spec.md, "Account (G14)",
 * "G1 GET /api/me", "G12 verify"): every path, body and message the Account
 * screen and the verify banner consume.
 */
class AccountApiContractTest {
	private lateinit var server: MockWebServer
	private lateinit var account: AccountSettingsSource

	@Before
	fun setUp() {
		server = MockWebServer()
		server.start()
		account = NetworkAccountSettingsSource(AccountApis.create(server.url("/").toString()) { "fp_test" })
	}

	@After
	fun tearDown() {
		server.shutdown()
	}

	private fun ok(body: String) = server.enqueue(MockResponse().setResponseCode(200).setBody(body))

	private fun created(body: String) = server.enqueue(MockResponse().setResponseCode(201).setBody(body))

	private fun fail(code: Int, error: String) =
		server.enqueue(MockResponse().setResponseCode(code).setBody("""{"error":"$error"}"""))

	@Test
	fun `identity carries the banner and admin flags`() = runBlocking {
		ok(
			"""{"id":"u1","firstName":"Ada","lastName":"L","email":"ada@example.com","emailVerified":false,
			"isAnonymous":false,"roles":["admin"],"lastActiveAt":"2026-03-01T00:00:00.000Z","familyId":"f1"}""",
		)
		val me = (account.me() as ApiResult.Ok).value

		val recorded = server.takeRequest()
		assertEquals("/api/me", recorded.path)
		assertEquals("Bearer fp_test", recorded.getHeader("Authorization"))
		assertEquals(false, me.emailVerified)
		assertTrue(me.roles.contains("admin"))
		assertEquals("f1", me.familyId)
	}

	@Test
	fun `a guest identity has no email and is flagged anonymous`() = runBlocking {
		ok("""{"id":"u9","firstName":null,"lastName":null,"email":null,"emailVerified":false,"isAnonymous":true}""")
		val me = (account.me() as ApiResult.Ok).value
		assertTrue(me.isAnonymous)
		assertEquals(null, me.email)
	}

	@Test
	fun `settings read the calendar card, translations and the consent trail`() = runBlocking {
		ok(
			"""{"settings":{"weekStart":"monday","timeZone":"Europe/Berlin","color":"#dd5822","defaultView":"dashboard",
			"defaultCalendarId":null,"syncEventsToFamilyCalendar":true,"showDailyVerse":true,"showAdsAsEvents":false,
			"verseTranslation":"kjv","hiddenDashboardModules":["meals"]},
			"verseTranslations":[{"id":"kjv","label":"King James","attribution":null}],
			"consentHistory":[{"decision":"granted","recordedAt":"2026-03-02T10:00:00.000Z"}]}""",
		)
		val card = (account.settings() as ApiResult.Ok).value

		assertEquals("/api/me/settings", server.takeRequest().path)
		assertEquals("monday", card.settings.weekStart)
		assertEquals("dashboard", card.settings.defaultView)
		assertEquals(listOf("meals"), card.settings.hiddenDashboardModules)
		assertEquals("King James", card.verseTranslations.single().label)
		assertEquals("granted", card.consentHistory.single().decision)
	}

	@Test
	fun `a settings patch sends only the changed fields and echoes the new card`() = runBlocking {
		ok("""{"settings":{"weekStart":"monday","defaultView":"dashboard"}}""")
		val patch = buildJsonObject {
			put("weekStart", "monday")
			put("defaultView", "dashboard")
		}
		val card = (account.patchSettings(patch) as ApiResult.Ok).value

		val recorded = server.takeRequest()
		assertEquals("PATCH", recorded.method)
		assertEquals("/api/me/settings", recorded.path)
		assertEquals("""{"weekStart":"monday","defaultView":"dashboard"}""", recorded.body.readUtf8())
		assertEquals("monday", card.settings.weekStart)
	}

	@Test
	fun `profile saves trimmed names and reads the updated user`() = runBlocking {
		ok("""{"success":true,"user":{"id":"u1","firstName":"Ada","lastName":"Lovelace","email":"ada@example.com"}}""")
		val user = (account.updateProfile(" Ada ", "Lovelace ") as ApiResult.Ok).value

		val recorded = server.takeRequest()
		assertEquals("PATCH", recorded.method)
		assertEquals("/api/me/profile", recorded.path)
		assertEquals("""{"firstName":"Ada","lastName":"Lovelace"}""", recorded.body.readUtf8())
		assertEquals("Lovelace", user?.lastName)
	}

	@Test
	fun `email change returns the server verification message`() = runBlocking {
		ok("""{"success":true,"message":"Verification email sent. Please check your inbox."}""")
		val message = (account.updateEmail("new@example.com") as ApiResult.Ok).value
		assertEquals("/api/me/email", server.takeRequest().path)
		assertEquals("Verification email sent. Please check your inbox.", message)
	}

	@Test
	fun `log out all devices reports how many sessions it revoked`() = runBlocking {
		ok("""{"success":true,"revoked":3}""")
		assertEquals(ApiResult.Ok(3), account.revokeOtherSessions())
		assertEquals("/api/me/sessions/revoke-others", server.takeRequest().path)
	}

	@Test
	fun `tokens list, mint shows the plaintext once, and revoke deletes by id`() = runBlocking {
		ok("""{"tokens":[{"id":"t1","name":"Android - Pixel 9","createdAt":"2026-01-01T00:00:00.000Z"}]}""")
		assertEquals("Android - Pixel 9", (account.apiTokens() as ApiResult.Ok).value.single().name)
		assertEquals("/api/me/api-tokens", server.takeRequest().path)

		created("""{"token":"fp_once","record":{"id":"t2","name":"Laptop","createdAt":"2026-01-02T00:00:00.000Z"}}""")
		val minted = (account.createApiToken(" Laptop ") as ApiResult.Ok).value
		val mintRequest = server.takeRequest()
		assertEquals("POST", mintRequest.method)
		assertEquals("/api/me/api-tokens", mintRequest.path)
		assertEquals("""{"name":"Laptop"}""", mintRequest.body.readUtf8())
		assertEquals("fp_once", minted.token)

		ok("""{"success":true}""")
		account.revokeApiToken("t2")
		val revoke = server.takeRequest()
		assertEquals("DELETE", revoke.method)
		assertEquals("/api/me/api-tokens/t2", revoke.path)
	}

	@Test
	fun `deleting the account sends the typed id and a mismatch keeps the message`() = runBlocking {
		fail(400, "Confirmation does not match")
		assertEquals(
			ApiResult.Err(ApiError.BadRequest("Confirmation does not match")),
			account.deleteAccount("wrong"),
		)
		val refused = server.takeRequest()
		assertEquals("DELETE", refused.method)
		assertEquals("/api/me", refused.path)
		assertEquals("""{"confirmation":"wrong"}""", refused.body.readUtf8())

		ok("""{"success":true}""")
		assertEquals(ApiResult.Ok(Unit), account.deleteAccount(" u1 "))
		assertEquals("""{"confirmation":"u1"}""", server.takeRequest().body.readUtf8())
	}

	@Test
	fun `dashboard modules echo the canonical hidden list`() = runBlocking {
		ok("""{"success":true,"message":"Saved.","hidden":["kidsSchedule"]}""")
		val hidden = (account.saveDashboardModules(listOf("kidsSchedule", "bogus")) as ApiResult.Ok).value

		val recorded = server.takeRequest()
		assertEquals("PUT", recorded.method)
		assertEquals("/api/me/dashboard-modules", recorded.path)
		assertEquals("""{"hidden":["kidsSchedule","bogus"]}""", recorded.body.readUtf8())
		assertEquals(listOf("kidsSchedule"), hidden)
	}

	@Test
	fun `notification preferences read the four toggles and save one`() = runBlocking {
		ok(
			"""{"preferences":{"taskAssigned":true,"taskCompleted":false,"familyJoined":true,"aiSuggestions":true},
			"options":[{"id":"taskCompleted","label":"Task completed","hint":null,"default":true}]}""",
		)
		val prefs = (account.notificationPreferences() as ApiResult.Ok).value
		assertEquals(false, prefs.preferences["taskCompleted"])
		assertEquals("Task completed", prefs.options.single().label)
		assertEquals("/api/me/notification-preferences", server.takeRequest().path)

		ok("""{"success":true,"message":"Task completed Saved."}""")
		val message = (account.setNotificationPreference("taskCompleted", true) as ApiResult.Ok).value
		val recorded = server.takeRequest()
		assertEquals("/api/me/notification-preferences/taskCompleted", recorded.path)
		assertEquals("""{"value":true}""", recorded.body.readUtf8())
		assertEquals("Task completed Saved.", message)
	}

	@Test
	fun `subscription reads the tier and the ai usage`() = runBlocking {
		ok(
			"""{"subscription":{"tier":{"id":"free","name":"Free","displayName":"Free plan"},"subscription":null},
			"planLimits":{"familyLimit":2,"memberLimit":6,"aiEventCreationsPerMonth":10},
			"aiUsage":{"used":3,"limit":10,"remaining":7},"planPricing":{}}""",
		)
		val plan = (account.subscription() as ApiResult.Ok).value
		assertEquals("Free plan", plan.subscription.tier?.displayName)
		assertEquals(7, plan.aiUsage.remaining)
		assertEquals(2, plan.planLimits.familyLimit)
	}

	@Test
	fun `verify email posts the code and keeps the servers refusal text`() = runBlocking {
		fail(400, "Unexpected error, please try again")
		assertEquals(
			ApiResult.Err(ApiError.BadRequest("Unexpected error, please try again")),
			account.verifyEmail(" 12345678 "),
		)
		assertEquals("""{"code":"12345678"}""", server.takeRequest().body.readUtf8())

		ok("""{"success":true}""")
		assertEquals(ApiResult.Ok(Unit), account.resendVerification())
		assertEquals("/api/me/verify-email/resend", server.takeRequest().path)
	}

	@Test
	fun `claiming a guest sends the address and answers sent`() = runBlocking {
		ok("""{"sent":true}""")
		assertEquals(ApiResult.Ok(Unit), account.claim("save@example.com"))
		assertEquals("""{"email":"save@example.com"}""", server.takeRequest().body.readUtf8())
	}

	@Test
	fun `the data export is fetched from the account export endpoint as text`() = runBlocking {
		server.enqueue(
			MockResponse()
				.setResponseCode(200)
				.setHeader("Content-Type", "application/json; charset=utf-8")
				.setBody("""{"user":{"id":"u1"},"events":[]}"""),
		)
		val result = account.exportData()

		val recorded = server.takeRequest()
		assertEquals("GET", recorded.method)
		assertEquals("/api/account/export", recorded.path)
		assertEquals("Bearer fp_test", recorded.getHeader("Authorization"))
		assertEquals("""{"user":{"id":"u1"},"events":[]}""", (result as ApiResult.Ok).value)
	}
}
