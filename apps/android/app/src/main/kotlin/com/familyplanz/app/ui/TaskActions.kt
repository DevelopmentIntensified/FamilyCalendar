package com.familyplanz.app.ui

import com.familyplanz.app.domain.Task

/** Task tab callbacks; `onRespond` null hides accept/decline. */
data class TaskActions(
	val onRefresh: () -> Unit,
	val onOpenSettings: () -> Unit,
	val onToggleComplete: (Task) -> Unit,
	val onStartFocus: (Task) -> Unit,
	val onStopFocus: () -> Unit,
	val onRespond: ((Task, String) -> Unit)? = null,
)
