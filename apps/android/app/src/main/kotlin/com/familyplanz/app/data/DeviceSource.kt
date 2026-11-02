package com.familyplanz.app.data

import kotlinx.serialization.Serializable

/** No default on `platform`: encodeDefaults is off, and the wire must say "android". */
@Serializable
data class RegisterDeviceRequest(val token: String, val platform: String)

@Serializable
data class UnregisterDeviceRequest(val token: String)

@Serializable
data class DeviceAck(val success: Boolean = false)

/** This phone's FCM registration token on the server (#272 `/api/devices`). */
interface DeviceSource {
	suspend fun register(fcmToken: String): ApiResult<Unit>

	suspend fun unregister(fcmToken: String): ApiResult<Unit>
}

class NetworkDeviceSource(private val api: FamilyPlanzApi) : DeviceSource {
	override suspend fun register(fcmToken: String): ApiResult<Unit> =
		apiCall { api.registerDevice(RegisterDeviceRequest(fcmToken, PLATFORM)) }.acked()

	override suspend fun unregister(fcmToken: String): ApiResult<Unit> =
		apiCall { api.unregisterDevice(UnregisterDeviceRequest(fcmToken)) }.acked()

	/** The ack body carries nothing the phone acts on; 2xx is the signal. */
	private fun ApiResult<DeviceAck>.acked(): ApiResult<Unit> = when (this) {
		is ApiResult.Ok -> ApiResult.Ok(Unit)
		is ApiResult.Err -> this
	}

	private companion object {
		const val PLATFORM = "android"
	}
}
