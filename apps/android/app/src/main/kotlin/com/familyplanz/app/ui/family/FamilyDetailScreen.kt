package com.familyplanz.app.ui.family

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.FamilyDetailDto
import com.familyplanz.app.data.RosterRowDto
import com.familyplanz.app.ui.FpPrimaryButton
import com.familyplanz.app.ui.fpFilterChipBorder
import com.familyplanz.app.ui.fpFilterChipColors
import com.familyplanz.app.ui.theme.FpTheme

/** The band container: `rounded-2xl border p-4 shadow-sm` with a 12 sp uppercase title. */
@Composable
fun FamilyBand(title: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
	Surface(
		modifier = modifier.fillMaxWidth(),
		shape = MaterialTheme.shapes.large,
		color = MaterialTheme.colorScheme.surface,
		border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
		shadowElevation = 1.dp,
	) {
		Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
			FamilyBandTitle(title)
			content()
		}
	}
}

/** AC-FD-1: hero, Members, Recent Activity, then the admin bands and the rail. */
@Composable
fun FamilyDetailBody(state: FamilyDetailState.Ready, actions: FamilyDetailActions) {
	val detail = state.detail
	val role = detail.currentUserRole
	val manager = isManager(role)
	FamilyHero(detail, role, manager, actions)
	MembersBand(detail, manager, role, actions)
	ActivityBand(detail)
	if (manager) {
		FamilySettingsBand(state, actions)
		InvitationsBand(detail, actions)
	}
	DetailRail(detail, state.joinLink, manager, actions)
}

/** Hero: family name, "You: {role}", Add member (admin) and the settings jump. */
@Composable
private fun FamilyHero(
	detail: FamilyDetailDto,
	role: String,
	manager: Boolean,
	actions: FamilyDetailActions,
) {
	Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
		FamilyBreadcrumb("Calendar", "Family", detail.family?.name.orEmpty())
		FamilyPageTitle(detail.family?.name.orEmpty())
		Text("You: $role", style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
		if (manager) {
			FamilyActionChip("Add member", actions.onAddMember)
		}
	}
}

/** Members band: the count, the quick links and one editable row per member. */
@Composable
private fun MembersBand(
	detail: FamilyDetailDto,
	manager: Boolean,
	role: String,
	actions: FamilyDetailActions,
) {
	FamilyBand("Members") {
		Row(verticalAlignment = Alignment.CenterVertically) {
			Text(
				"${detail.members.size} of ${detail.planUsage.memberLimit} on your plan",
				style = MaterialTheme.typography.bodySmall,
				color = FpTheme.colors.textMuted,
				modifier = Modifier.weight(1f),
			)
			FamilyTextLink("Family Tasks", actions.onOpenTasks)
			FamilyTextLink("Groceries", actions.onOpenGroceries)
		}
		detail.members.forEach { member ->
			MemberRow(member, detail.currentUserId, manager, role, actions)
		}
	}
}

@Composable
private fun MemberRow(
	member: RosterRowDto,
	currentUserId: String,
	manager: Boolean,
	role: String,
	actions: FamilyDetailActions,
) {
	val name = listOfNotNull(member.firstName, member.lastName).joinToString(" ").ifBlank { "Member" }
	Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
		FamilyMemberRow(
			name = name,
			memberType = member.memberType,
			role = member.role,
			trailing = {
				FamilyActionChip("Actions", { actions.onOpenSheet(member) })
			},
		)
		if (manager && member.role != "creator") {
			Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
				MEMBER_TYPES.forEach { type ->
					FilterChip(
						selected = member.memberType.equals(type, ignoreCase = true),
						onClick = { actions.onSetType(member, type) },
						label = { Text(type) },
						colors = fpFilterChipColors(),
						border = fpFilterChipBorder(member.memberType.equals(type, ignoreCase = true)),
					)
				}
			}
			Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
				roleOptions(role).forEach { option ->
					FilterChip(
						selected = member.role.equals(option, ignoreCase = true),
						onClick = { actions.onSetRole(member, option) },
						label = { Text(option.replaceFirstChar { it.uppercase() }) },
						colors = fpFilterChipColors(),
						border = fpFilterChipBorder(member.role.equals(option, ignoreCase = true)),
					)
				}
				if (canRemove(member) && member.userId != currentUserId) {
					FamilyTextLink("Remove", { actions.onAskRemove(member) })
				}
			}
		}
	}
}

/** AC-FD-10: the feed, or the page's empty line. */
@Composable
private fun ActivityBand(detail: FamilyDetailDto) {
	FamilyBand("Recent Activity") {
		if (detail.activity.isEmpty()) {
			Text(
				NO_ACTIVITY_COPY,
				style = MaterialTheme.typography.bodyMedium,
				color = FpTheme.colors.textBody,
			)
			return@FamilyBand
		}
		detail.activity.forEach { row ->
			Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
				Text(row.actorName, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
				Text(
					"${row.kind} ${row.title}",
					style = MaterialTheme.typography.bodyMedium,
					color = FpTheme.colors.textBody,
					modifier = Modifier.weight(1f),
				)
				row.at?.let {
					Text(it.substringBefore('T'), style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textMuted)
				}
			}
		}
	}
}

/** The rail: shared data links, the active invitation and the plan card (AC-FD-9). */
@Composable
private fun DetailRail(
	detail: FamilyDetailDto,
	joinLink: JoinLink?,
	manager: Boolean,
	actions: FamilyDetailActions,
) {
	FamilyBand("Shared data") {
		FamilyTextLink("Family tasks \u203A", actions.onOpenTasks)
		FamilyTextLink("Family calendar \u203A", actions.onOpenCalendar)
	}
	FamilyBand("Active invitation") {
		val invite = detail.activeInvite
		if (invite == null) {
			Text(
				"No active invitation. Mint a link to bring somebody into this family.",
				style = MaterialTheme.typography.bodyMedium,
				color = FpTheme.colors.textBody,
			)
			if (manager) FamilyActionChip("Get a join link", actions.onMint)
		} else {
			Text(invite.code, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold)
			Text(
				"${invite.useCount}/${invite.maxUses ?: '\u221E'} \u00B7 expires ${invite.expiresAt?.substringBefore('T') ?: "never"}",
				style = MaterialTheme.typography.bodySmall,
				color = FpTheme.colors.textMuted,
			)
			Text("Send this link to someone", style = MaterialTheme.typography.bodySmall, color = FpTheme.colors.textBody)
		}
		joinLink?.let {
			FamilyJoinLink(
				link = it.link,
				copied = it.copied,
				onCopy = { actions.onCopy(it.link, null) },
				copyFailed = it.copyFailed,
			)
		}
		FamilyTextLink("Manage invitations \u203A", actions.onOpenInvitations)
	}
	FamilyBand("Plan") {
		val plan = detail.planUsage
		Text(
			"${plan.tierName ?: "Free"} \u00B7 AI ${plan.aiUsed}/${plan.aiLimit} \u00B7 " +
				"${plan.familiesUsed}/${plan.familyLimit} families \u00B7 ${plan.members}/${plan.memberLimit} members",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textBody,
		)
		Text(
			"Archive kept ${plan.archivedRetentionDays} days \u00B7 export ${if (plan.exportImportEnabled) "on" else "off"}",
			style = MaterialTheme.typography.bodySmall,
			color = FpTheme.colors.textMuted,
		)
		FamilyPrimaryNote()
	}
}

/** The "Children are users" note with its "See the form" jump. */
@Composable
private fun FamilyPrimaryNote() {
	Text(
		"Children are users: each child gets their own account and email, so their tasks follow them.",
		style = MaterialTheme.typography.bodySmall,
		color = FpTheme.colors.textMuted,
	)
}

/** AC-FD-10 verbatim. */
const val NO_ACTIVITY_COPY = "No activity yet \u2014 complete something to get things moving."

/** The member types the inline editor offers (web `MemberChildTab` / role select). */
val MEMBER_TYPES = listOf("Parent", "Child", "Member")

/** A colour swatch the settings band offers: a 32 dp disc, ringed when picked. */
@Composable
fun ColourSwatch(hex: String, selected: Boolean, onPick: () -> Unit) {
	val parsed = runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrElse { Color.Gray }
	Box(
		modifier = Modifier
			.size(32.dp)
			.clip(CircleShape)
			.background(parsed)
			.border(if (selected) 3.dp else 1.dp, if (selected) FpTheme.colors.textStrong else Color.White, CircleShape)
			.padding(2.dp)
			.heightIn(min = 32.dp),
	)
}

/** The colours the web's family form offers. */
val FAMILY_COLOURS = listOf(
	"#3b82f6", "#dd5822", "#10b981", "#8b5cf6", "#ef4444", "#f59e0b", "#14b8a6", "#64748b",
)

/** The admin CTA shape shared by the settings band (48 dp primary pill). */
@Composable
fun FamilySaveButton(label: String, onClick: () -> Unit) {
	FpPrimaryButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
		Text(label, fontWeight = FontWeight.SemiBold, color = Color.White)
	}
}
