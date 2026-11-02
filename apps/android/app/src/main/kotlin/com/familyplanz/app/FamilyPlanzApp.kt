package com.familyplanz.app

import android.app.Application
import com.familyplanz.app.push.ActivityNotifier
import com.familyplanz.app.push.FirebasePush

/**
 * Process start: manual Firebase init (issue #273, no google-services plugin)
 * before any FCM callback. Without firebase.properties push stays off and the
 * 'Family activity' channel is never created.
 */
class FamilyPlanzApp : Application() {
	override fun onCreate() {
		super.onCreate()
		if (FirebasePush.init(this)) ActivityNotifier.ensureChannel(this)
	}
}
