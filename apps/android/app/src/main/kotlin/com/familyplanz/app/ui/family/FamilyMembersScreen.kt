@file:Suppress("MatchingDeclarationName")
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

/** What the add-member page can ask of the app. */
@Suppress("LongParameterList", "MatchingDeclarationName")
class FamilyMembersActions(
	val onSelectTab: (MemberTab) -> Unit = {},
	val onSearch: (String) -> Unit = {},
	val onAddExisting: (String) -> Unit = {},
	val onEmail: (String) -> Unit = {},
	val onFirstName: (String) -> Unit = {},
	val onLastName: (String) -> Unit = {},
	val onSendEmail: (Boolean) -> Unit = {},
	val onCopyLink: (String) -> Unit = {},
	val onChildFirst: (String) -> Unit = {},
	val onChildLast: (String) -> Unit = {},
	val onChildEmail: (String) -> Unit = {},
	val onConsent: (Boolean) -> Unit = {},
	val onAddChild: () -> Unit = {},
	val onReturn: () -> Unit = {},
	val onBack: () -> Unit = {},
)

/**
 * Add a member (2.10): the Find / Invite by email / Create a child tabs and
 * their success lines "Member Added!" and "Invite sent" (AC-FC-3..5).
 */
@Composable
fun FamilyMembersScreen(
	state: FamilyMembersState,
	actions: FamilyMembersActions,
	familyName: String = "",
	modifier: Modifier = Modifier,
) {
	Column(modifier = modifier.fillMaxSize().background(Slate.S50)) {
		FpHeader("Family") {}
		Column(
			modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp),
			verticalArrangement = Arrangement.spacedBy(12.dp),
		) {
			FamilyBreadcrumb("Calendar", "Family", familyName.ifBlank { "Members" }, "Add")
			FamilyPageTitle("Add a member")
			FamilyTextLink("\u2039 Back to Family", actions.onBack)
			TabRow(state, actions)
			when {
				state.addedName != null -> AddedBand(state.addedName, actions)
				state.inviteSent -> SentBand(actions)
				else -> when (state.tab) {
					MemberTab.FIND -> FindTab(state, actions)
					MemberTab.EMAIL -> EmailTab(state, actions)
					MemberTab.CHILD -> ChildTab(state, actions)
				}
			}
			FamilyErrorLine(state.error)
		}
	}
}

@Composable
private fun TabRow(state: FamilyMembersState, actions: FamilyMembersActions) {
	Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
		MemberTab.entries.forEach { tab ->
			val selected = state.tab == tab
			FilterChip(
				selected = selected,
				onClick = { actions.onSelectTab(tab) },
				label = { Text(tab.label) },
				colors = fpFilterChipColors(),
				border = fpFilterChipBorder(selected),
			)
		}
	}
}

/** AC-FC-3: "Member Added!" with "Return to Family". */
@Composable
private fun AddedBand(name: String, actions: FamilyMembersActions) {
	FamilyBand("Member added") {
		Text("Member Added!", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
		Text(name, style = MaterialTheme.typography.bodyMedium, color = FpTheme.colors.textBody)
		FamilyTextLink("Return to Family", actions.onReturn)
	}
}

/** AC-FC-4: "Invite sent". */
@Composable
private fun SentBand(actions: FamilyMembersActions) {
	FamilyBand("Invite sent") {
		Text("Invite sent", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
		Text(
			"They get an email with a link to join this family.",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
		FamilyTextLink("Return to Family", actions.onReturn)
	}
}

@Composable
private fun FindTab(state: FamilyMembersState, actions: FamilyMembersActions) {
	FamilyBand("Find someone") {
		FamilyField("Name or email", state.query, actions.onSearch)
		Text(
			"Type at least ${FamilyMembersViewModel.MIN_SEARCH} characters.",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
		if (state.searching) {
			Text("Searching\u2026", style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
		}
		state.hits.forEach { hit ->
			val name = listOfNotNull(hit.firstName, hit.lastName).joinToString(" ").ifBlank { hit.email.orEmpty() }
			FamilyMemberRow(
				name = name,
				memberType = hit.email,
				role = null,
				trailing = { FamilyActionChip("Add", { actions.onAddExisting(hit.id) }) },
			)
		}
	}
}

@Composable
private fun EmailTab(state: FamilyMembersState, actions: FamilyMembersActions) {
	FamilyBand("Invite by email") {
		FamilyField("First name", state.firstName, actions.onFirstName)
		FamilyField("Last name", state.lastName, actions.onLastName)
		FamilyField("Email", state.email, actions.onEmail)
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
			FamilyActionChip("Send invite", { actions.onSendEmail(false) })
			FamilyActionChip("Send link instead", { actions.onSendEmail(true) })
		}
		state.emailLink?.let { link ->
			FamilyJoinLink(link = link, copied = state.linkCopied, onCopy = { actions.onCopyLink(link) }, copyFailed = state.copyFailed)
		}
	}
}

@Composable
private fun ChildTab(state: FamilyMembersState, actions: FamilyMembersActions) {
	FamilyBand("Create a child") {
		FamilyField("First name", state.childFirst, actions.onChildFirst)
		FamilyField("Last name", state.childLast, actions.onChildLast)
		FamilyField("email for the child's account", state.childEmail, actions.onChildEmail)
		Text(
			"Each child needs their own email address for their account.",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
		FamilySwitchRow(
			label = "I am the parent or guardian of this child",
			checked = state.consent,
			onCheckedChange = actions.onConsent,
		)
		FamilySaveButton("Create child", actions.onAddChild)
	}
}
