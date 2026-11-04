package com.familyplanz.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

/*
 * The phone focus session's local record (#293): the open session and the
 * not-yet-uploaded finished ones. It is written before any network call, so
 * the timer survives an app restart and nothing is lost if the app dies.
 * Keyed by the signed-in user: another account's record is never uploaded.
 */

/** The running phone session; [serverId] null = not registered with the server yet (offline start). */
@Serializable
data class OpenPhoneSession(val taskId: String, val startedAt: String, val serverId: String? = null)

/** A finished session waiting for upload: PATCH when [serverId] is known, else one finished POST. */
@Serializable
data class PendingPhoneSession(
	val taskId: String,
	val startedAt: String,
	val endedAt: String,
	val serverId: String? = null,
)

@Serializable
data class PhoneFocusSnapshot(
	val userId: String,
	val open: OpenPhoneSession? = null,
	val queue: List<PendingPhoneSession> = emptyList(),
)

interface PhoneFocusStore {
	suspend fun load(userId: String): PhoneFocusSnapshot?

	suspend fun save(snapshot: PhoneFocusSnapshot)
}

/** Pure codec, unit-testable. */
object PhoneFocusCodec {
	private val json = Json {
		ignoreUnknownKeys = true
		encodeDefaults = true
	}

	fun encode(snapshot: PhoneFocusSnapshot): String = json.encodeToString(PhoneFocusSnapshot.serializer(), snapshot)

	fun decode(text: String?): PhoneFocusSnapshot? =
		text?.let { runCatching { json.decodeFromString(PhoneFocusSnapshot.serializer(), it) }.getOrNull() }
}

class FilePhoneFocusStore(private val filesDir: File) : PhoneFocusStore {
	private val file get() = File(filesDir, "phone-focus.json")

	override suspend fun load(userId: String): PhoneFocusSnapshot? = withContext(Dispatchers.IO) {
		PhoneFocusCodec.decode(if (file.exists()) file.readText() else null)?.takeIf { it.userId == userId }
	}

	override suspend fun save(snapshot: PhoneFocusSnapshot) = withContext(Dispatchers.IO) {
		val tmp = File(filesDir, "phone-focus.json.tmp")
		tmp.writeText(PhoneFocusCodec.encode(snapshot))
		if (!tmp.renameTo(file)) file.writeText(PhoneFocusCodec.encode(snapshot))
	}
}

/** In-memory store (tests, previews). */
class MemoryPhoneFocusStore(var snapshot: PhoneFocusSnapshot? = null) : PhoneFocusStore {
	override suspend fun load(userId: String): PhoneFocusSnapshot? = snapshot?.takeIf { it.userId == userId }

	override suspend fun save(snapshot: PhoneFocusSnapshot) {
		this.snapshot = snapshot
	}
}
