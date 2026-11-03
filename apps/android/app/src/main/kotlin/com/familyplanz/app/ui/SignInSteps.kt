package com.familyplanz.app.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.em
import com.familyplanz.app.data.AuthIntent
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme

/**
 * 8-digit code entry. Paste-friendly: anything pasted is reduced to its
 * digits ("1234 5678" works), and a full code submits on its own.
 */
@Composable
internal fun CodeStep(state: SignInUiState, actions: SignInActions) {
	var code by rememberSaveable { mutableStateOf("") }
	val idle = state.pending == null
	Text(
		"Enter the ${SignInViewModel.CODE_LENGTH}-digit code we sent to ${state.email}",
		style = MaterialTheme.typography.bodyMedium,
		color = FpTheme.colors.textBody,
		textAlign = TextAlign.Center,
	)
	OutlinedTextField(
		value = code,
		onValueChange = { typed ->
			val digits = typed.filter(Char::isDigit).take(SignInViewModel.CODE_LENGTH)
			val completed = digits.length == SignInViewModel.CODE_LENGTH && digits != code
			code = digits
			if (completed) actions.onVerifyCode(digits)
		},
		label = { Text("${SignInViewModel.CODE_LENGTH}-digit code") },
		enabled = idle,
		singleLine = true,
		keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
		keyboardActions = KeyboardActions(onDone = { actions.onVerifyCode(code) }),
		modifier = Modifier.fillMaxWidth().testTag(SignInTags.CODE),
		// AuthInput `center`: text-lg, tracking-[0.3em], centred.
		textStyle = MaterialTheme.typography.titleMedium.copy(textAlign = TextAlign.Center, letterSpacing = 0.3.em),
		shape = FpShape.Input,
		colors = fpFieldColors(),
	)
	val verb = if (state.intent == AuthIntent.SIGNUP) "Create account" else "Sign in"
	FpPrimaryButton(onClick = { actions.onVerifyCode(code) }, enabled = idle, modifier = Modifier.fillMaxWidth()) {
		Text(state.label(SignInPending.VERIFY, verb, "Checking code…"))
	}
	TextButton(onClick = actions.onResendCode, enabled = idle && state.resendInSeconds == 0) {
		Text(
			when {
				state.pending == SignInPending.RESEND -> "Resending…"
				state.resendInSeconds > 0 -> "Resend code in ${state.resendInSeconds} s"
				else -> "Resend code"
			},
		)
	}
	TextButton(onClick = { actions.onStep(SignInStep.EMAIL) }, enabled = idle) { Text("Wrong email?") }
}

@Composable
internal fun PasswordStep(state: SignInUiState, email: String, onEmail: (String) -> Unit, actions: SignInActions) {
	var password by rememberSaveable { mutableStateOf("") }
	val idle = state.pending == null
	EmailField(email, idle, onEmail)
	OutlinedTextField(
		value = password,
		onValueChange = { password = it },
		label = { Text("Password") },
		enabled = idle,
		singleLine = true,
		visualTransformation = PasswordVisualTransformation(),
		keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
		keyboardActions = KeyboardActions(onDone = { actions.onPassword(email, password) }),
		modifier = Modifier.fillMaxWidth().testTag(SignInTags.PASSWORD),
		shape = FpShape.Input,
		colors = fpFieldColors(),
	)
	FpPrimaryButton(onClick = { actions.onPassword(email, password) }, enabled = idle, modifier = Modifier.fillMaxWidth()) {
		Text(state.label(SignInPending.PASSWORD, "Sign in", "Signing in…"))
	}
	TextButton(onClick = { actions.onStep(SignInStep.EMAIL) }, enabled = idle) { Text("Email me a code instead") }
}
