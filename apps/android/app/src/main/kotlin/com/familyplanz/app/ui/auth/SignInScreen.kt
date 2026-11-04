package com.familyplanz.app.ui.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.familyplanz.app.R
import com.familyplanz.app.data.AuthIntent
import com.familyplanz.app.data.SignupNames
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.FpOutlineButton
import com.familyplanz.app.ui.fpFieldColors
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate

/** Sign-in screen callbacks (#288); each maps 1:1 onto [SignInViewModel]. */
data class SignInActions(
	/** Names are null on login; on signup they are what the user typed. On the forgot face: "Send Reset Link". */
	val onRequestCode: (email: String, names: SignupNames?) -> Unit,
	val onVerifyCode: (code: String) -> Unit,
	val onResendCode: () -> Unit,
	/** "Login"; on /signup "Create Account", with the names and confirmation in [PasswordSignup]. */
	val onPassword: (email: String, password: String, signup: PasswordSignup?) -> Unit,
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
	const val CONFIRM_PASSWORD = "signin-confirm-password"
	const val TOKEN = "signin-token"
	const val FIRST_NAME = "signin-first-name"
	const val LAST_NAME = "signin-last-name"
	const val SUBMIT = "signin-submit"
}

/**
 * The website's /login, /signup and /forgot-password at phone width
 * (#292 §2.13): slate-50 page `px-4 pt-10 pb-16`, the 20dp Mark + "Family
 * Planz" wordmark, one AuthCard. "Email Link" sends an 8-digit code on
 * Android (the web labels stay). [note] is why the session ended (a 401
 * elsewhere), shown above the form. The native "Advanced → paste token"
 * fallback (#288, §0.5) stays under the card.
 */
@Composable
fun SignInScreen(state: SignInUiState, note: String?, actions: SignInActions) {
	Column(
		modifier = Modifier
			.fillMaxSize()
			.background(MaterialTheme.colorScheme.background)
			.verticalScroll(rememberScrollState())
			.navigationBarsPadding()
			.imePadding()
			.padding(start = 16.dp, end = 16.dp, top = 40.dp, bottom = 64.dp),
		horizontalAlignment = Alignment.CenterHorizontally,
	) {
		AuthWordmark(modifier = Modifier.padding(bottom = 32.dp))
		FpCard(modifier = Modifier.widthIn(max = 448.dp).fillMaxWidth(), padding = PaddingValues(32.dp)) {
			// One address across every face of the card.
			var email by rememberSaveable { mutableStateOf(state.email) }
			AuthHeader(state, actions)
			Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
				note?.let { AuthAlert(it) }
				state.error?.let { AuthAlert(it) }
				when (state.step) {
					SignInStep.PASSWORD, SignInStep.EMAIL -> {
						AuthModeToggle(state.step, enabled = state.pending == null, onSelect = actions.onStep)
						if (state.step == SignInStep.PASSWORD) {
							PasswordForm(state, email, { email = it }, actions)
						} else {
							EmailLinkForm(state, email, { email = it }, actions)
						}
					}
					SignInStep.CODE -> CodeStep(state, actions)
					SignInStep.FORGOT -> ForgotForm(state, email, { email = it }) { actions.onRequestCode(it, null) }
				}
			}
			if (state.step != SignInStep.FORGOT) GuestFooter(state, actions.onGuest)
		}
		AdvancedTokenEntry(actions.onSaveToken)
	}
}

/** `login/+page.svelte` brand link: Mark 20dp primary-600 + "Family Planz" 18/700 tight slate-800. */
@Composable
internal fun AuthWordmark(modifier: Modifier = Modifier) {
	Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
		Icon(
			painterResource(R.drawable.ic_fp_calendar),
			contentDescription = null,
			tint = MaterialTheme.colorScheme.primary,
			modifier = Modifier.size(20.dp),
		)
		Text(
			"Family Planz",
			style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.025).em),
			color = Slate.S800,
		)
	}
}

@Composable
private fun AuthHeader(state: SignInUiState, actions: SignInActions) {
	val signup = state.intent == AuthIntent.SIGNUP
	val header = when {
		state.step == SignInStep.FORGOT ->
			HeaderCopy("Reset Password", "Remember your password? ", "Log in", "")
		signup -> HeaderCopy("Create Account", "Already have an account? ", "Sign in", "")
		else -> HeaderCopy("Welcome Back", "Don't have an account? ", "Sign up", " or start planning with no account needed.")
	}
	val onLink = {
		if (state.step == SignInStep.FORGOT) {
			actions.onStep(SignInStep.PASSWORD)
		} else {
			actions.onIntent(if (signup) AuthIntent.LOGIN else AuthIntent.SIGNUP)
		}
	}
	AuthTitle(header.title, header.lead, header.link, header.tail, onLink)
}

/** h1 30/36/700 tight slate-900, then the 14sp slate-600 subline with its primary-600 link. */
@Composable
internal fun AuthTitle(title: String, lead: String, link: String, tail: String, onLink: () -> Unit) {
	Column(modifier = Modifier.fillMaxWidth().padding(bottom = 32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
		Text(title, style = MaterialTheme.typography.headlineMedium, color = FpTheme.colors.textStrong, textAlign = TextAlign.Center)
		val linkStyle = TextLinkStyles(SpanStyle(color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium))
		Text(
			buildAnnotatedString {
				append(lead)
				withLink(LinkAnnotation.Clickable(link, linkStyle) { onLink() }) { append(link) }
				append(tail)
			},
			style = MaterialTheme.typography.bodyMedium,
			color = FpTheme.colors.textBody,
			textAlign = TextAlign.Center,
			modifier = Modifier.padding(top = 8.dp),
		)
	}
}

/** The page's `role="alert"`: red-50, red-200 border, rounded-xl, red-700 14sp, alert icon. */
@Composable
internal fun AuthAlert(text: String) {
	Surface(
		modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
		shape = MaterialTheme.shapes.medium,
		color = Accent.Red50,
		border = BorderStroke(1.dp, Accent.Red200),
	) {
		Row(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
			Icon(Icons.Outlined.Info, contentDescription = null, tint = Accent.Red700, modifier = Modifier.padding(top = 2.dp).size(16.dp))
			Text(text, color = Accent.Red700, style = MaterialTheme.typography.bodyMedium)
		}
	}
}

/** Kept for callers of the #288 name. */
@Composable
internal fun ErrorLine(text: String) = AuthAlert(text)

/** Busy label for the button whose call is in flight, its idle label otherwise. */
internal fun SignInUiState.label(button: SignInPending, idle: String, busy: String): String =
	if (pending == button) busy else idle

/** `login/+page.svelte` footer: slate-100 rule, the guest pill and its caption. */
@Composable
private fun GuestFooter(state: SignInUiState, onGuest: () -> Unit) {
	Column(modifier = Modifier.padding(top = 24.dp)) {
		HorizontalDivider(color = FpTheme.colors.rowBorder)
		FpOutlineButton(
			onClick = onGuest,
			enabled = state.pending == null,
			modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
		) { Text(state.label(SignInPending.GUEST, GUEST_LABEL, "Starting…"), style = MaterialTheme.typography.bodyMedium) }
		Text(
			"Creates a private calendar on this device. Add an email later to sync.",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
			textAlign = TextAlign.Center,
			modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
		)
	}
}

const val GUEST_LABEL = "Start planning — no account needed"

/** Developer fallback: the pre-#288 paste-a-token entry, collapsed by default (native-only, §0.5). */
@Composable
private fun AdvancedTokenEntry(onSave: (String) -> Unit) {
	var open by rememberSaveable { mutableStateOf(false) }
	var token by rememberSaveable { mutableStateOf("") }
	Column(modifier = Modifier.widthIn(max = 448.dp).fillMaxWidth().padding(top = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
		TextButton(
			onClick = { open = !open },
			colors = ButtonDefaults.textButtonColors(contentColor = FpTheme.colors.textMuted),
		) { Text(if (open) "Hide advanced" else "Advanced") }
		if (!open) return@Column
		Text(
			"Paste a personal API token minted in the web app (Settings > API tokens).",
			style = MaterialTheme.typography.bodySmall,
			color = MaterialTheme.colorScheme.onSurfaceVariant,
		)
		OutlinedTextField(
			value = token,
			onValueChange = { token = it },
			label = { Text("API token (fp_...)") },
			modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag(SignInTags.TOKEN),
			singleLine = true,
			visualTransformation = PasswordVisualTransformation(),
			keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
			shape = FpShape.Input,
			colors = fpFieldColors(),
		)
		FpOutlineButton(
			onClick = { if (token.isNotBlank()) onSave(token) },
			modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
		) { Text("Save and sync") }
	}
}


private data class HeaderCopy(val title: String, val lead: String, val link: String, val tail: String)
