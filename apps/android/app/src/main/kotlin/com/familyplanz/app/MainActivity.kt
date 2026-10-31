package com.familyplanz.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.familyplanz.app.data.ApiFactory
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.data.NetworkTaskRepository
import com.familyplanz.app.ui.AppViewModel
import com.familyplanz.app.ui.CalendarViewModel
import com.familyplanz.app.ui.FamilyPlanzHost
import com.familyplanz.app.ui.PhoneTab
import com.familyplanz.app.ui.QuickAddViewModel
import kotlinx.coroutines.runBlocking

const val FP_DEBUG_TOKEN = "fp_debug_token"
const val FP_DEBUG_SCREEN = "fp_screen"

class MainActivity : ComponentActivity() {
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		enableEdgeToEdge()
		// Debug-only emulator bootstrap (issue #210): `--es fp_debug_token` seeds
		// a throwaway DataStore token; `--es fp_screen calendar|tasks` picks the
		// initial tab so UI checks run without hand-typing. Release has neither.
		val debugToken = if (BuildConfig.DEBUG) intent?.getStringExtra(FP_DEBUG_TOKEN) else null
		if (debugToken != null) {
			runBlocking { DataStoreTokenStore(applicationContext).save(debugToken) }
		}
		val initialTab = when (intent?.getStringExtra(FP_DEBUG_SCREEN)) {
			"calendar" -> PhoneTab.CALENDAR
			else -> PhoneTab.TASKS
		}
		setContent {
			MaterialTheme {
				val vm: AppViewModel = viewModel(factory = appViewModelFactory())
				val calVm: CalendarViewModel = viewModel(factory = calendarViewModelFactory())
				val quickVm: QuickAddViewModel = viewModel(factory = quickAddViewModelFactory())
				FamilyPlanzHost(vm, calVm, quickVm, initialTab)
			}
		}
	}

	private fun taskRepository(store: DataStoreTokenStore): NetworkTaskRepository {
		val api = ApiFactory.create(BuildConfig.API_BASE_URL) { runBlocking { store.token() } }
		return NetworkTaskRepository(api)
	}

	private fun appViewModelFactory() = viewModelFactory {
		initializer {
			val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as android.app.Application
			val store = DataStoreTokenStore(app)
			AppViewModel(taskRepository(store), store)
		}
	}

	private fun calendarViewModelFactory() = viewModelFactory {
		initializer {
			val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as android.app.Application
			CalendarViewModel(taskRepository(DataStoreTokenStore(app)))
		}
	}

	private fun quickAddViewModelFactory() = viewModelFactory {
		initializer {
			val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as android.app.Application
			QuickAddViewModel(taskRepository(DataStoreTokenStore(app)))
		}
	}
}
