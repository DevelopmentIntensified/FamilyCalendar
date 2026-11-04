package com.familyplanz.app.ui.secondary.print

import com.familyplanz.app.data.PrintMonthRef
import com.familyplanz.app.testing.fixturesPrint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** #299: the fridge sheet's labels and the A4 HTML handed to the system print service. */
class PrintModelTest {
	@Test
	fun the_weekday_header_follows_the_user_week_start() {
		assertEquals(listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"), weekdayLabels("sunday"))
		assertEquals(listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"), weekdayLabels("monday"))
	}

	@Test
	fun month_buttons_and_the_subtitle_read_as_the_page_writes_them() {
		assertEquals("Oct", shortMonth(PrintMonthRef(2026, 10)))
		assertEquals("Dec", shortMonth(PrintMonthRef(2026, 12)))
		assertEquals("Personal Calendar", sheetSubtitle(null))
		assertEquals("The Smiths · Personal", sheetSubtitle("The Smiths"))
	}

	@Test
	fun the_html_prints_a4_landscape_with_the_month_the_week_and_the_overflow_count() {
		val html = fridgeSheetHtml(fixturesPrint())

		assertTrue(html.contains("@page { size: A4 landscape"))
		assertTrue(html.contains("<h1>November 2026</h1>"))
		assertTrue(html.contains("The Smiths · Personal"))
		assertTrue(html.contains("<em>+2</em>"))
		assertTrue(html.contains("familyplanz.com"))
		assertEquals(7, Regex("class=\"dow\"").findAll(html).count())
	}

	@Test
	fun titles_and_colours_are_escaped_before_they_land_in_the_sheet() {
		val month = fixturesPrint().let { base ->
			base.copy(
				monthName = "Nov <script>",
				familyName = "A & B",
				grid = base.grid.mapIndexed { i, cell ->
					if (i == 0) cell.copy(items = listOf(cell.items.first().copy(title = "\"Milk\" & <b>bread</b>", color = "red; background:url(x)"))) else cell
				},
			)
		}

		val html = fridgeSheetHtml(month)

		assertFalse(html.contains("<script>"))
		assertTrue(html.contains("Nov &lt;script&gt;"))
		assertTrue(html.contains("A &amp; B"))
		assertTrue(html.contains("&quot;Milk&quot; &amp; &lt;b&gt;bread&lt;/b&gt;"))
		assertFalse(html.contains("red; background:url(x)"))
		assertTrue(html.contains("background:#94a3b8"))
	}

	@Test
	fun a_timed_item_keeps_its_short_time_and_an_all_day_item_has_none() {
		val mixed = fixturesPrint().grid.first { it.items.size > 1 }
		val timed = mixed.items.first { !it.allDay }
		val allDay = mixed.items.first { it.allDay }

		assertEquals("9a Item 2", itemText(timed).text)
		assertEquals("Item 1", itemText(allDay).text)
	}
}
