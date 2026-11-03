package com.familyplanz.app.ui.shell

import androidx.compose.foundation.layout.Box
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute

/**
 * NavbarMobileMenu.svelte rows, minimal until L1's Navbar lands: the
 * destinations (Alerts sits behind the bell on the web, so it is not a row),
 * then "Settings" → Account and the secondary pages. Admin rows wait for the
 * admin role (G1). Choosing a row closes the menu (#253).
 */
internal val MENU_ROWS: List<Pair<String, AppRoute>> = listOf(
	"Calendar" to AppRoute.CALENDAR,
	"Dashboard" to AppRoute.DASHBOARD,
	"Tasks" to AppRoute.TASKS,
	"Groceries" to AppRoute.GROCERIES,
	"Family" to AppRoute.FAMILY,
	"Settings" to AppRoute.ACCOUNT,
	"Task Stats" to AppRoute.STATS,
	"Archive" to AppRoute.ARCHIVE,
	"Import" to AppRoute.IMPORT,
	"Print" to AppRoute.PRINT,
	"Report a Bug" to AppRoute.REPORT_BUG,
)

@Composable
fun ShellMenuButton(nav: AppNav) {
	var open by remember { mutableStateOf(false) }
	Box {
		IconButton(onClick = { open = !open }) {
			Icon(
				Icons.Filled.Menu,
				contentDescription = if (open) "Close menu" else "Open menu",
				tint = MaterialTheme.colorScheme.onSurfaceVariant,
			)
		}
		DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
			MENU_ROWS.forEach { (label, route) ->
				DropdownMenuItem(
					text = { Text(label) },
					onClick = {
						open = false
						nav.open(route)
					},
				)
			}
		}
	}
}
