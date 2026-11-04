@file:Suppress("MatchingDeclarationName")
package com.familyplanz.app.ui.family

import android.content.ClipData
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.data.MemberHitDto
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.shell.LocalAppModules
import com.familyplanz.app.ui.shell.LocalShell
import com.familyplanz.app.ui.shell.ShellMenuButton
import kotlinx.coroutines.launch

/** The Families tab's own sub-routes (2.7-2.11); `nav` keeps the tab and the back stack. */
@Suppress("MatchingDeclarationName")
sealed interface FamilyRoute {
	data object List : FamilyRoute

	data class Detail(val familyId: String) : FamilyRoute

	data class Invites(val familyId: String) : FamilyRoute

	data object Create : FamilyRoute

	data class Members(val familyId: String) : FamilyRoute

	data class Tasks(val familyId: String) : FamilyRoute
}

/**
 * The Families tab: the list, one family's detail, the invitations page, the
 * create form and the two member/task sub-pages. Snacks go to the shell.
 */
@Composable
@Suppress("LongMethod")
fun FamilyEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val shell = LocalShell.current
	val clipboard = LocalClipboard.current
	val scope = rememberCoroutineScope()
	val family = modules.family
	var route by remember { mutableStateOf<FamilyRoute>(FamilyRoute.List) }

	/** Clipboard write, then the page's "Copied" / "select the link" answers. */
	fun copy(link: String, onCopied: () -> Unit, onFailed: () -> Unit) {
		scope.launch {
			val written = runCatching { clipboard.setClipEntry(clipEntry(link)) }.isSuccess
			if (written) onCopied() else onFailed()
		}
	}

	when (val current = route) {
		FamilyRoute.List -> {
			val vm = viewModel { family.listViewModel() }
			val state by vm.state.collectAsStateWithLifecycle()
			val snack by vm.snack.collectAsStateWithLifecycle()
			LaunchedEffect(snack) {
				snack?.let {
					shell.showSnack(it.text)
					vm.consumeSnack()
				}
			}
			FamilyListScreen(
				state = state,
				actions = FamilyListActions(
					onOpenFamily = { route = FamilyRoute.Detail(it) },
					onOpenMembers = { route = FamilyRoute.Members(it) },
					onAddMember = { route = FamilyRoute.Members(it) },
					onFamilyTasks = { route = FamilyRoute.Tasks(it) },
					onCreate = { route = FamilyRoute.Create },
					onUpgrade = { nav.openLink(PRICING_PATH) },
					onMint = vm::mint,
					onCopy = { link, _ -> copy(link, vm::copied, vm::copyFailed) },
					onOpenInvitations = { route = FamilyRoute.Invites(soleFamilyId(vm)) },
					onOpenTasks = { route = FamilyRoute.Tasks(soleFamilyId(vm)) },
				),
				menu = { ShellMenuButton(nav) },
			)
		}

		is FamilyRoute.Detail -> {
			val vm = viewModel(key = "family-detail-${current.familyId}") { family.detailViewModel(current.familyId) }
			val state by vm.state.collectAsStateWithLifecycle()
			FamilyDetailScreen(
				state = state,
				actions = FamilyDetailActions(
					onAddMember = { route = FamilyRoute.Members(current.familyId) },
					onOpenTasks = { route = FamilyRoute.Tasks(current.familyId) },
					onOpenGroceries = { nav.openLink(GROCERIES_PATH) },
					onOpenCalendar = { nav.openLink(CALENDAR_PATH) },
					onOpenInvitations = { route = FamilyRoute.Invites(current.familyId) },
					onSetType = vm::setMemberType,
					onSetRole = vm::setRole,
					onAskRemove = vm::askRemove,
					onConfirmRemove = vm::confirmRemove,
					onCancelRemove = vm::cancelRemove,
					onOpenSheet = vm::openSheet,
					onCloseSheet = vm::closeSheet,
					onEditName = vm::editName,
					onPickColor = vm::pickColor,
					onSaveSettings = vm::saveSettings,
					onToggleModule = vm::toggleModule,
					onMint = vm::mintInvite,
					onCopy = { link, _ -> copy(link, vm::copied, vm::copyFailed) },
				),
				menu = { ShellMenuButton(nav) },
			)
		}

		is FamilyRoute.Invites -> {
			val vm = viewModel(key = "family-invites-${current.familyId}") { family.invitesViewModel(current.familyId) }
			val state by vm.state.collectAsStateWithLifecycle()
			FamilyInvitesScreen(
				state = state,
				actions = FamilyInvitesActions(
					onSelectFamily = vm::selectFamily,
					onBack = { route = FamilyRoute.Detail(current.familyId) },
					onCreate = vm::createCode,
					onRevoke = vm::revoke,
					onCopy = { link, code -> copy(link, { code?.let(vm::copied) }, vm::copyFailed) },
					onSetValidDays = vm::setValidDays,
					onSetMaxUses = vm::setMaxUses,
					onAddMember = { route = FamilyRoute.Members(current.familyId) },
				),
			)
		}

		FamilyRoute.Create -> {
			val vm = viewModel { family.createViewModel() }
			val state by vm.state.collectAsStateWithLifecycle()
			val created by vm.created.collectAsStateWithLifecycle()
			LaunchedEffect(created) {
				created?.let {
					vm.consumeCreated()
					route = FamilyRoute.Detail(it)
				}
			}
			FamilyCreateScreen(
				state = state,
				actions = FamilyCreateActions(
					onName = vm::editName,
					onPickColor = vm::pickColor,
					onToggleMember = vm::toggleMember,
					onSubmit = vm::submit,
					onUpgrade = { nav.openLink(PRICING_PATH) },
					onBack = { route = FamilyRoute.List },
				),
			)
		}

		is FamilyRoute.Members -> {
			val vm = viewModel(key = "family-members-${current.familyId}") { family.membersViewModel(current.familyId) }
			val state by vm.state.collectAsStateWithLifecycle()
			FamilyMembersScreen(
				state = state,
				actions = FamilyMembersActions(
					onSelectTab = vm::selectTab,
					onSearch = vm::search,
					onAddExisting = { id -> vm.addExisting(hitFor(id, state)) },
					onEmail = vm::setEmail,
					onFirstName = vm::setFirstName,
					onLastName = vm::setLastName,
					onSendEmail = vm::sendEmail,
					onCopyLink = { link -> copy(link, vm::linkCopied, vm::copyFailed) },
					onChildFirst = vm::setChildFirst,
					onChildLast = vm::setChildLast,
					onChildEmail = vm::setChildEmail,
					onConsent = vm::setConsent,
					onAddChild = vm::addChild,
					onReturn = { route = FamilyRoute.Detail(current.familyId) },
					onBack = { route = FamilyRoute.Detail(current.familyId) },
				),
			)
		}

		is FamilyRoute.Tasks -> {
			val vm = viewModel(key = "family-tasks-${current.familyId}") { family.tasksViewModel(current.familyId) }
			val state by vm.state.collectAsStateWithLifecycle()
			FamilyTasksScreen(
				state = state,
				actions = FamilyTasksActions(
					onFilter = vm::setFilter,
					onShowPublic = vm::showPublic,
					onTitle = vm::editTitle,
					onAdd = vm::addTask,
					onToggle = vm::toggle,
					onBack = { route = FamilyRoute.Detail(current.familyId) },
				),
			)
		}
	}
}

/** The web's pricing page, opened in a Custom Tab (AC-FM-2, AC-FC-2). */
private const val PRICING_PATH = "/pricing"

private const val GROCERIES_PATH = "/calendar/groceries"

private const val CALENDAR_PATH = "/calendar"

/** Clipboard write, encoded as the Android plain-text clip the shell can paste. */
private fun clipEntry(link: String): ClipEntry = ClipEntry(ClipData.newPlainText("FamilyPlanz invite", link))

/** The first family, for the list's cross-links (the invitation card is per-family anyway). */
private fun soleFamilyId(vm: FamilyListViewModel): String =
	(vm.state.value as? FamilyListState.Ready)?.overview?.families?.firstOrNull()?.id.orEmpty()

/** The search hit behind an "Add" tap, so the entry keeps [FamilyMembersViewModel] state-free. */
private fun hitFor(id: String, state: FamilyMembersState): MemberHitDto =
	state.hits.firstOrNull { it.id == id } ?: MemberHitDto(id = id)

