package com.familyplanz.app.ui.secondary

import androidx.lifecycle.ViewModel
import com.familyplanz.app.data.ApiError
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** A page's one load: skeleton while [Loading], inline retry on [Failed]. */
sealed interface Load<out T> {
	data object Loading : Load<Nothing>

	data class Failed(val message: String) : Load<Nothing>

	data class Loaded<T>(val value: T) : Load<T>
}

/**
 * What every menu and admin page shares: a snack for the shell (the web's
 * toast) and the 401 hand-off. A dead session surfaces once through
 * [sessionEnded]; the entry forwards it to the shell, which swaps to sign-in.
 */
abstract class PageViewModel : ViewModel() {
	private val _sessionEnded = MutableStateFlow<String?>(null)
	val sessionEnded: StateFlow<String?> = _sessionEnded

	private val _snack = MutableStateFlow<String?>(null)
	val snack: StateFlow<String?> = _snack

	fun consumeSnack() {
		_snack.value = null
	}

	protected fun showSnack(text: String) {
		_snack.value = text
	}

	/** The text to show for [error]; a 401 also ends the session. */
	protected fun describe(error: ApiError): String {
		if (error is ApiError.Unauthorized) _sessionEnded.value = error.message
		return error.message
	}
}
