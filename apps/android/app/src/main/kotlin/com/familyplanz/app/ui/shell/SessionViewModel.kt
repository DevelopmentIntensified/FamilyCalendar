package com.familyplanz.app.ui.shell

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.viewModelScope
import com.familyplanz.app.data.AuthSource
import com.familyplanz.app.data.DataStoreTokenStore
import com.familyplanz.app.push.SessionHooks
import com.familyplanz.app.ui.auth.SessionCredentials
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

sealed interface SessionState {
	/** Reading the stored token at start-up. */
	data object Checking : SessionState

	data class SignedOut(val note: String? = null) : SessionState

	/**
	 * A working bearer is stored. [lanes] owns the lane ViewModels for this
	 * session only: leaving the session clears them, so no list, flag or
	 * stale 401 carries over into the next sign-in.
	 */
	class SignedIn internal constructor(val lanes: ViewModelStoreOwner) : SessionState
}

/**
 * Session (bearer token), the shell snack and the #288 guest flag. Sign-in
 * and sign-out run the #273 hooks; the lanes' screens report snacks and
 * 401s through [shell].
 */
class SessionViewModel(
	private val tokenStore: DataStoreTokenStore,
	private val session: SessionHooks = SessionHooks.None,
	private val auth: AuthSource? = null,
) : ViewModel() {
	private val _state = MutableStateFlow<SessionState>(SessionState.Checking)
	val state: StateFlow<SessionState> = _state

	/** The shell's toaster stack (`toasts.ts`). */
	val toasts = ToastQueue()

	/** #288 guest-account note on the Tasks tab. */
	val guestNote = GuestNote(tokenStore, viewModelScope)

	/** What the lanes' entries see (provided as [LocalShell]). */
	val shell: Shell = object : Shell {
		override val guestNoteVisible: StateFlow<Boolean> = guestNote.visible

		override fun showSnack(text: String) {
			toasts.push(text)
		}

		override fun showToast(text: String, actionLabel: String?, onAction: (() -> Unit)?) {
			toasts.push(text, actionLabel, onAction)
		}

		override fun endSession(note: String) = invalidateSession(note)

		override fun signOut() = clearToken()

		override fun dismissGuestNote() = guestNote.dismiss()
	}

	init {
		guestNote.load()
		viewModelScope.launch {
			if (tokenStore.token() == null) leave(null) else open()
		}
	}

	/**
	 * Open a session from native sign-in (#288) or a pasted token: store the
	 * bearer (+ me-id when the sign-in response named it), open, then the #273
	 * signed-in hook - the same path whichever way the token arrived.
	 */
	fun signIn(credentials: SessionCredentials) {
		viewModelScope.launch {
			tokenStore.save(credentials.token.trim())
			credentials.userId?.let { tokenStore.saveUserId(it) }
			guestNote.signedIn(credentials.guest)
			open()
			session.signedIn()
		}
	}

	/** Sign out: drop the token, then the #273 hooks and a best-effort server revoke (#288). */
	fun clearToken() {
		viewModelScope.launch {
			val previous = tokenStore.token()
			tokenStore.clear()
			leave(null)
			// #273: unregister + cancel reminders even if the screen goes away mid-call.
			// The device DELETE needs the bearer alive, so the revoke goes last.
			withContext(NonCancellable) {
				session.signedOut(previous)
				previous?.let { auth?.logout(it) }
			}
		}
	}

	/** Any screen's 401 swaps the host to the sign-in screen. */
	fun invalidateSession(note: String = SESSION_ENDED_NOTE) = leave(note)

	private fun open() {
		closeLanes()
		_state.value = SessionState.SignedIn(LaneStore())
	}

	private fun leave(note: String?) {
		closeLanes()
		toasts.clear()
		_state.value = SessionState.SignedOut(note)
	}

	private fun closeLanes() {
		(_state.value as? SessionState.SignedIn)?.lanes?.viewModelStore?.clear()
	}

	override fun onCleared() {
		closeLanes()
	}
}

private class LaneStore : ViewModelStoreOwner {
	override val viewModelStore = ViewModelStore()
}
