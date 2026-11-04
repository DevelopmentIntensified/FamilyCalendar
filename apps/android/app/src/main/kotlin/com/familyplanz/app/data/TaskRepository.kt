package com.familyplanz.app.data

/**
 * Whole phone API surface, composed by concern so each ViewModel can depend
 * on the narrowest slice (tasks / events / account). The network
 * implementation delegates each slice to its own small class.
 */
interface TaskRepository : TaskSource, TaskCategorySource, FocusSessionSource, EventSource, AccountSource

class NetworkTaskRepository(
	api: FamilyPlanzApi,
	cache: TaskCache? = null,
) : TaskRepository,
	TaskSource by NetworkTaskSource(api, cache),
	TaskCategorySource by NetworkTaskCategorySource(api),
	FocusSessionSource by NetworkFocusSessionSource(api),
	EventSource by NetworkEventSource(api, cache),
	AccountSource by NetworkAccountSource(api)
