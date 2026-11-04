package com.familyplanz.app.ui.tasks

import android.content.Context
import com.familyplanz.app.AppServices
import com.familyplanz.app.data.FilePhoneFocusStore
import com.familyplanz.app.data.PhoneFocusStore
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.nav.DeepLink
import java.io.File

/** L3's DI seam: the Tasks tab's sources and ViewModels, built from [services]. */
class TasksModule(private val services: AppServices) {
	/**
	 * The ViewModel with the phone's own storage: the sort/tag prefs the web
	 * keeps in `localStorage` (AC-TK-11/12) and the focus-session queue
	 * (#293) live in the app's files dir, so both survive a restart.
	 */
	fun tasksViewModel(
		context: Context? = null,
		focusStore: PhoneFocusStore? = context?.let { FilePhoneFocusStore(it.filesDir) } ?: null,
	): TasksViewModel {
		val prefs = context?.let { FileTasksPrefs(File(it.filesDir, "tasks-view.txt")) } ?: MemoryTasksPrefs()
		return TasksViewModel(
			repository = services.repository,
			tokenStore = services.tokenStore,
			prefs = prefs,
			phoneFocusStore = focusStore ?: com.familyplanz.app.data.MemoryPhoneFocusStore(),
		)
	}

	companion object {
		val deepLinks: List<DeepLink> = listOf(
			DeepLink("/calendar/tasks", AppRoute.TASKS),
			DeepLink("/tasks", AppRoute.TASKS),
		)
	}
}
