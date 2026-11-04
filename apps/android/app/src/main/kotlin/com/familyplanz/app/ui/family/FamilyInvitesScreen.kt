package com.familyplanz.app.ui.family

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.FpHeader
import com.familyplanz.app.ui.fpFilterChipBorder
import com.familyplanz.app.ui.fpFilterChipColors
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate

/** What the invitations page can ask of the app. */
class FamilyInvitesActions(
	val onSelectFamily: (String) -> Unit = {},
	val onBack: () -> Unit = {},
	val onCreate: () -> Unit = {},
	val onRevoke: (String) -> Unit = {},
	val onCopy: (link: String, code: String?) -> Unit = { _, _ -> },
	val onSetValidDays: (Int) -> Unit = {},
	val onSetMaxUses: (Int) -> Unit = {},
	val onAddMember: () -> Unit = {},
)

/**
 * The invitations page (2.9): family switcher, refusal line for a non-manager,
 * the codes with uses and expiry, the NEW CODE form and the revoke note.
 */
@Composable
fun FamilyInvitesScreen(
	state: FamilyInvitesState,
	actions: FamilyInvitesActions,
	modifier: Modifier = Modifier,
) {
	Column(modifier = modifier.fillMaxSize().background(Slate.S50)) {
		FpHeader("Family") {}
		Column(
			modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp),
			verticalArrangement = Arrangement.spacedBy(12.dp),
		) {
			FamilyBreadcrumb("Calendar", "Family", "Invitations")
			FamilyPageTitle("Family Invitations")
			FamilyTextLink("\u2039 Back to Family", actions.onBack)
			when (state) {
				FamilyInvitesState.Loading -> Text(
					"Loading invitations\u2026",
					style = MaterialTheme.typography.bodyMedium,
					color = FpTheme.colors.textMuted,
				)

				is FamilyInvitesState.Failed -> Text(
					state.reason,
					style = MaterialTheme.typography.bodyMedium,
					color = MaterialTheme.colorScheme.error,
				)

				is FamilyInvitesState.Ready -> InvitesBody(state, actions)
			}
		}
	}
}

@Composable
private fun InvitesBody(state: FamilyInvitesState.Ready, actions: FamilyInvitesActions) {
	FamilySwitcher(state, actions)
	if (!state.canManage) {
		FamilyBand("Invitations") {
			Text(
				"Only the family creator or an admin can manage invitations.",
				style = MaterialTheme.typography.bodyMedium,
				color = FpTheme.colors.textBody,
			)
		}
		return
	}
	CodesList(state, actions)
	NewCodeForm(state, actions)
	FamilyBand("Revoking a code") {
		Text(
			"Revoking kills the link for anyone who has not used it yet. Members who already joined keep their place.",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
		FamilyTextLink("Add a member", actions.onAddMember)
	}
	FamilyNoteLine(state.note)
	FamilyErrorLine(state.error)
}

/** AC-FI-4: the switcher lists the caller's families; the chosen one is marked. */
@Composable
private fun FamilySwitcher(state: FamilyInvitesState.Ready, actions: FamilyInvitesActions) {
	FamilyBand("Family") {
		Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
			state.families.forEach { family ->
				val selected = family.id == state.familyId
				FilterChip(
					selected = selected,
					onClick = { actions.onSelectFamily(family.id) },
					label = { Text(family.name) },
					colors = fpFilterChipColors(),
					border = fpFilterChipBorder(selected),
				)
			}
		}
	}
}

@Composable
private fun CodesList(state: FamilyInvitesState.Ready, actions: FamilyInvitesActions) {
	FamilyBand("Invitation codes") {
		if (state.codes.isEmpty()) {
			Text(
				"Create an invitation to invite new members to your family.",
				style = MaterialTheme.typography.bodyMedium,
				color = FpTheme.colors.textBody,
			)
			return@FamilyBand
		}
		state.codes.forEachIndexed { index, row ->
			Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
				Row(verticalAlignment = Alignment.CenterVertically) {
					Text(
						row.code,
						style = MaterialTheme.typography.bodyLarge,
						fontWeight = FontWeight.Bold,
						modifier = Modifier.weight(1f),
					)
					if (index == 0) FamilyRolePill("Active code")
				}
				Text(inviteUseLine(row), style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
				FamilyJoinLink(
					link = inviteLink(row.code),
					copied = state.copiedCode == row.code,
					onCopy = { actions.onCopy(inviteLink(row.code), row.code) },
					copyFailed = state.copyFailed,
				)
				FamilyTextLink("Revoke", { actions.onRevoke(row.code) })
			}
		}
	}
}

/** AC-FI-2: "Valid for" days and "Max uses" then Create. */
@Composable
private fun NewCodeForm(state: FamilyInvitesState.Ready, actions: FamilyInvitesActions) {
	FamilyBand("New code") {
		FamilyBandTitle("Valid for")
		Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
			VALID_DAYS.forEach { days ->
				val selected = state.validDays == days
				FilterChip(
					selected = selected,
					onClick = { actions.onSetValidDays(days) },
					label = { Text("$days days") },
					colors = fpFilterChipColors(),
					border = fpFilterChipBorder(selected),
				)
			}
		}
		FamilyBandTitle("Max uses")
		Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
			USE_STEPS.forEach { uses ->
				val selected = state.maxUses == uses
				FilterChip(
					selected = selected,
					onClick = { actions.onSetMaxUses(uses) },
					label = { Text("$uses") },
					colors = fpFilterChipColors(),
					border = fpFilterChipBorder(selected),
				)
			}
		}
		Text(
			"A use is spent when the link is opened, not when somebody joins.",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
		FamilySaveButton("Create code", actions.onCreate)
	}
}

/** The "Valid for" choices the web form offers. */
val VALID_DAYS = listOf(1, 7, 30)

/** The "Max uses" choices. */
val USE_STEPS = listOf(1, 5, 10)
