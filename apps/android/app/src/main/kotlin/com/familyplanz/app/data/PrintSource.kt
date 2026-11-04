package com.familyplanz.app.data

import kotlinx.serialization.Serializable
import retrofit2.http.GET
import retrofit2.http.Query

/** One chip on a day: [time] is the short fridge time ("9a", "2:30p") or null for all-day. */
@Serializable
data class PrintItemDto(
	val title: String = "",
	val color: String = "",
	val allDay: Boolean = false,
	val time: String? = null,
)

@Serializable
data class PrintCellDto(
	val day: Int = 0,
	val iso: String = "",
	val inMonth: Boolean = false,
	val isToday: Boolean = false,
	val items: List<PrintItemDto> = emptyList(),
)

@Serializable
data class PrintMonthRef(val year: Int = 0, val month: Int = 0)

/** `GET /api/print` (G18): the printable month, whole weeks, first cell = the user's week start. */
@Serializable
data class PrintMonthDto(
	val year: Int = 0,
	val month: Int = 0,
	val monthName: String = "",
	val weekStart: String = "sunday",
	val familyName: String? = null,
	val grid: List<PrintCellDto> = emptyList(),
	val prev: PrintMonthRef = PrintMonthRef(),
	val next: PrintMonthRef = PrintMonthRef(),
	val isCurrentMonth: Boolean = false,
)

internal interface PrintApi {
	@GET("api/print")
	suspend fun print(@Query("year") year: Int?, @Query("month") month: Int?): PrintMonthDto
}

/** The Print page's month; null year/month = the current month. */
interface PrintSource {
	suspend fun month(year: Int?, month: Int?): ApiResult<PrintMonthDto>
}

internal class NetworkPrintSource(private val api: PrintApi) : PrintSource {
	override suspend fun month(year: Int?, month: Int?): ApiResult<PrintMonthDto> = apiCall { api.print(year, month) }
}
