@file:Suppress("TooManyFunctions")
package com.familyplanz.app.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.familyplanz.app.data.AuthIntent
import com.familyplanz.app.data.SignupNames
import com.familyplanz.app.ui.FpPrimaryButton
import com.familyplanz.app.ui.fpFieldColors
import com.familyplanz.app.ui.theme.Brand
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate

/** ModeToggle.svelte: slate-100 track, rounded-xl, p-1; 44dp segments, the chosen one white slate-900. */
@Composable
internal fun AuthModeToggle(step: SignInStep, enabled: Boolean, onSelect: (SignInStep) -> Unit) {
	Row(
		modifier = Modifier
			.fillMaxWidth()
			.clip(MaterialTheme.shapes.medium)
			.background(Slate.S100)
			.padding(4.dp)
			.selectableGroup(),
	) {
		listOf(SignInStep.PASSWORD to "Password", SignInStep.EMAIL to "Email Link").forEach { (value, label) ->
			val on = value == step
			Surface(
				modifier = Modifier
					.weight(1f)
					.heightIn(min = 44.dp)
					.selectable(selected = on, enabled = enabled, role = Role.RadioButton) { onSelect(value) },
				shape = MaterialTheme.shapes.small,
				color = if (on) MaterialTheme.colorScheme.surface else Slate.S100,
				shadowElevation = if (on) 1.dp else 0.dp,
			) {
				Box(contentAlignment = Alignment.Center, modifier = Modifier.heightIn(min = 44.dp).padding(horizontal = 16.dp)) {
					Text(
						label,
						style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
						color = if (on) Slate.S900 else Slate.S500,
					)
				}
			}
		}
	}
}

/** AuthInput.svelte: 14sp medium slate-700 label above (optional right slot), white 10dp-radius field. */
@Composable
@Suppress("LongParameterList")
internal fun AuthInput(
	label: String,
	value: String,
	onChange: (String) -> Unit,
	tag: String,
	enabled: Boolean,
	modifier: Modifier = Modifier,
	keyboard: KeyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
	secret: Boolean = false,
	placeholder: String? = null,
	onDone: (() -> Unit)? = null,
	labelRight: @Composable () -> Unit = {},
) {
	Column(modifier = modifier) {
		Row(
			modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp),
			horizontalArrangement = Arrangement.SpaceBetween,
			verticalAlignment = Alignment.CenterVertically,
		) {
			Text(label, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium), color = Slate.S700)
			labelRight()
		}
		OutlinedTextField(
			value = value,
			onValueChange = onChange,
			enabled = enabled,
			singleLine = true,
			placeholder = placeholder?.let { { Text(it, color = FpTheme.colors.textMuted) } },
			visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
			keyboardOptions = keyboard,
			keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }),
			modifier = Modifier.fillMaxWidth().testTag(tag),
			shape = FpShape.Input,
			colors = fpFieldColors(),
		)
	}
}

@Composable
internal fun EmailInput(value: String, enabled: Boolean, onChange: (String) -> Unit) = AuthInput(
	label = "Email",
	value = value,
	onChange = onChange,
	tag = SignInTags.EMAIL,
	enabled = enabled,
	keyboard = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
)

@Composable
private fun NameRow(first: String, last: String, enabled: Boolean, onFirst: (String) -> Unit, onLast: (String) -> Unit) {
	val words = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Next)
	Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
		AuthInput("First Name", first, onFirst, SignInTags.FIRST_NAME, enabled, Modifier.weight(1f), words)
		AuthInput("Last Name", last, onLast, SignInTags.LAST_NAME, enabled, Modifier.weight(1f), words)
	}
}

/** The page's submit: `submitClasses` (48dp primary-600 pill, 16sp semibold; disabled slate-200/500). */
@Composable
internal fun AuthSubmit(text: String, enabled: Boolean, onClick: () -> Unit) {
	FpPrimaryButton(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().testTag(SignInTags.SUBMIT)) {
		Text(text, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold))
	}
}

/** /login password form; on /signup the names, "At least 8 characters" and Confirm Password join it. */
@Composable
internal fun PasswordForm(state: SignInUiState, email: String, onEmail: (String) -> Unit, actions: SignInActions) {
	val idle = state.pending == null
	val signup = state.intent == AuthIntent.SIGNUP
	var first by rememberSaveable { mutableStateOf("") }
	var last by rememberSaveable { mutableStateOf("") }
	var password by rememberSaveable { mutableStateOf("") }
	var confirm by rememberSaveable { mutableStateOf("") }
	val submit = {
		actions.onPassword(email, password, if (signup) PasswordSignup(SignupNames(first, last), confirm) else null)
	}
	Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
		if (signup) NameRow(first, last, idle, { first = it }, { last = it })
		EmailInput(email, idle, onEmail)
		Column {
			AuthInput(
				label = "Password",
				value = password,
				onChange = { password = it },
				tag = SignInTags.PASSWORD,
				enabled = idle,
				keyboard = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = if (signup) ImeAction.Next else ImeAction.Done),
				secret = true,
				onDone = if (signup) null else submit,
				labelRight = {
					if (!signup) {
						Text(
							"Forgot your password?",
							style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
							color = MaterialTheme.colorScheme.primary,
							modifier = Modifier.clickable(enabled = idle, role = Role.Button) { actions.onStep(SignInStep.FORGOT) },
						)
					}
				},
			)
			if (signup) {
				Text(
					"At least 8 characters",
					style = MaterialTheme.typography.bodySmall,
					color = Slate.S500,
					modifier = Modifier.padding(top = 4.dp),
				)
			}
		}
		if (signup) {
			AuthInput(
				label = "Confirm Password",
				value = confirm,
				onChange = { confirm = it },
				tag = SignInTags.CONFIRM_PASSWORD,
				enabled = idle,
				keyboard = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
				secret = true,
				onDone = submit,
			)
		}
		val (idleLabel, busy) = if (signup) "Create Account" to "Creating Account..." else "Login" to "Logging in..."
		AuthSubmit(state.label(SignInPending.PASSWORD, idleLabel, busy), idle, submit)
	}
}

/** The "Email Link" segment: Email (+ names on /signup) and "Send Login Link" / "Send Verification Link". */
@Composable
internal fun EmailLinkForm(state: SignInUiState, email: String, onEmail: (String) -> Unit, actions: SignInActions) {
	val idle = state.pending == null
	val signup = state.intent == AuthIntent.SIGNUP
	var first by rememberSaveable { mutableStateOf("") }
	var last by rememberSaveable { mutableStateOf("") }
	Column(verticalArrangement = Arrangement.spacedBy(if (signup) 20.dp else 16.dp)) {
		if (signup) NameRow(first, last, idle, { first = it }, { last = it })
		EmailInput(email, idle, onEmail)
		AuthSubmit(
			state.label(SignInPending.SEND_CODE, if (signup) "Send Verification Link" else "Send Login Link", "Sending..."),
			idle,
		) { actions.onRequestCode(email, if (signup) SignupNames(first, last) else null) }
	}
}

/** The emailSent section: blue mail tile, "Check Your Email", the address in bold. */
@Composable
internal fun CheckEmailHeader(lead: String, email: String, trail: String = "") {
	Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
		Box(
			modifier = Modifier.size(56.dp).clip(MaterialTheme.shapes.large).background(Brand.Blue.copy(alpha = 0.5f)),
			contentAlignment = Alignment.Center,
		) { Icon(Icons.Outlined.Email, contentDescription = null, tint = Slate.S700, modifier = Modifier.size(28.dp)) }
		Text(
			"Check Your Email",
			style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold),
			color = FpTheme.colors.textStrong,
			modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
		)
		Text(
			buildAnnotatedString {
				append(lead)
				withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = Slate.S900)) { append(email) }
				append(trail)
			},
			style = MaterialTheme.typography.bodyMedium,
			color = FpTheme.colors.textBody,
			textAlign = TextAlign.Center,
		)
	}
}

/**
 * "Check Your Email" + the 8-digit code (`AuthInput center`). Paste-friendly:
 * anything pasted is reduced to its digits ("1234 5678" works), and a full
 * code submits on its own.
 */
@Composable
internal fun CodeStep(state: SignInUiState, actions: SignInActions) {
	var code by rememberSaveable { mutableStateOf("") }
	val idle = state.pending == null
	val signup = state.intent == AuthIntent.SIGNUP
	CheckEmailHeader(if (signup) "We've sent a verification code to " else "We've sent a login code to ", state.email)
	if (!signup) {
		Text(
			"Login code",
			style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
			color = Slate.S700,
			modifier = Modifier.padding(top = 8.dp),
		)
	}
	OutlinedTextField(
		value = code,
		onValueChange = { typed ->
			val digits = typed.filter(Char::isDigit).take(SignInViewModel.CODE_LENGTH)
			val completed = digits.length == SignInViewModel.CODE_LENGTH && digits != code
			code = digits
			if (completed) actions.onVerifyCode(digits)
		},
		placeholder = { Text(if (signup) "Enter verification code" else "Enter login code", color = FpTheme.colors.textMuted) },
		enabled = idle,
		singleLine = true,
		keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
		keyboardActions = KeyboardActions(onDone = { actions.onVerifyCode(code) }),
		modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag(SignInTags.CODE),
		// AuthInput `center`: text-lg, tracking-[0.3em], centred.
		textStyle = MaterialTheme.typography.titleMedium.copy(textAlign = TextAlign.Center, letterSpacing = 0.3.em),
		shape = FpShape.Input,
		colors = fpFieldColors(),
	)
	val (idleLabel, busy) = if (signup) "Verify Code" to "Verifying..." else "Login" to "Logging in..."
	AuthSubmit(state.label(SignInPending.VERIFY, idleLabel, busy), idle) { actions.onVerifyCode(code) }
	Row(
		modifier = Modifier.fillMaxWidth(),
		horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
		verticalAlignment = Alignment.CenterVertically,
	) {
		TextButton(onClick = actions.onResendCode, enabled = idle) {
			Text("Didn't receive the code? Resend", style = MaterialTheme.typography.bodyMedium, color = Slate.S600)
		}
		if (state.sentAgain) SentAgainPill()
	}
	// Native: the web sends a link here, so it has no way back; the app offers one.
	TextButton(onClick = { actions.onStep(SignInStep.EMAIL) }, enabled = idle, modifier = Modifier.fillMaxWidth()) {
		Text("Use a different email", style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
	}
}

/** `rounded-full bg-[#C4E9DA]/60 px-2.5 py-1 text-xs font-medium text-slate-800`. */
@Composable
internal fun SentAgainPill() {
	Text(
		"Sent again ✓",
		style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
		color = Slate.S800,
		modifier = Modifier.clip(FpShape.Pill).background(Brand.Mint.copy(alpha = 0.6f)).padding(horizontal = 10.dp, vertical = 4.dp),
	)
}

/** /forgot-password: Email + "Send Reset Link", then "Check Your Email" naming the address. */
@Composable
internal fun ForgotForm(state: SignInUiState, email: String, onEmail: (String) -> Unit, onSend: (String) -> Unit) {
	if (state.resetSent) {
		CheckEmailHeader("If an account exists for ", state.email, ", we've sent a password reset link.")
		return
	}
	val idle = state.pending == null
	EmailInput(email, idle, onEmail)
	AuthSubmit(state.label(SignInPending.FORGOT, "Send Reset Link", "Sending..."), idle) { onSend(email) }
}
