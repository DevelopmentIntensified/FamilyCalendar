package com.familyplanz.app.ui.secondary.print

import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.data.PrintMonthDto
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.secondary.PageEffects
import com.familyplanz.app.ui.secondary.PageScaffold
import com.familyplanz.app.ui.shell.LocalAppModules

/** The menu's Print page (§2.14, G18): the fridge sheet, printed through the system print service. */
@Composable
fun PrintEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val vm = viewModel { modules.secondary.printViewModel() }
	val state by vm.ui.collectAsStateWithLifecycle()
	val context = LocalContext.current
	val printer = remember(context) { SheetPrinter(context) }
	PageEffects(vm)
	PageScaffold(PRINT_TITLE, nav) {
		PrintScreen(
			state,
			PrintActions(
				onRetry = vm::load,
				onBack = { nav.open(AppRoute.CALENDAR) },
				onShow = vm::show,
				onJumpToNow = vm::jumpToNow,
				onPrint = printer::print,
			),
		)
	}
}

/**
 * The web calls `window.print()`; here the sheet is laid out as A4-landscape
 * HTML in an off-screen WebView and handed to the system print service.
 */
internal class SheetPrinter(private val context: Context) {
	/** Held until the print job has its adapter, so the WebView is not collected mid-render. */
	private var web: WebView? = null

	fun print(month: PrintMonthDto) {
		val view = WebView(context)
		web = view
		view.webViewClient = object : WebViewClient() {
			override fun onPageFinished(page: WebView, url: String?) {
				val name = "${month.monthName} ${month.year} - Family Planz"
				val attributes = PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4.asLandscape()).build()
				(context.getSystemService(Context.PRINT_SERVICE) as PrintManager)
					.print(name, page.createPrintDocumentAdapter(name), attributes)
				web = null
			}
		}
		view.loadDataWithBaseURL(null, fridgeSheetHtml(month), "text/html", "utf-8", null)
	}
}
