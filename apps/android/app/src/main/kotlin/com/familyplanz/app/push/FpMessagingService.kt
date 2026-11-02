package com.familyplanz.app.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.runBlocking

/**
 * FCM edge (issue #273). Both callbacks run on Firebase's worker thread, so
 * blocking there is the documented contract; the work itself is short (one
 * POST, or one WorkManager enqueue / notification).
 */
class FpMessagingService : FirebaseMessagingService() {
	override fun onNewToken(token: String) {
		runBlocking { PushGraph.registrar(applicationContext).register(token) }
	}

	override fun onMessageReceived(message: RemoteMessage) {
		val data = message.data
		val payload = PushPayload(
			type = data["type"],
			title = message.notification?.title ?: data["title"],
			body = message.notification?.body ?: data["body"],
			link = data["link"],
			actorId = data["actorId"],
		)
		runBlocking { PushGraph.handler(applicationContext).handle(payload) }
	}
}
