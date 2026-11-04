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
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.FamilyDetailDto
import com.familyplanz.app.data.RosterRowDto
import com.familyplanz.app.ui.fpFilterChipBorder
import com.familyplanz.app.ui.fpFilterChipColors
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate

/**
 * Family Settings (admin only, 2.8): the name, the colour swatches and the
 * Day Dashboard module master switches (AC-FD-7, AC-FD-8). Every control
 * routes through [FamilyDetailActions], so the band holds no state itself.
 */
@Composable
fun FamilySettingsBand(state: FamilyDetailState.Ready, actions: FamilyDetailActions) {
	FamilyBand("Family Settings") {
		FamilyField("Family name", state.name, actions.onEditName)
		FamilyBandTitle("Family colour")
		Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
			FAMILY_COLOURS.forEach { hex ->
				Box(modifier = Modifier.clickable { actions.onPickColor(hex) }) {
					ColourSwatch(hex = hex, selected = state.color.equals(hex, ignoreCase = true), onPick = { actions.onPickColor(hex) })
				}
			}
		}
		Text(
			"Set colour ${state.detail.family?.name.orEmpty()}",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
		Text(
			"Colours help this family stand out on the calendar. Members see ${state.color.ifBlank { "the current" }}.",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
		FamilySaveButton("Save family settings", actions.onSaveSettings)

		FamilyBandTitle("Day Dashboard modules")
		Text(
			"Switch a module off and it disappears from every member's Day Dashboard.",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
		DASHBOARD_MODULES.forEach { (module, label) ->
			// The server's map is authoritative; absent means the module is on.
			val enabled = state.detail.moduleSwitches[module] ?: true
			FamilySwitchRow(
				label = label,
				checked = enabled,
				onCheckedChange = { actions.onToggleModule(module, it) },
			)
		}
		FamilyNoteLine(state.note)
		FamilyErrorLine(state.error)
	}
}

/** The Invitations band (admin): the count of live codes and the manage jump. */
@Composable
fun InvitationsBand(detail: FamilyDetailDto, actions: FamilyDetailActions) {
	FamilyBand("Invitations") {
		val live = detail.activeInvite
		Text(
			if (live == null) {
				"Create an invitation to invite new members to your family."
			} else {
				"Code ${live.code} \u00B7 ${live.useCount}/${live.maxUses ?: '\u221E'} uses"
			},
			style = MaterialTheme.typography.bodyMedium,
			color = FpTheme.colors.textBody,
		)
		FamilyTextLink("Manage invitations \u203A", actions.onOpenInvitations)
	}
}

/**
 * AC-FD-6: the member actions sheet. Tapping the scrim or the cross closes
 * it; the type and role selects write straight through (AC-FD-3, AC-FD-4).
 */
@Composable
@Suppress("LongParameterList")
fun MemberActionsSheet(
	member: RosterRowDto,
	currentUserRole: String,
	onSetType: (RosterRowDto, String) -> Unit,
	onSetRole: (RosterRowDto, String) -> Unit,
	onRemove: (RosterRowDto) -> Unit,
	onClose: () -> Unit,
) {
	val name = listOfNotNull(member.firstName, member.lastName).joinToString(" ").ifBlank { "this member" }
	Box(modifier = Modifier.fillMaxSize().background(Slate.S900.copy(alpha = 0.4f)).clickable(onClick = onClose)) {
		Surface(
			modifier = Modifier.fillMaxWidth().padding(top = 96.dp),
			shape = FpShape.Input,
			color = MaterialTheme.colorScheme.surface,
		) {
			Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
				Row(verticalAlignment = Alignment.CenterVertically) {
					Text(
						"Actions for $name",
						style = MaterialTheme.typography.titleMedium,
						fontWeight = FontWeight.Bold,
						modifier = Modifier.weight(1f),
					)
					FamilyTextLink("Close \u2715", onClose)
				}
				FamilyBandTitle("Member type")
				Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
					MEMBER_TYPES.forEach { type ->
						val on = member.memberType.equals(type, ignoreCase = true)
						FilterChip(
							selected = on,
							onClick = { onSetType(member, type) },
							label = { Text(type) },
							colors = fpFilterChipColors(),
							border = fpFilterChipBorder(on),
						)
					}
				}
				FamilyBandTitle("Role")
				Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
					roleOptions(currentUserRole).forEach { option ->
						val on = member.role.equals(option, ignoreCase = true)
						FilterChip(
							selected = on,
							onClick = { onSetRole(member, option) },
							label = { Text(option.replaceFirstChar { it.uppercase() }) },
							colors = fpFilterChipColors(),
							border = fpFilterChipBorder(on),
						)
					}
				}
				if (canRemove(member)) {
					FamilyTextLink("Remove member", { onRemove(member) })
				}
			}
		}
	}
}

/** AC-FD-5: "Remove {name} from this family?" with Remove / Cancel. */
@Composable
fun RemoveMemberConfirm(member: RosterRowDto, onConfirm: () -> Unit, onCancel: () -> Unit) {
	val name = listOfNotNull(member.firstName, member.lastName).joinToString(" ").ifBlank { "this member" }
	Box(modifier = Modifier.fillMaxSize().background(Slate.S900.copy(alpha = 0.4f)).clickable(onClick = onCancel)) {
		Surface(
			modifier = Modifier.fillMaxWidth().padding(24.dp),
			shape = FpShape.Input,
			color = MaterialTheme.colorScheme.surface,
		) {
			Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
				Text(
					"Remove $name from this family?",
					style = MaterialTheme.typography.titleMedium,
					fontWeight = FontWeight.Bold,
				)
				Text(
					"Their tasks stay with them; this family stops sharing them.",
					style = MaterialTheme.typography.bodySmall,
					color = FpTheme.colors.textMuted,
				)
				Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
					FamilyActionChip("Remove", onConfirm)
					FamilyActionChip("Cancel", onCancel)
				}
			}
		}
	}
}

/**
 * The Day Dashboard module ids and labels (`dashboardModules.ts:21-33`): the
 * master switches the family settings band toggles.
 */
val DASHBOARD_MODULES: List<Pair<String, String>> = listOf(
	"todaySchedule" to "Today's schedule",
	"upcomingEvents" to "Upcoming events",
	"openTasks" to "Open tasks",
	"kidsSchedule" to "Kids' Schedule",
	"meals" to "Meals",
	"familyActivity" to "Family activity",
	"dailyVerse" to "Daily verse",
)

