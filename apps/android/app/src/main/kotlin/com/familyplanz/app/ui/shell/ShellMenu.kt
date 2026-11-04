package com.familyplanz.app.ui.shell

import androidx.compose.runtime.Composable
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute

/** Every menu row in order (nav rows, then secondary); admin rows come from [MENU_ADMIN_ROWS]. */
internal val MENU_ROWS: List<Pair<String, AppRoute>> =
	(MENU_NAV_ROWS + MENU_SECONDARY_ROWS).map { it.label to it.route }

/**
 * The S1a stand-in menu button. The shell's [FpNavbar] now carries the one
 * hamburger above every screen (#292 §2.1), so this renders nothing; lanes
 * can drop their `menu = { ShellMenuButton(nav) }` slot when they next touch it.
 */
@Suppress("UNUSED_PARAMETER")
@Composable
fun ShellMenuButton(nav: AppNav) = Unit
