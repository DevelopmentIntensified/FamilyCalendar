package com.familyplanz.app.ui.alerts

import android.os.Looper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import com.familyplanz.app.ui.shell.LocalShell
import com.familyplanz.app.ui.shell.Shell
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.robolectric.Shadows.shadowOf

/** Lane 4's stand-in for the app shell: records snacks, session ends and opened web pages. */
class L4TestShell : Shell, UriHandler {
	val snacks = mutableListOf<String>()
	val opened = mutableListOf<String>()
	var ended = 0
	override val guestNoteVisible: StateFlow<Boolean> = MutableStateFlow(false)

	override fun showSnack(text: String) {
		snacks += text
	}

	override fun endSession(note: String) {
		ended++
	}

	override fun signOut() = Unit

	override fun dismissGuestNote() = Unit

	override fun openUri(uri: String) {
		opened += uri
	}

	@Composable
	fun Provide(content: @Composable () -> Unit) {
		CompositionLocalProvider(LocalShell provides this, LocalUriHandler provides this) {
			FamilyPlanzTheme(content)
		}
	}
}

/** Run the main looper until [condition] holds (5 s cap). */
fun awaitMain(condition: () -> Boolean) {
	val deadline = System.currentTimeMillis() + 5_000
	while (!condition() && System.currentTimeMillis() < deadline) {
		shadowOf(Looper.getMainLooper()).idle()
		Thread.sleep(5)
	}
	check(condition()) { "condition not met within 5 s" }
}
