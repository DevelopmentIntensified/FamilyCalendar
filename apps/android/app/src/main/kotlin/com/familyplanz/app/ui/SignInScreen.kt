package com.familyplanz.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.AuthIntent
import com.familyplanz.app.data.SignupNames

/** Sign-in screen callbacks (#288); each maps 1:1 onto [SignInViewModel]. */
data class SignInActions(
	/** Names are null on login; on signup they are what the user typed. */
	val onRequestCode: (email: String, names: SignupNames?) -> Unit,
	val onVerifyCode: (code: String) -> Unit,
	val onResendCode: () -> Unit,
	val onPassword: (email: String, password: String) -> Unit,
	val onGuest: () -> Unit,
	val onIntent: (AuthIntent) -> Unit,
	val onStep: (SignInStep) -> Unit,
	/** Advanced: paste an fp_ token minted in the web app. */
	val onSaveToken: (String) -> Unit,
)

object SignInTags {
	const val EMAIL = "signin-email"
	const val CODE = "signin-code"
	const val PASSWORD = "signin-password"
	const val TOKEN = "signin-token"
	const val FIRST_NAME = "signin-first-name"
	const val LAST_NAME = "signin-last-name"
}

/**
 * Default unauthenticated destination (#288): email code, password, guest,
 * and the old paste-a-token entry under a collapsed "Advanced". [note] is
 * why the session ended (a 401 elsewhere), shown above the form.
 */
@Composable
fun SignInScreen(state: SignInUiState, note: String?, actions: SignInActions) {
	Column(
		modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
		verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
		horizontalAlignment = Alignment.CenterHorizontally,
	) {
		Text("Family Planz", style = MaterialTheme.typography.headlineMedium)
		Text(
			if (state.intent == AuthIntent.SIGNUP) "Create your account" else "Sign in or get started",
			style = MaterialTheme.typography.titleMedium,
		)
		note?.let { ErrorLine(it) }
		// One address across the email and password steps.
		var email by rememberSaveable { mutableStateOf(state.email) }
		when (state.step) {
			SignInStep.EMAIL -> EmailStep(state, email, { email = it }, actions)
			SignInStep.CODE -> CodeStep(state, actions)
			SignInStep.PASSWORD -> PasswordStep(state, email, { email = it }, actions)
		}
		state.error?.let { ErrorLine(it) }
	}
}

@Composable
internal fun ErrorLine(text: String) {
	Text(text, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
}

/** Busy label for the button whose call is in flight, its idle label otherwise. */
internal fun SignInUiState.label(button: SignInPending, idle: String, busy: String): String =
	if (pending == button) busy else idle

@Composable
private fun EmailStep(state: SignInUiState, email: String, onEmail: (String) -> Unit, actions: SignInActions) {
	val idle = state.pending == null
	val signup = state.intent == AuthIntent.SIGNUP
	var first by rememberSaveable { mutableStateOf("") }
	var last by rememberSaveable { mutableStateOf("") }
	if (signup) {
		NameField("First name", first, idle, SignInTags.FIRST_NAME) { first = it }
		NameField("Last name", last, idle, SignInTags.LAST_NAME) { last = it }
	}
	EmailField(email, idle, onEmail)
	Button(
		onClick = { actions.onRequestCode(email, if (signup) SignupNames(first, last) else null) },
		enabled = idle,
		modifier = Modifier.fillMaxWidth(),
	) { Text(state.label(SignInPending.SEND_CODE, "Email me a code", "Sending code…")) }
	if (state.intent == AuthIntent.LOGIN) {
		TextButton(onClick = { actions.onStep(SignInStep.PASSWORD) }, enabled = idle) { Text("Use password instead") }
		TextButton(onClick = { actions.onIntent(AuthIntent.SIGNUP) }, enabled = idle) { Text("Create an account") }
	} else {
		TextButton(onClick = { actions.onIntent(AuthIntent.LOGIN) }, enabled = idle) { Text("I already have an account") }
	}
	OutlinedButton(onClick = actions.onGuest, enabled = idle, modifier = Modifier.fillMaxWidth()) {
		Text(state.label(SignInPending.GUEST, "Continue without an account", "Starting guest session…"))
	}
	AdvancedTokenEntry(actions.onSaveToken)
}

@Composable
private fun NameField(label: String, value: String, enabled: Boolean, tag: String, onChange: (String) -> Unit) {
	OutlinedTextField(
		value = value,
		onValueChange = onChange,
		label = { Text(label) },
		enabled = enabled,
		singleLine = true,
		keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Next),
		modifier = Modifier.fillMaxWidth().testTag(tag),
	)
}

@Composable
internal fun EmailField(value: String, enabled: Boolean, onChange: (String) -> Unit) {
	OutlinedTextField(
		value = value,
		onValueChange = onChange,
		label = { Text("Email") },
		enabled = enabled,
		singleLine = true,
		keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
		modifier = Modifier.fillMaxWidth().testTag(SignInTags.EMAIL),
	)
}

/** Developer fallback: the pre-#288 paste-a-token entry, collapsed by default. */
@Composable
private fun AdvancedTokenEntry(onSave: (String) -> Unit) {
	var open by rememberSaveable { mutableStateOf(false) }
	var token by rememberSaveable { mutableStateOf("") }
	HorizontalDivider(modifier = Modifier.padding(top = 16.dp))
	TextButton(onClick = { open = !open }) { Text(if (open) "Hide advanced" else "Advanced") }
	if (!open) return
	Text(
		"Paste a personal API token minted in the web app (Settings > API tokens).",
		style = MaterialTheme.typography.bodySmall,
	)
	OutlinedTextField(
		value = token,
		onValueChange = { token = it },
		label = { Text("API token (fp_...)") },
		modifier = Modifier.fillMaxWidth().testTag(SignInTags.TOKEN),
		singleLine = true,
		visualTransformation = PasswordVisualTransformation(),
		keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
	)
	OutlinedButton(
		onClick = { if (token.isNotBlank()) onSave(token) },
		modifier = Modifier.fillMaxWidth(),
	) { Text("Save and sync") }
}
