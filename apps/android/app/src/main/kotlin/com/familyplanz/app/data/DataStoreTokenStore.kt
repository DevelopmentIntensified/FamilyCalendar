package com.familyplanz.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

/**
 * Bearer token persistence (fp_ personal API token minted in the web app).
 * Plaintext shown once by the web; stored locally here so the phone session
 * survives restarts. Encrypted-at-rest hardening is tracked in issue #210.
 */
private val Context.fpDataStore by preferencesDataStore(name = "fp_session")

class DataStoreTokenStore(private val context: Context) {
	suspend fun token(): String? {
		val prefs = context.fpDataStore.data.first()
		return prefs[TOKEN_KEY]?.takeIf { it.isNotBlank() }
	}

	suspend fun save(token: String) {
		context.fpDataStore.edit { it[TOKEN_KEY] = token.trim() }
	}

	suspend fun clear() {
		context.fpDataStore.edit { it.remove(TOKEN_KEY) }
	}

	companion object {
		private val TOKEN_KEY = stringPreferencesKey("api_token")
	}
}
