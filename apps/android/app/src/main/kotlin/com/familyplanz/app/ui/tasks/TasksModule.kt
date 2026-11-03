package com.familyplanz.app.ui.tasks

import com.familyplanz.app.AppServices
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLink

/** L3's DI seam: the Tasks tab's sources and ViewModels, built from [services]. */
class TasksModule(private val services: AppServices) {
	fun tasksViewModel() = TasksViewModel(services.repository, services.tokenStore)

	companion object {
		val deepLinks: List<DeepLink> = listOf(
			DeepLink("/calendar/tasks", AppRoute.TASKS),
			DeepLink("/tasks", AppRoute.TASKS),
		)
	}
}
