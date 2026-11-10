package com.familyplanz.app.ui.account

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.FpPrimaryButton
import com.familyplanz.app.ui.theme.FpTheme

/* The plan, security, token, danger-zone and bug cards (2.12). */

/** AC-AC-1's "Plan & usage": the tier, the limits table and the upsell. */
@Composable
fun PlanSection(state: AccountState, actions: AccountActions) {
	val subscription = state.subscription
	val limits = subscription?.planLimits
	val usage = subscription?.aiUsage
	AccountCard("Plan & usage") {
		Text(
			subscription?.subscription?.tier?.displayName ?: subscription?.subscription?.tier?.name ?: "Free plan",
			style = MaterialTheme.typography.titleMedium,
			fontWeight = FontWeight.Bold,
			color = FpTheme.colors.textStrong,
		)
		if (limits != null) {
			AccountLimitRow("Families", "${limits.familyLimit}")
			AccountLimitRow("Members per family", "${limits.memberLimit}")
			AccountLimitRow("AI event creations a month", "${limits.aiEventCreationsPerMonth}")
			AccountLimitRow("Archive kept", "${limits.archivedRetentionDays} days")
			AccountLimitRow("Export and import", if (limits.exportImportEnabled) "On" else "Off")
		}
		if (usage != null) {
			AccountLimitRow("AI used this month", "${usage.used} of ${usage.limit} (${usage.remaining} left)")
		}
		SectionLabel("FAMILY MASTER")
		Text(
			"Family Master lifts the member and family limits for a household that keeps growing.",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
		AccountSaveButton("See Plans & Pricing", actions.onOpenPlans)
		AccountInlineLink("Join Waitlist", actions.onJoinWaitlist)
	}
}

/** AC-AC-10: the copy and the one button. */
@Composable
fun SecuritySection(actions: AccountActions) {
	AccountCard("Security") {
		Text(LOGOUT_ALL_COPY, style = MaterialTheme.typography.bodyMedium, color = FpTheme.colors.textBody)
		AccountSaveButton("Log out all devices", actions.onRevokeSessions)
	}
}

/** AC-AC-11: name it, mint it, see it once, revoke it. */
@Composable
fun TokensSection(state: AccountState, actions: AccountActions) {
	AccountCard("API Tokens") {
		Text(
			"Tokens let a desktop app or a script read your tasks. Treat them like a password.",
			style = MaterialTheme.typography.bodyMedium,
			color = FpTheme.colors.textBody,
		)
		state.createdToken?.let { token ->
			Text("Copy it now - it is shown once:", style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
			Text(token, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = FpTheme.colors.textStrong)
			AccountInlineLink("Done", actions.onDismissToken)
		}
		AccountTextField(TOKEN_NAME_PLACEHOLDER, state.tokenName, actions.onTokenName)
		AccountSaveButton("Create token", actions.onCreateToken)
		state.tokens.forEach { token ->
			Row(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
				Text(
					token.name.ifBlank { "Unnamed token" },
					style = MaterialTheme.typography.bodyMedium,
					modifier = Modifier.weight(1f),
				)
				token.createdAt?.let {
					Text(
						it.substringBefore('T'),
						style = MaterialTheme.typography.bodySmall,
						color = FpTheme.colors.textMuted,
						modifier = Modifier.padding(end = 8.dp),
					)
				}
				AccountInlineLink("Revoke", { actions.onRevokeToken(token.id) })
			}
		}
	}
}

/** #189 then AC-AC-12: "Export your data" first (every plan), then the delete gate. */
@Composable
fun DangerZoneSection(state: AccountState, actions: AccountActions) {
	ExportCard(state, actions)
	AccountCard("Danger Zone") {
		Text(
			"Deleting the account removes your tasks, events and families. This cannot be undone.",
			style = MaterialTheme.typography.bodyMedium,
			color = MaterialTheme.colorScheme.error,
		)
		AccountTextField(DELETE_CONFIRM_LABEL, state.deleteConfirm, actions.onDeleteConfirm)
		Text(
			state.me?.id.orEmpty(),
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
		AccountSaveButton(if (state.deleting) "Deleting\u2026" else "Delete Account", actions.onDelete)
	}
}

/** `AccountDangerSection.svelte:42-54`, copy verbatim; the button is busy while an export runs. */
@Composable
private fun ExportCard(state: AccountState, actions: AccountActions) {
	AccountCard(EXPORT_TITLE) {
		Text(EXPORT_COPY, style = MaterialTheme.typography.bodyMedium, color = FpTheme.colors.textBody)
		FpPrimaryButton(
			onClick = actions.onExport,
			enabled = !state.exporting,
			modifier = Modifier.fillMaxWidth().testTag("account-export"),
		) {
			Text(if (state.exporting) EXPORT_BUSY else EXPORT_ACTION, fontWeight = FontWeight.SemiBold)
		}
	}
}

const val EXPORT_TITLE = "Export your data \uD83D\uDC6A"
const val EXPORT_COPY = "Download a copy of everything your account stores: profile, settings, families, calendars and " +
	"events, tasks, bills and receipt lines, grocery lists and notifications. The download is JSON."
const val EXPORT_ACTION = "Export your data"
const val EXPORT_BUSY = "Preparing\u2026"

/** AC-SP-3's neighbour: the Bug row opens the native report form. */
@Composable
fun ReportBugSection(actions: AccountActions) {
	AccountCard("Report a Bug") {
		Text(
			"Tell us what went wrong. The page you were on comes along automatically.",
			style = MaterialTheme.typography.bodyMedium,
			color = FpTheme.colors.textBody,
		)
		AccountSaveButton("Open the bug form", actions.onReportBug)
	}
}
