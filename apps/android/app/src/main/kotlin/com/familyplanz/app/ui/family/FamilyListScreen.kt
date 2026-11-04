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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.FamiliesOverviewDto
import com.familyplanz.app.data.FamilyCardDto
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.FpHeader
import com.familyplanz.app.ui.FpPrimaryButton
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.Slate

/** Everything the Families tab can ask of the app (one place, so the screen stays pure). */
@Suppress("LongParameterList", "MatchingDeclarationName")
class FamilyListActions(
	val onOpenFamily: (String) -> Unit = {},
	val onOpenMembers: (String) -> Unit = {},
	val onAddMember: (String) -> Unit = {},
	val onFamilyTasks: (String) -> Unit = {},
	val onCreate: () -> Unit = {},
	val onUpgrade: () -> Unit = {},
	val onMint: (String) -> Unit = {},
	val onCopy: (link: String, code: String?) -> Unit = { _, _ -> },
	val onOpenInvitations: () -> Unit = {},
	val onOpenTasks: () -> Unit = {},
)

/**
 * The Families tab (2.7): breadcrumb, plan-gated hero, one card per family,
 * the invitation card and the members rail (AC-FM-1..7).
 */
@Composable
fun FamilyListScreen(
	state: FamilyListState,
	actions: FamilyListActions,
	menu: @Composable () -> Unit = {},
	modifier: Modifier = Modifier,
) {
	Column(modifier = modifier.fillMaxSize().background(Slate.S50)) {
		FpHeader("Family") { menu() }
		Column(
			modifier = Modifier
				.fillMaxWidth()
				.verticalScroll(rememberScrollState())
				.padding(12.dp),
			verticalArrangement = Arrangement.spacedBy(12.dp),
		) {
			FamilyBreadcrumb("Calendar", "Family")
			when (state) {
				FamilyListState.Loading -> Text(
					"Loading your families\u2026",
					style = MaterialTheme.typography.bodyMedium,
					color = FpTheme.colors.textMuted,
				)

				is FamilyListState.Failed -> Text(
					state.reason,
					style = MaterialTheme.typography.bodyMedium,
					color = MaterialTheme.colorScheme.error,
				)

				is FamilyListState.Ready -> FamilyListBody(state, actions)
			}
		}
	}
}

@Composable
private fun FamilyListBody(state: FamilyListState.Ready, actions: FamilyListActions) {
	val overview = state.overview
	FamilyHero(overview, actions)
	FamilyCards(overview, actions)
	FamilyInvitationCard(overview, state.joinLink, state.mintError, actions)
	FamilyMembersRail(overview, actions)
}

/** The hero: "Families", the count line, the plan pill and the plan-gated CTA (AC-FM-1, AC-FM-2). */
@Composable
private fun FamilyHero(overview: FamiliesOverviewDto, actions: FamilyListActions) {
	val used = overview.plan.used.takeIf { it > 0 } ?: overview.families.size
	val limit = overview.plan.limit
	Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
		FamilyPageTitle("Families")
		Text(
			"${familiesLabel(overview.families.size)} you belong to",
			style = MaterialTheme.typography.bodyMedium,
			color = FpTheme.colors.textBody,
		)
		if (limit > 0) {
			Text(
				"$used of ${familiesLabel(limit)} on your plan",
				style = MaterialTheme.typography.bodySmall,
				color = FpTheme.colors.textMuted,
			)
		}
		if (isAtFamilyLimit(used, limit)) {
			FpPrimaryButton(onClick = actions.onUpgrade, modifier = Modifier.fillMaxWidth()) {
				Text("Upgrade to add families", fontWeight = FontWeight.SemiBold)
			}
		} else {
			FpPrimaryButton(onClick = actions.onCreate, modifier = Modifier.fillMaxWidth()) {
				Text("Create New Family", fontWeight = FontWeight.SemiBold)
			}
		}
	}
}

@Composable
private fun FamilyCards(overview: FamiliesOverviewDto, actions: FamilyListActions) {
	FamilyBandTitle("Your families")
	Text(
		"Open a family to see members and settings",
		style = MaterialTheme.typography.bodySmall,
		color = FpTheme.colors.textMuted,
	)
	if (overview.families.isEmpty()) {
		FamilyEmptyCard(onCreate = actions.onCreate)
		return
	}
	overview.families.forEach { card ->
		FamilyCard(
			card = card,
			onOpen = { actions.onOpenFamily(card.id) },
			onMembers = { actions.onOpenMembers(card.id) },
			onAddMember = { actions.onAddMember(card.id) },
			onTasks = { actions.onFamilyTasks(card.id) },
		)
	}
}

/** The invitation card: per usable family, "Invite by link" mints a 10-use code (AC-FM-6). */
@Composable
private fun FamilyInvitationCard(
	overview: FamiliesOverviewDto,
	joinLink: JoinLink?,
	mintError: String?,
	actions: FamilyListActions,
) {
	FpCard(modifier = Modifier.fillMaxWidth()) {
		FamilyBandTitle("Invitations")
		Text(
			"Get a join link to send, or manage the codes your family already has",
			style = MaterialTheme.typography.bodyMedium,
			color = FpTheme.colors.textBody,
			modifier = Modifier.padding(vertical = 6.dp),
		)
		overview.families.filter { it.canInvite }.forEach { card ->
			Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
				Column(modifier = Modifier.weight(1f)) {
					Text(card.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
					Text(
						"Join link, good for ${FamilyListViewModel.INVITE_USES} people",
						style = MaterialTheme.typography.bodySmall,
						color = FpTheme.colors.textMuted,
					)
				}
				FamilyActionChip("Invite by link", { actions.onMint(card.id) })
			}
			if (joinLink?.familyId == card.id) {
				FamilyJoinLink(
					link = joinLink.link,
					copied = joinLink.copied,
					onCopy = { actions.onCopy(joinLink.link, null) },
					copyFailed = joinLink.copyFailed,
					modifier = Modifier.fillMaxWidth(),
				)
			}
		}
		FamilyErrorLine(mintError)
		FamilyTextLink("View family invitations \u203A", actions.onOpenInvitations)
		FamilyTextLink("Family Tasks \u203A", actions.onOpenTasks)
	}
}

/** The rail: one row per family naming its members and opening the member list. */
@Composable
private fun FamilyMembersRail(overview: FamiliesOverviewDto, actions: FamilyListActions) {
	if (overview.families.isEmpty()) return
	FpCard(modifier = Modifier.fillMaxWidth()) {
		overview.families.forEach { card ->
			val members = overview.roster.filter { it.familyId == card.id }
			Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
				FamilyBandTitle("Members")
				Text(
					"  ${card.memberCount}",
					style = MaterialTheme.typography.bodySmall,
					color = FpTheme.colors.textMuted,
					modifier = Modifier.weight(1f),
				)
				FamilyTextLink("Manage \u203A", { actions.onOpenMembers(card.id) })
			}
			members.forEach { member ->
				FamilyMemberRow(
					name = listOfNotNull(member.firstName, member.lastName).joinToString(" ").ifBlank { "Member" },
					memberType = member.memberType,
					role = member.role,
				)
			}
		}
	}
}

/** The card the plan gate keeps out of reach: the test-facing shape of AC-FM-2's CTA. */
internal fun familyCtaLabel(used: Int, limit: Int): String =
	if (isAtFamilyLimit(used, limit)) "Upgrade to add families" else "Create New Family"

/** Total members named across cards; the plan pill's fallback when the server omits `plan.used`. */
internal fun namedMemberCount(families: List<FamilyCardDto>): Int = families.sumOf { it.members.size }
