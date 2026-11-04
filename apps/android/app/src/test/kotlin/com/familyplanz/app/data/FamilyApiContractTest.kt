package com.familyplanz.app.data

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * §2.7-2.11 wire contract (docs/guides/task-api-spec.md "Families (G10a-c,
 * G11)"): every path, body and response shape the Family screens consume.
 */
class FamilyApiContractTest {
	private lateinit var server: MockWebServer
	private lateinit var families: FamilySource

	@Before
	fun setUp() {
		server = MockWebServer()
		server.start()
		families = NetworkFamilySource(FamilyApis.create(server.url("/").toString()) { "fp_test" })
	}

	@After
	fun tearDown() {
		server.shutdown()
	}

	private fun ok(body: String) = server.enqueue(MockResponse().setResponseCode(200).setBody(body))

	private fun created(body: String) = server.enqueue(MockResponse().setResponseCode(201).setBody(body))

	private fun fail(code: Int, error: String) =
		server.enqueue(MockResponse().setResponseCode(code).setBody("""{"error":"$error"}"""))

	private val overviewBody = """
		{"families":[{"id":"f1","name":"The Smiths","color":"#dd5822","createdAt":"2026-01-02T00:00:00.000Z",
		"memberCount":3,"openTasks":4,"createdLabel":"1/2/2026","canInvite":true,"role":"creator",
		"members":[{"firstName":"Ada","userId":"u1"},{"firstName":"Bo","userId":"u2"}]}],
		"roster":[{"familyId":"f1","userId":"u1","firstName":"Ada","lastName":"L","role":"creator","memberType":"parent"}],
		"activeInvites":[{"familyId":"f1","code":"AB12","useCount":1,"maxUses":10,"expiresAt":"2026-02-01T00:00:00.000Z"}],
		"plan":{"used":1,"limit":2}}
	""".trimIndent()

	@Test
	fun `overview reads the list, roster, live invites and plan with the bearer`() = runBlocking {
		ok(overviewBody)
		val result = families.overview()

		val recorded = server.takeRequest()
		assertEquals("GET", recorded.method)
		assertEquals("/api/families", recorded.path)
		assertEquals("Bearer fp_test", recorded.getHeader("Authorization"))

		val overview = (result as ApiResult.Ok).value
		assertEquals(1, overview.plan.used)
		assertEquals(2, overview.plan.limit)
		val card = overview.families.single()
		assertEquals("The Smiths", card.name)
		assertEquals(3, card.memberCount)
		assertEquals(4, card.openTasks)
		assertEquals("1/2/2026", card.createdLabel)
		assertTrue(card.canInvite)
		assertEquals("creator", card.role)
		assertEquals(listOf("Ada", "Bo"), card.members.map { it.firstName })
		assertEquals("AB12", overview.activeInvites.single().code)
		assertEquals("parent", overview.roster.single().memberType)
	}

	@Test
	fun `detail reads the hero, members, activity, modules and plan usage`() = runBlocking {
		ok(
			"""
			{"family":{"id":"f1","name":"The Smiths","color":null,"createdAt":"2026-01-02T00:00:00.000Z"},
			"members":[{"familyId":"f1","userId":"u2","firstName":"Bo","lastName":"L","role":"member","memberType":"child"}],
			"currentUserRole":"admin","currentUserId":"u1",
			"activity":[{"kind":"completed","title":"Mow lawn","actorName":"Bo L","targetName":null,"at":"2026-03-01T10:00:00.000Z"}],
			"moduleSwitches":{"kidsSchedule":false},
			"hiddenDashboardModules":["meals"],
			"activeInvite":{"code":"AB12","useCount":1,"maxUses":10,"expiresAt":"2026-02-01T00:00:00.000Z"},
			"inviteCreatedBy":"Ada",
			"planUsage":{"tierName":"Free","aiUsed":1,"aiLimit":10,"familiesUsed":1,"familyLimit":2,"members":2,"memberLimit":6,"archivedRetentionDays":30,"exportImportEnabled":true}}
			""".trimIndent(),
		)
		val detail = (families.detail("f1") as ApiResult.Ok).value

		assertEquals("/api/families/f1", server.takeRequest().path)
		assertEquals("admin", detail.currentUserRole)
		assertNull(detail.family?.color)
		assertEquals("child", detail.members.single().memberType)
		assertEquals("Mow lawn", detail.activity.single().title)
		assertEquals(false, detail.moduleSwitches["kidsSchedule"])
		assertEquals(listOf("meals"), detail.hiddenDashboardModules)
		assertEquals("AB12", detail.activeInvite?.code)
		assertEquals("Ada", detail.inviteCreatedBy)
		assertEquals(6, detail.planUsage.memberLimit)
	}

	@Test
	fun `missing family answers 404 with the server text`() = runBlocking {
		fail(404, "Family not found")
		assertEquals(ApiResult.Err(ApiError.NotFound("Family not found")), families.detail("nope"))
	}

	@Test
	fun `family and member writes patch only the fields the caller set`() = runBlocking {
		ok("""{"success":true,"family":{"id":"f1","name":"Smiths","color":"#334155"}}""")
		families.updateFamily("f1", name = "Smiths", color = "#334155")
		val familyPatch = server.takeRequest()
		assertEquals("PATCH", familyPatch.method)
		assertEquals("/api/families/f1", familyPatch.path)
		assertEquals("""{"name":"Smiths","color":"#334155"}""", familyPatch.body.readUtf8())

		ok("""{"success":true}""")
		families.updateMember("f1", "u2", role = null, memberType = "child")
		val memberPatch = server.takeRequest()
		assertEquals("PATCH", memberPatch.method)
		assertEquals("/api/families/f1/members/u2", memberPatch.path)
		assertEquals("""{"memberType":"child"}""", memberPatch.body.readUtf8())

		ok("""{"success":true}""")
		families.removeMember("f1", "u2")
		val removal = server.takeRequest()
		assertEquals("DELETE", removal.method)
		assertEquals("/api/families/f1/members/u2", removal.path)
	}

	@Test
	fun `a refused member change keeps the server message`() = runBlocking {
		fail(403, "Only the creator can promote to creator")
		assertEquals(
			ApiResult.Err(ApiError.Forbidden("Only the creator can promote to creator")),
			families.updateMember("f1", "u2", role = "creator", memberType = null),
		)
	}

	@Test
	fun `module switch puts the enabled flag`() = runBlocking {
		ok("""{"success":true}""")
		families.setModule("f1", "kidsSchedule", false)
		val recorded = server.takeRequest()
		assertEquals("PUT", recorded.method)
		assertEquals("/api/families/f1/modules/kidsSchedule", recorded.path)
		assertEquals("""{"enabled":false}""", recorded.body.readUtf8())
	}

	@Test
	fun `invite codes read the manager list and refuse a plain member`() = runBlocking {
		ok(
			"""
			{"canManageInvites":true,"codes":[{"code":"AB12","useCount":0,"maxUses":5,"expiresAt":"2026-02-01T00:00:00.000Z","createdBy":"u1"}]}
			""".trimIndent(),
		)
		val codes = (families.inviteCodes("f1") as ApiResult.Ok).value
		assertEquals("/api/families/f1/invite-codes", server.takeRequest().path)
		assertTrue(codes.canManageInvites)
		assertEquals(5, codes.codes.single().maxUses)

		ok("""{"canManageInvites":false,"codes":[]}""")
		val refused = (families.inviteCodes("f1") as ApiResult.Ok).value
		assertEquals(false, refused.canManageInvites)
		assertTrue(refused.codes.isEmpty())
	}

	@Test
	fun `minting a link posts the 10 use default and reads back the join url`() = runBlocking {
		ok("""{"code":"XY9","expiresAt":"2026-02-01T00:00:00.000Z","inviteUrl":"/family/join/XY9"}""")
		val invite = (families.mintInvite("f1", expiresInDays = 7, maxUses = 10) as ApiResult.Ok).value

		val recorded = server.takeRequest()
		assertEquals("POST", recorded.method)
		assertEquals("/api/family/invite", recorded.path)
		assertEquals("""{"familyId":"f1","expiresInDays":7,"maxUses":10}""", recorded.body.readUtf8())
		assertEquals("/family/join/XY9", invite.inviteUrl)
	}

	@Test
	fun `creating a family posts the palette colour and picks, and reads the 201 family`() = runBlocking {
		created("""{"family":{"id":"f9","name":"The Smiths","color":"#dd5822","createdAt":"2026-05-01T00:00:00.000Z"}}""")
		val family = (families.createFamily("The Smiths", "#dd5822", listOf("u2")) as ApiResult.Ok).value

		val recorded = server.takeRequest()
		assertEquals("POST", recorded.method)
		assertEquals("/api/families", recorded.path)
		assertEquals(
			"""{"name":"The Smiths","color":"#dd5822","memberIds":["u2"]}""",
			recorded.body.readUtf8(),
		)
		assertEquals("f9", family.id)
	}

	@Test
	fun `the limit refusal keeps the plan reason`() = runBlocking {
		fail(403, "Your plan allows 1 family.")
		val result = families.createFamily("Second", null, emptyList())
		assertEquals(ApiResult.Err(ApiError.Forbidden("Your plan allows 1 family.")), result)
	}

	@Test
	fun `member adds use the three G10e doors and the child door carries consent`() = runBlocking {
		ok("""{"success":true}""")
		families.addMemberDirect("f1", "u2")
		assertEquals("/api/families/f1/members/direct", server.takeRequest().path)

		ok("""{"success":true}""")
		families.addMemberByEmail("f1", "bo@example.com", "Bo", "L")
		val email = server.takeRequest()
		assertEquals("/api/families/f1/members/email", email.path)
		assertEquals("""{"email":"bo@example.com","firstName":"Bo","lastName":"L"}""", email.body.readUtf8())

		ok("""{"success":true,"link":"https://familyplanz.com/family/invite/email?token=abc"}""")
		val link = (families.addMemberEmailLink("f1", "bo@example.com", "Bo", "L") as ApiResult.Ok).value
		assertEquals("/api/families/f1/members/email/link", server.takeRequest().path)
		assertEquals("https://familyplanz.com/family/invite/email?token=abc", link.link)

		ok("""{"success":true,"user":{"id":"u7","firstName":"Kid","lastName":"L","email":"kid@example.com"}}""")
		val child = (families.addChild("f1", "Kid", "L", "kid@example.com", consent = true) as ApiResult.Ok).value
		val childRequest = server.takeRequest()
		assertEquals("/api/families/f1/members/child", childRequest.path)
		assertEquals(
			"""{"firstName":"Kid","lastName":"L","email":"kid@example.com","consentAcknowledged":true}""",
			childRequest.body.readUtf8(),
		)
		assertEquals("u7", child?.id)
	}

	@Test
	fun `family tasks read the board, the public leg and the roster`() = runBlocking {
		ok(
			"""
			{"tasks":[{"id":"t1","title":"Mow lawn","assignedTo":"u2","assignmentStatus":"pending","creatorFirstName":"Ada"}],
			"publicTasks":[{"id":"t2","title":"Bake","visibility":"public","userId":"u2"}],
			"familyRoster":[{"familyId":"f1","userId":"u2","firstName":"Bo","role":"member","memberType":"child"}],
			"taskCategories":[{"id":"c1","name":"Home"}]}
			""".trimIndent(),
		)
		val board = (families.tasks("f1") as ApiResult.Ok).value

		assertEquals("/api/families/f1/tasks", server.takeRequest().path)
		assertEquals("Mow lawn", board.tasks.single().title)
		assertEquals("Bake", board.publicTasks.single().title)
		assertEquals("Bo", board.familyRoster.single().firstName)
		assertEquals("Home", board.taskCategories.single().name)
	}

	@Test
	fun `member search sends the two letter floor and reads masked users`() = runBlocking {
		ok("""{"users":[{"id":"u3","firstName":"Ada","lastName":"L","email":"a***@example.com"}]}""")
		val found = (families.searchMembers("ad", exclude = listOf("u1")) as ApiResult.Ok).value

		val recorded = server.takeRequest()
		assertEquals("/api/family/member-search?q=ad&exclude=u1", recorded.path)
		assertEquals("Ada", found.single().firstName)
		assertEquals("a***@example.com", found.single().email)
	}
}
