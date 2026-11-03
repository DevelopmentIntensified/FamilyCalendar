package com.familyplanz.app.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.DataStoreTokenStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * #288: "You're using a guest account" note on the Tasks tab. Shown after a
 * guest sign-in until dismissed; the flag lives with the token in the store,
 * so it survives restarts and a new sign-in drops it.
 */
class GuestNote(private val store: DataStoreTokenStore, private val scope: CoroutineScope) {
	private val _visible = MutableStateFlow(false)
	val visible: StateFlow<Boolean> = _visible

	/** Set once a sign-in or dismiss decided visibility, so a slow startup read can't undo it. */
	private var decided = false

	fun load() {
		scope.launch {
			val stored = store.guestNote()
			if (!decided) _visible.value = stored
		}
	}

	/** Called once the token is stored (saving a token clears the flag). */
	suspend fun signedIn(guest: Boolean) {
		decided = true
		_visible.value = guest
		store.saveGuestNote(guest)
	}

	fun dismiss() {
		decided = true
		_visible.value = false
		scope.launch { store.saveGuestNote(false) }
	}
}

const val GUEST_NOTE_TEXT = "You're using a guest account — save it with an email on the web"

@Composable
fun GuestAccountNote(onDismiss: () -> Unit) {
	Row(
		modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
		verticalAlignment = Alignment.CenterVertically,
	) {
		Text(GUEST_NOTE_TEXT, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
		TextButton(onClick = onDismiss) { Text("Dismiss") }
	}
}
