package com.familyplanz.app.ui.family

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.RosterRowDto
import com.familyplanz.app.ui.FpHeader
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate

/** Everything the family detail page can ask of the app. */
@Suppress("LongParameterList")
class FamilyDetailActions(
	val onAddMember: () -> Unit = {},
	val onOpenTasks: () -> Unit = {},
	val onOpenGroceries: () -> Unit = {},
	val onOpenCalendar: () -> Unit = {},
	val onOpenInvitations: () -> Unit = {},
	val onSetType: (RosterRowDto, String) -> Unit = { _, _ -> },
	val onSetRole: (RosterRowDto, String) -> Unit = { _, _ -> },
	val onAskRemove: (RosterRowDto) -> Unit = {},
	val onConfirmRemove: () -> Unit = {},
	val onCancelRemove: () -> Unit = {},
	val onOpenSheet: (RosterRowDto) -> Unit = {},
	val onCloseSheet: () -> Unit = {},
	val onEditName: (String) -> Unit = {},
	val onPickColor: (String) -> Unit = {},
	val onSaveSettings: () -> Unit = {},
	val onToggleModule: (String, Boolean) -> Unit = { _, _ -> },
	val onMint: () -> Unit = {},
	val onCopy: (link: String, code: String?) -> Unit = { _, _ -> },
)

/**
 * One family's page (2.8) as a single column: hero, Members, Recent Activity,
 * then for a manager the settings and invitations bands, then the rail.
 */
@Composable
fun FamilyDetailScreen(
	state: FamilyDetailState,
	actions: FamilyDetailActions,
	menu: @Composable () -> Unit = {},
	modifier: Modifier = Modifier,
) {
	Column(modifier = modifier.fillMaxSize().background(Slate.S50)) {
		FpHeader("Family") { menu() }
		when (state) {
			FamilyDetailState.Loading -> LoadingLine()
			is FamilyDetailState.Failed -> Text(
				state.reason,
				style = MaterialTheme.typography.bodyMedium,
				color = MaterialTheme.colorScheme.error,
				modifier = Modifier.padding(16.dp),
			)

			is FamilyDetailState.Ready -> Box(modifier = Modifier.fillMaxSize()) {
				Column(
					modifier = Modifier
						.fillMaxWidth()
						.verticalScroll(rememberScrollState())
						.padding(12.dp),
					verticalArrangement = Arrangement.spacedBy(12.dp),
				) {
					FamilyDetailBody(state, actions)
					FamilyNoteLine(state.note)
					FamilyErrorLine(state.error)
				}
				state.sheetMember?.let { member ->
					MemberActionsSheet(
						member = member,
						currentUserRole = state.detail.currentUserRole,
						currentUserId = state.detail.currentUserId,
						onSetType = actions.onSetType,
						onSetRole = actions.onSetRole,
						onRemove = actions.onAskRemove,
						onClose = actions.onCloseSheet,
					)
				}
				state.removeTarget?.let { target ->
					RemoveMemberConfirm(target, actions.onConfirmRemove, actions.onCancelRemove)
				}
			}
		}
	}
}

@Composable
private fun LoadingLine() {
	Text(
		"Loading this family\u2026",
		style = MaterialTheme.typography.bodyMedium,
		color = FpTheme.colors.textMuted,
		modifier = Modifier.padding(16.dp),
	)
}
