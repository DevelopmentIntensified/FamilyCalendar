package com.familyplanz.app.ui.shell

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.familyplanz.app.R
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.theme.ChipTone
import com.familyplanz.app.ui.theme.FpMotion
import com.familyplanz.app.ui.theme.FpTheme
import com.familyplanz.app.ui.theme.FpWordmarkText
import com.familyplanz.app.ui.theme.Primary
import com.familyplanz.app.ui.theme.Slate
import com.familyplanz.app.ui.theme.rememberReducedMotion

const val NAVBAR_TAG = "navbar"
const val NAVBAR_LOGO_TAG = "navbar-logo"
const val MOBILE_MENU_TAG = "mobile-menu"
const val OPEN_MENU = "Open menu"
const val CLOSE_MENU = "Close menu"
const val GO_FORWARD = "Go forward"
const val NAVBAR_FORWARD_TAG = "navbar-forward"
const val LOGOUT = "Logout"

/**
 * Navbar.svelte at < 768 px: white, slate-200 bottom rule, `px-6 py-4`, the
 * 32 dp primary-600 Mark + "Family Planz" (`text-xl font-bold
 * text-slate-800`), and the 44 dp `rounded-lg` slate-600 hamburger. 44 +
 * 2×16 = 76 dp. The logo opens Calendar (owner Q4 default). [onForward] adds
 * the #304 forward button, shown only while a back step left something ahead.
 */
@Composable
fun FpNavbar(menuOpen: Boolean, onLogo: () -> Unit, onToggleMenu: () -> Unit, onForward: (() -> Unit)? = null) {
	Column(modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).testTag(NAVBAR_TAG)) {
		Row(
			modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp),
			verticalAlignment = Alignment.CenterVertically,
			horizontalArrangement = Arrangement.SpaceBetween,
		) {
			Row(
				modifier = Modifier
					.clip(MaterialTheme.shapes.small)
					.clickable(role = Role.Button, onClick = onLogo)
					.testTag(NAVBAR_LOGO_TAG),
				verticalAlignment = Alignment.CenterVertically,
				horizontalArrangement = Arrangement.spacedBy(8.dp),
			) {
				Icon(
					painterResource(R.drawable.ic_fp_calendar),
					contentDescription = null,
					tint = MaterialTheme.colorScheme.primary,
					modifier = Modifier.size(32.dp).testTag("navbar-mark"),
				)
				Text("Family Planz", style = FpWordmarkText, color = FpTheme.colors.wordmark, maxLines = 1)
			}
			NavbarActions(menuOpen, onToggleMenu, onForward)
		}
		HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
	}
}

/** The trailing buttons: the #304 forward chevron when a back step left something ahead, then the hamburger. */
@Composable
private fun NavbarActions(menuOpen: Boolean, onToggleMenu: () -> Unit, onForward: (() -> Unit)?) {
	Row(verticalAlignment = Alignment.CenterVertically) {
		// #304: shown only while a back step left something ahead.
		if (onForward != null) {
			Box(
				modifier = Modifier
					.size(44.dp)
					.clip(MaterialTheme.shapes.small)
					.clickable(role = Role.Button, onClick = onForward)
					.semantics { contentDescription = GO_FORWARD }
					.testTag(NAVBAR_FORWARD_TAG),
				contentAlignment = Alignment.Center,
			) {
				Icon(
					painterResource(R.drawable.ic_fp_chevron_right),
					contentDescription = null,
					tint = FpTheme.colors.textBody,
					modifier = Modifier.size(24.dp),
				)
			}
		}
		Box(
			modifier = Modifier
				.size(44.dp)
				.clip(MaterialTheme.shapes.small)
				.clickable(role = Role.Button, onClick = onToggleMenu)
				.semantics { contentDescription = if (menuOpen) CLOSE_MENU else OPEN_MENU },
			contentAlignment = Alignment.Center,
		) {
			Icon(
				painterResource(if (menuOpen) R.drawable.ic_fp_close else R.drawable.ic_fp_menu),
				contentDescription = null,
				tint = FpTheme.colors.textBody,
				modifier = Modifier.size(24.dp),
			)
		}
	}
}

/** One menu row: label and where it goes. */
data class MenuRow(val label: String, val route: AppRoute)

/** `loggedInNavItems` (`navItems.ts:73`): every destination but the bell-replaced Alerts. */
val MENU_NAV_ROWS: List<MenuRow> = listOf(
	MenuRow("Calendar", AppRoute.CALENDAR),
	MenuRow("Dashboard", AppRoute.DASHBOARD),
	MenuRow("Tasks", AppRoute.TASKS),
	MenuRow("Groceries", AppRoute.GROCERIES),
	MenuRow("Family", AppRoute.FAMILY),
)

/** `NavbarMobileMenu.svelte:47-81` secondary rows. */
val MENU_SECONDARY_ROWS: List<MenuRow> = listOf(
	MenuRow("Settings", AppRoute.ACCOUNT),
	MenuRow("Task Stats", AppRoute.STATS),
	MenuRow("Archive", AppRoute.ARCHIVE),
	MenuRow("Report a Bug", AppRoute.REPORT_BUG),
)

/** Shown only when `roles` holds "admin" (`NavbarMobileMenu.svelte:72`). */
val MENU_ADMIN_ROWS: List<MenuRow> = listOf(
	MenuRow("Admin", AppRoute.ADMIN_NLP),
	MenuRow("Bug Reports", AppRoute.ADMIN_BUGS),
)

/** What a menu row can do: go somewhere, or sign out. */
data class MenuActions(val onOpen: (AppRoute) -> Unit, val onLogout: () -> Unit)

/** Who the menu is showing for: is it open, which destination is current, is this an admin. */
data class MenuState(val open: Boolean, val active: AppRoute, val admin: Boolean)

/**
 * NavbarMobileMenu.svelte: slides open in 200 ms and pushes the content
 * down. Bell row, the nav rows (active `bg-primary-100 text-primary-700`),
 * a rule, the secondary rows (+ admin), a rule, and the full-width primary
 * "Logout". [MenuActions.onOpen] must also close the menu (the host does it).
 */
@Composable
fun FpMobileMenu(
	state: MenuState,
	actions: MenuActions,
	bell: @Composable () -> Unit,
	modifier: Modifier = Modifier,
) {
	val reduced = rememberReducedMotion()
	AnimatedVisibility(
		visible = state.open,
		modifier = modifier,
		enter = expandVertically(FpMotion.spec(FpMotion.MENU_SLIDE_MS, reduced)),
		exit = shrinkVertically(FpMotion.spec(FpMotion.MENU_SLIDE_MS, reduced)),
	) {
		Column(
			modifier = Modifier
				.fillMaxWidth()
				.background(MaterialTheme.colorScheme.surface)
				.verticalScroll(rememberScrollState())
				.testTag(MOBILE_MENU_TAG),
		) {
			Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
				Row(
					modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
					horizontalArrangement = Arrangement.End,
				) { bell() }
				HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
				MENU_NAV_ROWS.forEach { row -> NavRow(row, row.route == state.active) { actions.onOpen(row.route) } }
				HorizontalDivider(Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.outlineVariant)
				val secondary = if (state.admin) MENU_SECONDARY_ROWS + MENU_ADMIN_ROWS else MENU_SECONDARY_ROWS
				Column(modifier = Modifier.padding(top = 8.dp)) {
					secondary.forEach { row -> SecondaryRow(row) { actions.onOpen(row.route) } }
				}
				HorizontalDivider(Modifier.padding(top = 16.dp), color = MaterialTheme.colorScheme.outlineVariant)
				Text(
					LOGOUT,
					style = MaterialTheme.typography.bodyLarge,
					fontWeight = FontWeight.Medium,
					color = MaterialTheme.colorScheme.onPrimary,
					textAlign = TextAlign.Center,
					modifier = Modifier
						.padding(top = 12.dp)
						.fillMaxWidth()
						.heightIn(min = 44.dp)
						.clip(MaterialTheme.shapes.small)
						.background(MaterialTheme.colorScheme.primary)
						.clickable(role = Role.Button, onClick = actions.onLogout)
						.padding(horizontal = 12.dp, vertical = 10.dp),
				)
			}
			HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
		}
	}
}

/** Menu nav row tone: active `bg-primary-100 text-primary-700`, else transparent / slate-600. */
fun menuRowTone(active: Boolean): ChipTone =
	if (active) ChipTone(Primary.P100, Primary.P700) else ChipTone(Color.Transparent, Slate.S600)

@Composable
private fun NavRow(row: MenuRow, active: Boolean, onClick: () -> Unit) {
	val tone = menuRowTone(active)
	Text(
		row.label,
		style = MaterialTheme.typography.bodyLarge,
		fontWeight = FontWeight.Medium,
		color = tone.content,
		modifier = Modifier
			.fillMaxWidth()
			.heightIn(min = 44.dp)
			.clip(MaterialTheme.shapes.small)
			.background(tone.container)
			.selectable(selected = active, role = Role.Button, onClick = onClick)
			.padding(horizontal = 12.dp, vertical = 10.dp)
			.testTag("menu-row-${row.route.name.lowercase()}"),
	)
}

@Composable
private fun SecondaryRow(row: MenuRow, onClick: () -> Unit) {
	Text(
		row.label,
		style = MaterialTheme.typography.bodyMedium,
		color = FpTheme.colors.textBody,
		modifier = Modifier
			.fillMaxWidth()
			.heightIn(min = 44.dp)
			.clip(MaterialTheme.shapes.small)
			.clickable(role = Role.Button, onClick = onClick)
			.padding(horizontal = 12.dp, vertical = 12.dp),
	)
}
