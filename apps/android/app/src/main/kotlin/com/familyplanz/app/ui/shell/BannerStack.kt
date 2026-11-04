package com.familyplanz.app.ui.shell

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.familyplanz.app.ui.BANNER_DISMISS_LABEL
import com.familyplanz.app.ui.FpBanner
import com.familyplanz.app.ui.theme.Accent
import com.familyplanz.app.ui.theme.FpMotion
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate
import com.familyplanz.app.ui.theme.rememberReducedMotion
import kotlinx.coroutines.delay

const val OFFLINE_BANNER_TAG = "offline-banner"
const val GUEST_BANNER_TAG = "guest-banner"
const val VERIFY_BANNER_TAG = "verify-banner"
const val BANNER_STACK_TAG = "banner-stack"

/**
 * OfflineBanner.svelte (stacked): `border-b border-amber-300 bg-amber-100
 * px-4 py-2 text-sm text-amber-900`, left-aligned: the offline sentence, then
 * "N changes waiting to sync." or, for 4 s after a flush, "Synced N changes.".
 */
@Composable
fun FpOfflineBanner(network: NetworkStatus, pending: PendingWrites) {
	val online by network.online.collectAsStateWithLifecycle()
	val count by pending.count.collectAsStateWithLifecycle()
	var state by remember { mutableStateOf(OfflineBannerState(online = online, pending = count)) }
	LaunchedEffect(online) { state = state.onOnline(online) }
	LaunchedEffect(count) { state = state.onPending(count) }
	LaunchedEffect(state.synced) {
		if (state.synced != null) {
			delay(FpMotion.SYNCED_MS)
			state = state.syncedShown()
		}
	}
	if (!state.visible) return
	val tone = FpTheme.colors.offline
	Column(modifier = Modifier.fillMaxWidth().background(tone.surface).testTag(OFFLINE_BANNER_TAG)) {
		Column(
			modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
			verticalArrangement = Arrangement.spacedBy(4.dp),
		) {
			if (!state.online) Text(OFFLINE_TEXT, style = MaterialTheme.typography.bodyMedium, color = tone.content)
			val line = when {
				state.pending > 0 -> pendingText(state.pending)
				state.synced != null -> syncedText(state.synced ?: 0)
				else -> null
			}
			line?.let { Text(it, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = tone.content) }
		}
		HorizontalDivider(color = tone.border)
	}
}

/** The account notice under the offline banner: verify form or guest notice (fades 150 ms). */
@Composable
fun FpAccountBanner(
	banner: AccountBanner?,
	verify: VerifyForm,
	actions: VerifyActions,
	onClaim: () -> Unit,
) {
	val reduced = rememberReducedMotion()
	AnimatedVisibility(
		visible = banner != null,
		enter = fadeIn(FpMotion.spec(FpMotion.BANNER_MS, reduced)),
		exit = fadeOut(FpMotion.spec(FpMotion.BANNER_MS, reduced)),
	) {
		when (banner) {
			is AccountBanner.Guest -> GuestBanner(banner, onClaim)
			AccountBanner.Verify -> VerifyBanner(verify, actions)
			null -> Unit
		}
	}
}

/** What the verify form can do (backed by [ShellChromeViewModel]). */
data class VerifyActions(
	val onCode: (String) -> Unit,
	val onSubmit: () -> Unit,
	val onResend: () -> Unit,
	val onDismiss: () -> Unit,
	val onResentShown: () -> Unit,
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GuestBanner(banner: AccountBanner.Guest, onClaim: () -> Unit) {
	val colors = FpTheme.colors
	val tone = if (banner.urgent) colors.errorBanner else colors.warnBanner
	FpBanner(tone, modifier = Modifier.testTag(GUEST_BANNER_TAG)) {
		FlowRow(
			horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterHorizontally),
			modifier = Modifier.fillMaxWidth(),
		) {
			if (banner.urgent) {
				Text(GuestCopy.URGENT, textAlign = TextAlign.Center)
				Text(GuestCopy.daysLeft(banner.daysLeft), fontWeight = FontWeight.Bold)
				BannerLink(GuestCopy.URGENT_LINK, onClaim)
			} else {
				Text(GuestCopy.NORMAL, textAlign = TextAlign.Center)
				BannerLink(GuestCopy.NORMAL_LINK, onClaim)
				Text(GuestCopy.NORMAL_HINT, color = colors.warnHint)
			}
		}
	}
}

/** `font-semibold underline` link inside a banner. */
@Composable
private fun BannerLink(text: String, onClick: () -> Unit) {
	Text(
		text,
		fontWeight = FontWeight.SemiBold,
		textDecoration = TextDecoration.Underline,
		modifier = Modifier.clickable(role = Role.Button, onClick = onClick),
	)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun VerifyBanner(form: VerifyForm, actions: VerifyActions) {
	val colors = FpTheme.colors
	LaunchedEffect(form.resent) {
		if (form.resent) {
			delay(FpMotion.SENT_AGAIN_MS)
			actions.onResentShown()
		}
	}
	FpBanner(colors.warnBanner, modifier = Modifier.testTag(VERIFY_BANNER_TAG)) {
		Text(VerifyCopy.PROMPT, textAlign = TextAlign.Center)
		FlowRow(
			horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
			verticalArrangement = Arrangement.spacedBy(8.dp),
			itemVerticalAlignment = Alignment.CenterVertically,
			modifier = Modifier.fillMaxWidth(),
		) {
			CodeField(form.code, actions)
			VerifyButton(form, actions.onSubmit)
			Text(
				VerifyCopy.RESEND,
				textDecoration = TextDecoration.Underline,
				modifier = Modifier
					.heightIn(min = 44.dp)
					.clip(MaterialTheme.shapes.extraSmall)
					.clickable(enabled = !form.busy, role = Role.Button, onClick = actions.onResend)
					.padding(horizontal = 4.dp, vertical = 12.dp),
			)
			Text(
				"✕",
				fontWeight = FontWeight.SemiBold,
				modifier = Modifier
					.heightIn(min = 44.dp)
					.clickable(role = Role.Button, onClick = actions.onDismiss)
					.semantics { contentDescription = BANNER_DISMISS_LABEL }
					.padding(horizontal = 8.dp, vertical = 12.dp),
			)
		}
		if (form.resent) {
			Text(
				VerifyCopy.SENT_AGAIN,
				style = MaterialTheme.typography.bodySmall,
				fontWeight = FontWeight.Medium,
				color = Slate.S800,
				modifier = Modifier.clip(FpShape.Pill).background(colors.mintPill).padding(horizontal = 10.dp, vertical = 4.dp),
			)
		}
		form.error?.let {
			Text(
				it,
				style = MaterialTheme.typography.bodySmall,
				fontWeight = FontWeight.Medium,
				color = colors.errorText,
				textAlign = TextAlign.Center,
				modifier = Modifier.testTag("verify-error"),
			)
		}
	}
}

/** `rounded-lg border-amber-300 bg-white px-3 py-1.5 text-center text-sm tracking-[0.2em]`, `max-w-40`. */
@Composable
private fun CodeField(code: String, actions: VerifyActions) {
	BasicTextField(
		value = code,
		onValueChange = actions.onCode,
		singleLine = true,
		textStyle = MaterialTheme.typography.bodyMedium.copy(color = Slate.S900, textAlign = TextAlign.Center, letterSpacing = 0.2.em),
		cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
		keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
		keyboardActions = KeyboardActions(onDone = { actions.onSubmit() }),
		modifier = Modifier
			.widthIn(min = 128.dp, max = 160.dp)
			.heightIn(min = 36.dp)
			.clip(MaterialTheme.shapes.small)
			.background(MaterialTheme.colorScheme.surface)
			.border(1.dp, Accent.Amber300, MaterialTheme.shapes.small)
			.semantics { contentDescription = VerifyCopy.FIELD }
			.testTag("verify-code"),
		decorationBox = { inner ->
			Box(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), contentAlignment = Alignment.Center) {
				if (code.isEmpty()) {
					Text(VerifyCopy.FIELD, style = MaterialTheme.typography.bodyMedium, color = Slate.S400, textAlign = TextAlign.Center)
				}
				inner()
			}
		},
	)
}

/** `min-h-[44px] rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white`; disabled slate-200/500. */
@Composable
private fun VerifyButton(form: VerifyForm, onSubmit: () -> Unit) {
	val enabled = !form.busy && form.code.isNotBlank()
	Text(
		if (form.busy) VerifyCopy.VERIFYING else VerifyCopy.VERIFY,
		style = MaterialTheme.typography.bodyMedium,
		fontWeight = FontWeight.SemiBold,
		color = if (enabled) MaterialTheme.colorScheme.onPrimary else Slate.S500,
		modifier = Modifier
			.heightIn(min = 44.dp)
			.clip(MaterialTheme.shapes.small)
			.background(if (enabled) MaterialTheme.colorScheme.primary else Slate.S200)
			.clickable(enabled = enabled, role = Role.Button, onClick = onSubmit)
			.padding(horizontal = 12.dp, vertical = 12.dp),
	)
}
