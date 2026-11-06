package com.familyplanz.app.ui.tasks

import com.familyplanz.app.domain.Task
import com.familyplanz.app.domain.tasks.OwnerView
import com.familyplanz.app.domain.tasks.ScopeChip
import com.familyplanz.app.domain.tasks.TaskSortKey
import com.familyplanz.app.domain.tasks.TimeFilter

/**
 * Everything the Tasks tab can ask for. Null callbacks hide their control, so
 * a preview or a test can render a read-only list.
 */
data class TaskActions(
	val onRefresh: () -> Unit,
	val onOpenSettings: () -> Unit,
	val onToggleComplete: (Task) -> Unit,
	val onStartFocus: (Task) -> Unit,
	val onStopFocus: (Task?) -> Unit,
	val onStartFocusDesktop: ((Task) -> Unit)? = null,
	val onRespond: ((Task, String) -> Unit)? = null,
	val onCreate: ((NewTaskInput) -> Unit)? = null,
	val onEdit: ((Task) -> Unit)? = null,
	val onDelete: ((Task) -> Unit)? = null,
	val onSkip: ((Task) -> Unit)? = null,
	val onClearCompleted: (() -> Unit)? = null,
	val onView: (OwnerView) -> Unit = {},
	val onScope: (ScopeChip) -> Unit = {},
	val onTime: (TimeFilter) -> Unit = {},
	val onSearch: (String) -> Unit = {},
	val onSort: (TaskSortKey) -> Unit = {},
	val onTag: (String) -> Unit = {},
	val onDismissCreateError: () -> Unit = {},
	val onDismissEdit: () -> Unit = {},
)
