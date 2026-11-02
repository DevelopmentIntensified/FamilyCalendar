package com.familyplanz.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.familyplanz.app.data.ApiFactory
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.data.FileTaskCache
import com.familyplanz.app.data.NetworkTaskRepository
import com.familyplanz.app.reminders.ReminderAwareCache
import com.familyplanz.app.reminders.Reminders
import com.familyplanz.app.sync.BackgroundRefresh
import com.familyplanz.app.ui.AppViewModel
import com.familyplanz.app.ui.CalendarViewModel
import com.familyplanz.app.ui.FamilyPlanzHost
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.QuickAddViewModel
import com.familyplanz.app.ui.ReminderPermissionSlot
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

const val FP_DEBUG_TOKEN = "fp_debug_token"
const val FP_DEBUG_SCREEN = "fp_screen"

/** Reminder tap (#271): YYYY-MM-DD to open on the calendar Day view. */
const val FP_OPEN_DAY = "fp_open_day"

class MainActivity : ComponentActivity() {
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		enableEdgeToEdge()
		BackgroundRefresh.schedule(applicationContext)
		lifecycleScope.launch { Reminders.rescheduleFromCache(applicationContext) }
		// Debug-only emulator bootstrap (issue #210): `--es fp_debug_token` seeds
		// a throwaway DataStore token; `--es fp_screen calendar|tasks` picks the
		// initial tab so UI checks run without hand-typing. Release has neither.
		val debugToken = if (BuildConfig.DEBUG) intent?.getStringExtra(FP_DEBUG_TOKEN) else null
		if (debugToken != null) {
			runBlocking { DataStoreTokenStore(applicationContext).save(debugToken) }
		}
		val openDay = intent?.getStringExtra(FP_OPEN_DAY)
		val initialTab = when {
			openDay != null || intent?.getStringExtra(FP_DEBUG_SCREEN) == "calendar" -> PhoneTab.CALENDAR
			else -> PhoneTab.TASKS
		}
		setContent {
			MaterialTheme {
				val vm: AppViewModel = viewModel(factory = appViewModelFactory())
				val calVm: CalendarViewModel = viewModel(factory = calendarViewModelFactory())
				val quickVm: QuickAddViewModel = viewModel(factory = quickAddViewModelFactory())
				LaunchedEffect(openDay) { openDay?.let(calVm::openDay) }
				FamilyPlanzHost(vm, calVm, quickVm, initialTab) { ReminderPermissionSlot() }
			}
		}
	}

	private fun taskRepository(app: android.app.Application): NetworkTaskRepository {
		val store = DataStoreTokenStore(app)
		val api = ApiFactory.create(BuildConfig.API_BASE_URL) { runBlocking { store.token() } }
		val cache = ReminderAwareCache(FileTaskCache(app.filesDir)) { Reminders.rescheduleFromCache(app) }
		return NetworkTaskRepository(api, cache)
	}

	private fun appViewModelFactory() = viewModelFactory {
		initializer {
			val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as android.app.Application
			AppViewModel(taskRepository(app), DataStoreTokenStore(app))
		}
	}

	private fun calendarViewModelFactory() = viewModelFactory {
		initializer {
			val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as android.app.Application
			CalendarViewModel(taskRepository(app))
		}
	}

	private fun quickAddViewModelFactory() = viewModelFactory {
		initializer {
			val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as android.app.Application
			QuickAddViewModel(taskRepository(app))
		}
	}
}
