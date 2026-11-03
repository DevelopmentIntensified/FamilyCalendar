package com.familyplanz.app.data

import android.content.Context
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext

/**
 * Bearer token persistence (fp_ personal API token minted in the web app).
 * Plaintext shown once by the web; stored locally here so the phone session
 * survives restarts. Encrypted-at-rest hardening is tracked in issue #210.
 *
 * Also keeps the signed-in user's id (from `GET /api/me`) so background work
 * can tell the user's own edits apart (#281). It belongs to the token: a new
 * token or sign-out drops it.
 *
 * #288: a guest sign-in also sets a "guest note" flag (drives the save-it-on-the-web
 * note); it belongs to the token the same way.
 */
private val Context.fpDataStore by preferencesDataStore(name = "fp_session")

class DataStoreTokenStore(private val context: Context) {
	suspend fun token(): String? {
		val prefs = context.fpDataStore.data.first()
		return prefs[TOKEN_KEY]?.takeIf { it.isNotBlank() }
	}

	suspend fun save(token: String) = edit {
		it[TOKEN_KEY] = token.trim()
		it.remove(USER_ID_KEY)
		it.remove(GUEST_KEY)
	}

	suspend fun userId(): String? {
		val prefs = context.fpDataStore.data.first()
		return prefs[USER_ID_KEY]?.takeIf { it.isNotBlank() }
	}

	suspend fun saveUserId(id: String) = edit { it[USER_ID_KEY] = id }

	/** True while a guest session's note is still undismissed. */
	suspend fun guestNote(): Boolean = context.fpDataStore.data.first()[GUEST_KEY] == true

	suspend fun saveGuestNote(show: Boolean) = edit { it[GUEST_KEY] = show }

	suspend fun clear() = edit {
		it.remove(TOKEN_KEY)
		it.remove(USER_ID_KEY)
		it.remove(GUEST_KEY)
	}

	/**
	 * DataStore runs the transform in the caller's context; pinning it to IO
	 * means a write queued from a Main that never resumes (a finished screen
	 * or test) cannot wedge the store's single writer for everyone else.
	 */
	private suspend fun edit(transform: (MutablePreferences) -> Unit) {
		withContext(Dispatchers.IO) { context.fpDataStore.edit { transform(it) } }
	}

	companion object {
		private val TOKEN_KEY = stringPreferencesKey("api_token")
		private val USER_ID_KEY = stringPreferencesKey("user_id")
		private val GUEST_KEY = booleanPreferencesKey("guest_note")
	}
}
