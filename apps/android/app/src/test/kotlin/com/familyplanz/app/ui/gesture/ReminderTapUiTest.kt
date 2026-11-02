package com.familyplanz.app.ui.gesture

import android.os.Looper
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.EventDto
import com.familyplanz.app.data.FileTaskCache
import com.familyplanz.app.reminders.ReminderAwareCache
import com.familyplanz.app.ui.CalendarViewModel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import java.time.YearMonth

/** Issue #271: reminder tap lands on that day's Day view; fresh event months re-plan alarms. */
@RunWith(RobolectricTestRunner::class)
class ReminderTapUiTest {
	@Test
	fun open_day_moves_to_that_month_and_selects_the_day() {
		val repo = FakeRepository().apply {
			events = ApiResult.Ok(listOf(EventDto(id = "e1", title = "Recital", start = "2027-03-05T18:00:00Z", date = "2027-03-05")))
		}
		val vm = CalendarViewModel(repo)
		vm.openDay("2027-03-05")
		shadowOf(Looper.getMainLooper()).idle()

		val ui = vm.ui.value
		assertEquals(YearMonth.of(2027, 3), ui.month)
		assertEquals("2027-03-05", ui.selectedDay)
		assertEquals(listOf("Recital"), ui.grouped.single { it.day == "2027-03-05" }.events.map { it.title })
	}

	@Test
	fun open_day_ignores_garbage() {
		val vm = CalendarViewModel(FakeRepository())
		vm.openDay("not-a-day")
		shadowOf(Looper.getMainLooper()).idle()
		assertNull(vm.ui.value.selectedDay)
	}

	@Test
	fun saving_an_events_month_triggers_a_reminder_replan() = runBlocking {
		var replans = 0
		val dir = RuntimeEnvironment.getApplication().filesDir
		val cache = ReminderAwareCache(FileTaskCache(dir)) { replans++ }
		cache.saveTasks(emptyList())
		assertEquals(0, replans)
		cache.saveEvents(2026, 11, emptyList())
		assertEquals(1, replans)
	}
}
