package com.familyplanz.app.ui.shell

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.familyplanz.app.ui.FpEmptyState
import com.familyplanz.app.ui.FpHeader
import com.familyplanz.app.ui.nav.AppNav

const val COMING_SOON = "Coming soon"

/** Placeholder a lane's entry shows until its screen lands (#292 L2–L5 replace it). */
@Composable
fun ComingSoonScreen(title: String, nav: AppNav) {
	Column(modifier = Modifier.fillMaxSize()) {
		FpHeader(title) { ShellMenuButton(nav) }
		FpEmptyState(title = COMING_SOON, hint = "$title is on its way to the app. The website has it today.")
	}
}
