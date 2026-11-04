package com.familyplanz.app.ui.family

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.FamilyCardDto
import com.familyplanz.app.ui.FpOutlineButton
import com.familyplanz.app.ui.theme.FpShape
import com.familyplanz.app.ui.theme.FpTheme

/**
 * One family card (2.7): colour avatar, name, the MEMBERS/CREATED/COLOUR/
 * OPEN TASKS list, the roster strip and the four action buttons. Buttons
 * that need the invite right only appear for a creator/admin (AC-FM-5).
 */
@Composable
@Suppress("LongParameterList")
fun FamilyCard(
	card: FamilyCardDto,
	onOpen: () -> Unit,
	onMembers: () -> Unit,
	onAddMember: () -> Unit,
	onTasks: () -> Unit,
	modifier: Modifier = Modifier,
) {
	Surface(
		modifier = modifier.fillMaxWidth(),
		shape = MaterialTheme.shapes.extraLarge,
		color = FAMILY_CARD_TONE.container,
		border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
	) {
		Column(
			modifier = Modifier.padding(20.dp),
			verticalArrangement = Arrangement.spacedBy(12.dp),
		) {
			Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
				FamilyAvatar(initial = card.name, tone = FAMILY_CARD_TONE, size = 44.dp)
				Column {
					Text(
						card.name,
						style = MaterialTheme.typography.titleLarge,
						fontWeight = FontWeight.ExtraBold,
						color = FpTheme.colors.textStrong,
					)
					Text(
						"Family \u00B7 settings, members and modules",
						style = MaterialTheme.typography.bodySmall,
						color = FpTheme.colors.textMuted,
					)
				}
			}
			Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
				FamilyStat("Members", card.memberCount.toString())
				FamilyStat("Created", card.createdLabel ?: formatCreated(card.createdAt))
				FamilyStat("Colour", colourLabel(card.color))
				FamilyStat("Open tasks", card.openTasks.toString())
			}
			FamilyRosterStrip(card.members.map { it.firstName })
			Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
				FpOutlineButton(onClick = onOpen, modifier = Modifier.fillMaxWidth()) {
					Text("Open family", fontWeight = FontWeight.SemiBold)
				}
				Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
					FamilyActionChip("Members", onMembers)
					if (card.canInvite) FamilyActionChip("Add a member", onAddMember)
					FamilyActionChip("Family tasks", onTasks)
				}
			}
		}
	}
}

/** AC-FM-7: no families at all — the empty card with the first-family CTA. */
@Composable
fun FamilyEmptyCard(onCreate: () -> Unit, modifier: Modifier = Modifier) {
	Surface(
		modifier = modifier.fillMaxWidth(),
		shape = MaterialTheme.shapes.large,
		color = MaterialTheme.colorScheme.surface,
		border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
	) {
		Column(
			modifier = Modifier.padding(20.dp),
			verticalArrangement = Arrangement.spacedBy(8.dp),
			horizontalAlignment = Alignment.CenterHorizontally,
		) {
			FamilyAvatar(initial = "+", tone = FAMILY_CARD_TONE, size = 44.dp)
			Text("No families yet", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = FpTheme.colors.textStrong)
			Text(
				"Create a family, then invite the people you share plans with.",
				style = MaterialTheme.typography.bodyMedium,
				color = FpTheme.colors.textBody,
			)
			FpOutlineButton(onClick = onCreate) { Text("Create Your First Family", fontWeight = FontWeight.SemiBold) }
		}
	}
}

/** `createdLabel` is usually pre-formatted; fall back to the ISO date part. */
internal fun formatCreated(iso: String?): String = iso?.substringBefore('T')?.takeIf { it.isNotBlank() } ?: "Not set"
