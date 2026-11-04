package com.familyplanz.app.ui.tasks

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.ui.platform.LocalContext
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.shell.GuestAccountNote
import com.familyplanz.app.ui.shell.LocalAppModules
import com.familyplanz.app.ui.shell.LocalShell
import com.familyplanz.app.ui.shell.Shell
import com.familyplanz.app.ui.shell.ShellMenuButton

/**
 * The Tasks tab: the #288 guest note, then the list with the add card, the
 * toolbar query, row writes, assignments, categories, edits and TaskFocus
 * (desktop command + the phone's own sessions). Snacks and a 401 go to the
 * shell.
 */
@Composable
fun TasksEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val shell = LocalShell.current
	val context = LocalContext.current
	val vm = viewModel { modules.tasks.tasksViewModel(context) }
	val state by vm.ui.collectAsStateWithLifecycle()
	val categories by vm.categories.collectAsStateWithLifecycle()
	val categoryRows by vm.categoryRows.collectAsStateWithLifecycle()
	val focusPending by vm.focusPending.collectAsStateWithLifecycle()
	val snack by vm.snack.collectAsStateWithLifecycle()
	val ended by vm.sessionEnded.collectAsStateWithLifecycle()
	val members by vm.members.collectAsStateWithLifecycle()
	val memberNames by vm.memberNames.collectAsStateWithLifecycle()
	val guestNote by shell.guestNoteVisible.collectAsStateWithLifecycle()

	LaunchedEffect(snack) {
		snack?.let {
			shell.showSnack(it.text)
			vm.consumeSnack()
		}
	}
	LaunchedEffect(ended) {
		ended?.let(shell::endSession)
	}
	Column {
		if (guestNote) GuestAccountNote(shell::dismissGuestNote)
		TaskListScreen(
			state = state,
			actions = vm.taskActions(shell, members, memberNames),
			categories = categories,
			categoryRows = categoryRows,
			focusPending = focusPending,
			onRenameCategory = vm::renameCategory,
			onDeleteCategory = vm::deleteCategory,
			onSaveEdit = { task, form ->
				val patch = form.changedPatch(task)
				if (patch == null) {
					vm.closeEdit()
				} else {
					vm.saveEdit(task, patch, form.title.trim())
				}
			},
			menu = { ShellMenuButton(nav) },
		)
	}
}

private fun TasksViewModel.taskActions(
	shell: Shell,
	members: List<com.familyplanz.app.domain.tasks.QuickAddMember>,
	memberNames: Map<String, String>,
) = TaskActions(
	onRefresh = ::refresh,
	onOpenSettings = shell::signOut,
	onToggleComplete = ::toggleComplete,
	onStartFocus = ::focusHere,
	onStopFocus = ::stopFocus,
	onRespond = ::respondAssignment,
	onCreate = ::createTask,
	onEdit = ::openEdit,
	onDelete = ::deleteTask,
	onSkip = ::skipTask,
	onClearCompleted = ::clearCompleted,
	onView = ::setView,
	onScope = ::setScope,
	onTime = ::setTime,
	onSearch = ::setSearch,
	onSort = ::setSort,
	onTag = ::setTag,
	onDismissCreateError = ::dismissCreateError,
	onDismissEdit = ::closeEdit,
)
