package com.familyplanz.app.ui

/** Quick-add callbacks, grouped so screens pass one holder down. */
data class QuickAddActions(
	val onParse: (String) -> Unit,
	val onDismiss: () -> Unit,
	val onConfirm: () -> Unit,
	val onUpdateDraft: (DraftEdit) -> Unit,
)
