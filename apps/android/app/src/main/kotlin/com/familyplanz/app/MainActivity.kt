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
import com.familyplanz.app.ui.FamilyPlanzHost
import kotlinx.coroutines.runBlocking

class MainActivity : ComponentActivity() {
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		enableEdgeToEdge()
		setContent {
			MaterialTheme {
				val vm: AppViewModel = viewModel(factory = appViewModelFactory())
				FamilyPlanzHost(vm)
			}
		}
	}

	private fun appViewModelFactory() = viewModelFactory {
		initializer {
			val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as android.app.Application
			val store = DataStoreTokenStore(app)
			val api = ApiFactory.create(BuildConfig.API_BASE_URL) { runBlocking { store.token() } }
			AppViewModel(NetworkTaskRepository(api), store)
		}
	}
}
