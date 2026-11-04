package com.familyplanz.app.ui.secondary.print

import com.familyplanz.app.data.PrintMonthDto
import com.familyplanz.app.data.PrintMonthRef
import java.time.Month
import java.time.format.TextStyle
import java.util.Locale

/** Weekday headers for the user's week start (`WEEKDAY_LABELS` of `print/+page.svelte`). */
fun weekdayLabels(weekStart: String): List<String> {
	val sunday = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
	return if (weekStart == "monday") sunday.drop(1) + sunday.first() else sunday
}

/** "Oct" for the prev/next buttons. */
fun shortMonth(ref: PrintMonthRef): String = Month.of(ref.month.coerceIn(1, 12)).getDisplayName(TextStyle.SHORT, Locale.ENGLISH)

/** The sheet's subtitle: "{family} · Personal" or "Personal Calendar". */
fun sheetSubtitle(familyName: String?): String = if (familyName != null) "$familyName · Personal" else "Personal Calendar"

/** Items drawn per day before "+N". */
const val PRINT_MAX_ITEMS = 3

private fun String.escapeHtml(): String =
	replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

/** A CSS colour the server sent, or slate-400 if it is not a plain hex/name (it lands inside a style attribute). */
private fun safeColor(raw: String): String = if (Regex("^#[0-9a-fA-F]{3,8}$").matches(raw)) raw else "#94a3b8"

/**
 * The fridge sheet as one A4-landscape HTML page, for the system print
 * service (the web's `window.print()` with its `@media print` rules).
 */
fun fridgeSheetHtml(month: PrintMonthDto): String {
	val labels = weekdayLabels(month.weekStart).joinToString("") { "<div class=\"dow\">${it.escapeHtml()}</div>" }
	val cells = month.grid.joinToString("") { cell ->
		val shown = cell.items.take(PRINT_MAX_ITEMS).joinToString("") { item ->
			val time = if (!item.allDay && item.time != null) "<span class=\"t\">${item.time.escapeHtml()} </span>" else ""
			"<li><i style=\"background:${safeColor(item.color)}\"></i><span>$time${item.title.escapeHtml()}</span></li>"
		}
		val more = if (cell.items.size > PRINT_MAX_ITEMS) "<em>+${cell.items.size - PRINT_MAX_ITEMS}</em>" else ""
		val cls = listOfNotNull(if (!cell.inMonth) "out" else null, if (cell.isToday) "today" else null).joinToString(" ")
		"<div class=\"cell $cls\"><div class=\"d\"><b>${cell.day}</b>$more</div><ul>$shown</ul></div>"
	}
	return """
		<!doctype html><html><head><meta charset="utf-8"><title>${month.monthName.escapeHtml()} ${month.year} - Print</title>
		<style>
		@page { size: A4 landscape; margin: 8mm; }
		body { font-family: sans-serif; margin: 0; color: #0f172a; }
		h1 { text-align: center; font-size: 28px; font-weight: 900; margin: 0; }
		p.sub { text-align: center; font-size: 10px; letter-spacing: .25em; text-transform: uppercase; color: #94a3b8; margin: 2px 0 6px; }
		.grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: #94a3b8; border: 1px solid #94a3b8; }
		.dow { background: #e2e8f0; text-align: center; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 0; color: #64748b; }
		.cell { background: #fff; height: 22mm; padding: 2px; overflow: hidden; }
		.cell.out { background: #f8fafc; }
		.cell.today { outline: 2px solid #ee9459; outline-offset: -2px; }
		.d { display: flex; justify-content: space-between; font-size: 11px; }
		.d em { font-size: 9px; color: #94a3b8; font-style: normal; font-weight: 600; }
		ul { list-style: none; margin: 0; padding: 0; }
		li { display: flex; gap: 3px; font-size: 11px; font-weight: 600; line-height: 1.15; margin-top: 2px; }
		li i { width: 8px; height: 8px; border-radius: 50%; margin-top: 3px; flex: none; -webkit-print-color-adjust: exact; }
		li .t { font-weight: 400; color: #64748b; }
		footer { text-align: center; font-size: 10px; color: #cbd5e1; margin-top: 4px; }
		</style></head><body>
		<h1>${month.monthName.escapeHtml()} ${month.year}</h1>
		<p class="sub">${sheetSubtitle(month.familyName).escapeHtml()}</p>
		<div class="grid">$labels$cells</div>
		<footer>familyplanz.com</footer>
		</body></html>
	""".trimIndent()
}
