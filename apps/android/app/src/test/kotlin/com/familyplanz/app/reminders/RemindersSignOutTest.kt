package com.familyplanz.app.reminders

import android.app.AlarmManager
import android.app.Application
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.data.EventDto
import com.familyplanz.app.data.FileTaskCache
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/** #271 gap closed by #273: signed out → the cache no longer drives alarms, so re-plan cancels them. */
@RunWith(RobolectricTestRunner::class)
class RemindersSignOutTest {
	private val app: Application = RuntimeEnvironment.getApplication()
	private val alarms get() = shadowOf(app.getSystemService(AlarmManager::class.java))

	@Test
	fun `re-plan after sign-out cancels alarms scheduled from the old account's cache`() = runBlocking {
		val start = Instant.now().plus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MINUTES)
		val month = start.atZone(ZoneId.systemDefault()).toLocalDate()
		val event = EventDto(id = "e1", title = "Piano", start = start.toString(), reminderMinutes = 15)
		FileTaskCache(app.filesDir).saveEvents(month.year, month.monthValue, listOf(event))
		val store = DataStoreTokenStore(app)

		store.save("fp_me")
		Reminders.rescheduleFromCache(app)
		assertNotNull(alarms.peekNextScheduledAlarm())

		store.clear()
		Reminders.rescheduleFromCache(app)
		assertNull(alarms.peekNextScheduledAlarm())
	}
}
