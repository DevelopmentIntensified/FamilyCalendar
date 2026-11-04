package com.familyplanz.app.data

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Wire contract for `GET /api/dashboard?date=` (#292 G8) and the two
 * `/api/tasks` writes the Dashboard's rows make: path, bearer token, body
 * shape, and every field the cards read.
 */
class DashboardContractTest {
	private lateinit var server: MockWebServer
	private lateinit var source: DashboardSource

	@Before
	fun setUp() {
		server = MockWebServer()
		server.start()
		val api = L4Http.create(server.url("/").toString(), DashboardApi::class.java) { "fp_token123" }
		source = NetworkDashboardSource(api)
	}

	@After
	fun tearDown() {
		server.shutdown()
	}

	@Test
	fun `load sends the viewed date and parses the contract`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(200).setBody(PAYLOAD))
		val result = source.load("2026-11-03")
		val dto = result.ok()
		val request = server.takeRequest()
		assertEquals("/api/dashboard?date=2026-11-03", request.path)
		assertEquals("Bearer fp_token123", request.getHeader("Authorization"))

		assertEquals("America/Chicago", dto.zone)
		assertEquals("2026-11-03T00:00:00.000-06:00", dto.dayISO)
		assertTrue(dto.isToday)
		assertEquals("user-1", dto.meId)
		assertEquals("fam-1", dto.familyId)
		assertFalse(dto.modules.getValue("kids"))
		assertEquals("Ps 118:24", dto.dailyVerse?.reference)
		assertEquals(listOf("Errands"), dto.taskCategories.map { it.name })
		assertEquals(listOf("Homework"), dto.warnings)
	}

	@Test
	fun `today sends no date parameter`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(200).setBody(PAYLOAD))
		source.load(null)
		assertEquals("/api/dashboard", server.takeRequest().path)
	}

	@Test
	fun `data carries the task, roster, glance, completed, kids and grocery rows`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(200).setBody(PAYLOAD))
		val dto = source.load("2026-11-03").ok()
		val data = dto.data

		assertEquals(listOf("Take out bins", "Pay rent"), data.top3.map { it.title })
		assertEquals("2026-11-02T00:00:00.000Z", data.top3[1].dueDate)
		assertEquals("high", data.top3[1].priority)
		assertEquals("user-2", data.top3[1].assignedTo)
		assertEquals("monthly", data.top3[1].recurrenceFrequency)
		assertEquals(listOf("Dad"), data.familyMembers.map { it.firstName })
		assertEquals(1, data.glance.doneToday)
		assertEquals(3, data.glance.weekStreak)
		assertEquals(listOf("Milk"), data.completedToday.map { it.title })
		assertEquals("2026-11-03T14:00:00.000Z", data.dayEvents.first().start)
		assertEquals("going", data.dayEvents.first().rsvpStatus)
		assertEquals(2, data.dayEvents.first().attendance?.invited)
		assertEquals(listOf("Soccer"), data.kidsSchedule.map { it.title })
		assertEquals(listOf("Ada"), data.kidsSchedule.first().kids.map { it.name })
		assertEquals(listOf("milk", "eggs"), data.familyGroceries.map { it.name })
		assertEquals(listOf("Aldi"), data.familyGroceries.first().stores)
		assertEquals(listOf("bread"), data.mineGroceries.map { it.name })
	}

	@Test
	fun `toggleComplete sends the toggle body to the task path`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(200).setBody("""{"success":true}"""))
		val result = source.toggleComplete("t1")
		assertTrue(result is ApiResult.Ok)
		val request = server.takeRequest()
		assertEquals("PUT", request.method)
		assertEquals("/api/tasks/t1", request.path)
		assertEquals("""{"toggleComplete":true}""", request.body.readUtf8())
	}

	@Test
	fun `setPriority sends just the priority`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(200).setBody("""{"success":true}"""))
		source.setPriority("t1", "high")
		val request = server.takeRequest()
		assertEquals("/api/tasks/t1", request.path)
		assertEquals("""{"priority":"high"}""", request.body.readUtf8())
	}

	@Test
	fun `createFamilyTask posts the assignee, due date, priority, tags and category`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(201).setBody("""{"success":true}"""))
		val created = source.createFamilyTask(
			NewFamilyTask(
				title = "Take out bins",
				familyId = "fam-1",
				assignedTo = "user-2",
				dueDate = "2026-11-07",
				priority = "high",
				tags = listOf("chores"),
				category = "Errands",
			),
		)
		assertTrue(created is ApiResult.Ok)
		val request = server.takeRequest()
		assertEquals("POST", request.method)
		assertEquals("/api/tasks", request.path)
		val body = kotlinx.serialization.json.Json.parseToJsonElement(request.body.readUtf8()).jsonObject
		assertEquals("Take out bins", body.getValue("title").jsonPrimitive.content)
		assertEquals("fam-1", body.getValue("familyId").jsonPrimitive.content)
		assertEquals("user-2", body.getValue("assignedTo").jsonPrimitive.content)
		assertEquals("2026-11-07", body.getValue("dueDate").jsonPrimitive.content)
		assertEquals("high", body.getValue("priority").jsonPrimitive.content)
		assertEquals("chores", body.getValue("tags").jsonArray.first().jsonPrimitive.content)
		assertEquals("Errands", body.getValue("category").jsonPrimitive.content)
	}

	@Test
	fun `an unnamed assignee and no category leave those keys out`() {
		val body = NewFamilyTask(title = "Water plants", familyId = "fam-1").json().jsonObject
		assertFalse(body.containsKey("assignedTo"))
		assertFalse(body.containsKey("category"))
		assertFalse(body.containsKey("dueDate"))
	}

	@Test
	fun `a 500 answer is an Err, not a crash`() = runBlocking {
		server.enqueue(MockResponse().setResponseCode(500).setBody("""{"error":"boom"}"""))
		val result = source.load("2026-11-03")
		assertTrue(result is ApiResult.Err)
	}

	private fun <T> ApiResult<T>.ok(): T = when (this) {
		is ApiResult.Ok -> value
		is ApiResult.Err -> error("expected Ok, got $error")
	}

	private companion object {
		/** `GET /api/dashboard` as `server.test.ts` pins it, trimmed to one of each row. */		const val PAYLOAD = """
		{
			"zone": "America/Chicago",
			"dayISO": "2026-11-03T00:00:00.000-06:00",
			"isToday": true,
			"meId": "user-1",
			"familyId": "fam-1",
			"modules": { "verse": true, "glance": true, "top3": true, "completed": true, "board": true, "kids": false, "groceries": true },
			"dailyVerse": { "reference": "Ps 118:24", "text": "This is the day", "attribution": "KJV" },
			"taskCategories": [{ "id": "c1", "name": "Errands" }],
			"data": {
				"userTasks": [{ "id": "t1", "title": "Take out bins", "priority": "normal", "userId": "user-1" }],
				"familyTasks": [],
				"familyMembers": [{ "userId": "user-2", "firstName": "Dad", "lastName": "Smith" }],
				"dayEvents": [{
					"id": "e1", "title": "Dentist", "start": "2026-11-03T14:00:00.000Z", "end": "2026-11-03T15:00:00.000Z",
					"allDay": false, "source": "family", "rsvpStatus": "going",
					"attendance": { "going": 1, "invited": 2, "required": 0, "requiredPending": 0, "goingNames": ["Dad"] }
				}],
				"top3": [
					{ "id": "t1", "title": "Take out bins", "priority": "normal", "userId": "user-1" },
					{ "id": "t2", "title": "Pay rent", "dueDate": "2026-11-02T00:00:00.000Z", "priority": "high",
					  "assignedTo": "user-2", "recurrenceFrequency": "monthly", "familyId": "fam-1" }
				],
				"glance": { "doneToday": 1, "openToday": 2, "weekStreak": 3 },
				"completedToday": [{ "id": "t9", "title": "Milk", "completedAt": "2026-11-03T14:00:00.000Z" }],
				"kidsSchedule": [{ "id": "k1", "title": "Soccer", "start": "2026-11-03T22:00:00.000Z", "kids": [{ "id": "kid-1", "name": "Ada" }] }],
				"familyGroceries": [{ "name": "milk", "stores": ["Aldi"] }, { "name": "eggs", "stores": [] }],
				"mineGroceries": [{ "name": "bread", "stores": [] }]
			},
			"warnings": ["Homework"]
		}
		"""
	}
}
