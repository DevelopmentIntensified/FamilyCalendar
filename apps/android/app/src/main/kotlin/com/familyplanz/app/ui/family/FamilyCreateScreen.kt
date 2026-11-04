@file:Suppress("MatchingDeclarationName")
package com.familyplanz.app.ui.family

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.ui.FpHeader
import com.familyplanz.app.ui.FpOutlineButton
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate

/** What the create form can ask of the app. */
@Suppress("MatchingDeclarationName")
class FamilyCreateActions(
	val onName: (String) -> Unit = {},
	val onPickColor: (String) -> Unit = {},
	val onToggleMember: (String) -> Unit = {},
	val onSubmit: () -> Unit = {},
	val onUpgrade: () -> Unit = {},
	val onBack: () -> Unit = {},
)

/**
 * Create a Family (2.10): h1, the name field ("The Smiths"), the colour
 * swatches, WHAT HAPPENS NEXT and the member picker. At the plan limit the
 * form is replaced by the limit notice with "Upgrade Now" (AC-FC-2).
 */
@Composable
fun FamilyCreateScreen(
	state: FamilyCreateState,
	actions: FamilyCreateActions,
	modifier: Modifier = Modifier,
) {
	Column(modifier = modifier.fillMaxSize().background(Slate.S50)) {
		FpHeader("Family") {}
		Column(
			modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp),
			verticalArrangement = Arrangement.spacedBy(12.dp),
		) {
			FamilyBreadcrumb("Calendar", "Family", "Create")
			FamilyPageTitle("Create a Family")
			FamilyTextLink("\u2039 Back to Family", actions.onBack)
			when (state) {
				FamilyCreateState.Loading -> Text(
					"Loading your plan\u2026",
					style = MaterialTheme.typography.bodyMedium,
					color = FpTheme.colors.textMuted,
				)

				is FamilyCreateState.Failed -> Text(
					state.reason,
					style = MaterialTheme.typography.bodyMedium,
					color = MaterialTheme.colorScheme.error,
				)

				is FamilyCreateState.Ready -> if (state.atLimit) LimitNotice(actions) else CreateForm(state, actions)
			}
		}
	}
}

/** AC-FC-2: the limit notice that stands in for the form. */
@Composable
private fun LimitNotice(actions: FamilyCreateActions) {
	FamilyBand("Family limit reached") {
		Text(
			"Your plan is full. Upgrade to create another family.",
			style = MaterialTheme.typography.bodyMedium,
			color = FpTheme.colors.textBody,
		)
		FamilySaveButton("Upgrade Now", actions.onUpgrade)
	}
}

@Composable
private fun CreateForm(state: FamilyCreateState.Ready, actions: FamilyCreateActions) {
	FamilyBand("The basics") {
		Text(
			"One family holds the shared calendar, the tasks and the groceries.",
			style = MaterialTheme.typography.bodyMedium,
			color = FpTheme.colors.textBody,
		)
		FamilyField("Family name", state.name, actions.onName, placeholder = "The Smiths")
		FamilyBandTitle("Family colour")
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
			FAMILY_COLOURS.forEach { hex ->
				Box(modifier = Modifier.clickable { actions.onPickColor(hex) }) {
					ColourSwatch(hex = hex, selected = state.color == hex, onPick = { actions.onPickColor(hex) })
				}
			}
		}
		Text(
			"Pick a colour your family will recognise on the calendar.",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
	}
	FamilyBand("Who is coming with you?") {
		if (state.candidates.isEmpty()) {
			Text(
				"You can invite people once the family exists.",
				style = MaterialTheme.typography.bodySmall,
				color = FpTheme.colors.textMuted,
			)
		}
		state.candidates.forEach { candidate ->
			val name = listOfNotNull(candidate.firstName, candidate.lastName).joinToString(" ").ifBlank { candidate.email.orEmpty() }
			FamilyMemberRow(
				name = name,
				memberType = candidate.memberType,
				role = candidate.role,
				onClick = { actions.onToggleMember(candidate.userId) },
				trailing = { FamilyRolePill(if (candidate.userId in state.picked) "Selected" else "Add") },
			)
		}
	}
	FamilyBand("What happens next") {
		Text(
			"Your family gets a shared calendar straight away. Invite the rest from the family page, " +
				"and everyone's tasks land on one board.",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
	}
	FamilyErrorLine(state.error)
	FamilySaveButton(if (state.submitting) "Creating\u2026" else "Create Family", actions.onSubmit)
}
