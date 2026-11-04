package com.familyplanz.app.ui.shell

import androidx.compose.runtime.staticCompositionLocalOf
import com.familyplanz.app.AppModules
import kotlinx.coroutines.flow.StateFlow

/** One line for the shell's toaster (lanes' ViewModels emit these). */
data class UiSnack(val text: String)

/** The sign-in screen's note when a lane's call comes back 401. */
const val SESSION_ENDED_NOTE = "Sign in again - your session ended."

/**
 * What a lane's entry may ask of the app shell: show a snack, end the
 * session after a 401, sign out, and the #288 guest flag. Lanes report here
 * instead of reaching into another lane's ViewModel.
 */
interface Shell {
	/** #288: show the guest-account note (Tasks tab). */
	val guestNoteVisible: StateFlow<Boolean>

	/** A plain toast (`pushToast({message})`): 6 s, up to 4 stacked. */
	fun showSnack(text: String)

	/** A toast with an action, e.g. "Undo" (`Toaster.svelte`): the action runs, then the toast goes. */
	fun showToast(text: String, actionLabel: String? = null, onAction: (() -> Unit)? = null) = showSnack(text)

	/** Back to the sign-in screen with [note]; the token stays stored (the server said no). */
	fun endSession(note: String = SESSION_ENDED_NOTE)

	/** Drop the token, run the sign-out hooks, revoke at the server. */
	fun signOut()

	fun dismissGuestNote()
}

/** Provided by [com.familyplanz.app.ui.FamilyPlanzHost] around every signed-in entry. */
val LocalShell = staticCompositionLocalOf<Shell> { error("LocalShell is provided by FamilyPlanzHost") }

/** The per-lane DI seams; provided by [com.familyplanz.app.ui.FamilyPlanzHost]. */
val LocalAppModules = staticCompositionLocalOf<AppModules> { error("LocalAppModules is provided by FamilyPlanzHost") }
