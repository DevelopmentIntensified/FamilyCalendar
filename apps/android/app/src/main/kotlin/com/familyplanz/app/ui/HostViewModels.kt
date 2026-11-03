package com.familyplanz.app.ui

/** The screen ViewModels [FamilyPlanzHost] wires together. */
data class HostViewModels(
	val app: AppViewModel,
	val calendar: CalendarViewModel,
	val quickAdd: QuickAddViewModel,
	val signIn: SignInViewModel,
)
