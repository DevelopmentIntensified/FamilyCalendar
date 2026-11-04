package com.familyplanz.app.ui.shell

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** OfflineBanner's `isOnline()` / `subscribeToOnlineStatus` (`$lib/utils/offline`). */
interface NetworkStatus {
	val online: StateFlow<Boolean>

	/** Always online (tests, previews). */
	object Online : NetworkStatus {
		override val online: StateFlow<Boolean> = MutableStateFlow(true)
	}
}

/**
 * OfflineBanner's `getPendingCount()`: writes queued while offline. Lanes
 * report their queues here (L3 `TaskCache`, future event/grocery queues).
 */
interface PendingWrites {
	val count: StateFlow<Int>

	object None : PendingWrites {
		override val count: StateFlow<Int> = MutableStateFlow(0)
	}
}

/** A settable [PendingWrites] a lane can own and bump. */
class MutablePendingWrites(initial: Int = 0) : PendingWrites {
	private val state = MutableStateFlow(initial)
	override val count: StateFlow<Int> = state

	fun set(value: Int) {
		state.value = value.coerceAtLeast(0)
	}
}

/** `ConnectivityManager` default-network callback → online flag (validated internet). */
class SystemNetworkStatus(context: Context) : NetworkStatus {
	private val manager = context.getSystemService(ConnectivityManager::class.java)
	private val state = MutableStateFlow(currentlyOnline())
	override val online: StateFlow<Boolean> = state

	init {
		// ACCESS_NETWORK_STATE arrives through the WorkManager / Firebase manifests; never crash without it.
		runCatching { register() }
	}

	private fun register() {
		manager?.registerDefaultNetworkCallback(
			object : ConnectivityManager.NetworkCallback() {
				override fun onAvailable(network: Network) {
					state.value = true
				}

				override fun onLost(network: Network) {
					state.value = currentlyOnline()
				}

				override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
					state.value = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
				}
			},
		)
	}

	private fun currentlyOnline(): Boolean {
		val caps = manager?.activeNetwork?.let(manager::getNetworkCapabilities) ?: return false
		return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
	}
}
