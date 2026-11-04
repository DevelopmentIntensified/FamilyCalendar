package com.familyplanz.app.testing

import com.familyplanz.app.data.AdminBugsDto
import com.familyplanz.app.data.AdminCountsDto
import com.familyplanz.app.data.AdminNlpDto
import com.familyplanz.app.data.AdminSource
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.data.ArchiveResponse
import com.familyplanz.app.data.ArchiveSource
import com.familyplanz.app.data.BugReportRequest
import com.familyplanz.app.data.BugReportSource
import com.familyplanz.app.data.ImportCalendarDto
import com.familyplanz.app.data.ImportCommitDto
import com.familyplanz.app.data.ImportCommitRequest
import com.familyplanz.app.data.ImportPreviewDto
import com.familyplanz.app.data.ImportPreviewRequest
import com.familyplanz.app.data.ImportSource
import com.familyplanz.app.data.ImportUndoDto
import com.familyplanz.app.data.ImportUndoRequest
import com.familyplanz.app.data.PrintMonthDto
import com.familyplanz.app.data.PrintSource
import com.familyplanz.app.data.StatsResponse
import com.familyplanz.app.data.StatsSource

/**
 * #299: the network edge of the secondary and admin pages, faked at the
 * source interfaces so the ViewModels and screens run their real logic.
 */
class FakeStatsSource(var result: ApiResult<StatsResponse> = ApiResult.Ok(fixturesStats())) : StatsSource {
	var calls = 0

	override suspend fun stats(): ApiResult<StatsResponse> {
		calls++
		return result
	}
}

class FakeArchiveSource(var result: ApiResult<ArchiveResponse> = ApiResult.Ok(fixturesArchive())) : ArchiveSource {
	var calls = 0

	override suspend fun archive(): ApiResult<ArchiveResponse> {
		calls++
		return result
	}
}

class FakeBugReportSource(var result: ApiResult<Unit> = ApiResult.Ok(Unit)) : BugReportSource {
	val requests = mutableListOf<BugReportRequest>()

	override suspend fun submit(request: BugReportRequest): ApiResult<Unit> {
		requests += request
		return result
	}
}

class FakeImportSource(
	var calendarResult: ApiResult<List<ImportCalendarDto>> = ApiResult.Ok(
		listOf(ImportCalendarDto("c1", "Personal Calendar"), ImportCalendarDto("c2", "Family")),
	),
	var previewResult: ApiResult<ImportPreviewDto> = ApiResult.Ok(fixturesPreviewDto()),
	var commitResult: ApiResult<ImportCommitDto> = ApiResult.Ok(fixturesCommit()),
	var undoResult: ApiResult<ImportUndoDto> = ApiResult.Ok(ImportUndoDto("Personal Calendar", removed = 2)),
) : ImportSource {
	val previews = mutableListOf<ImportPreviewRequest>()
	val commits = mutableListOf<ImportCommitRequest>()
	val undos = mutableListOf<ImportUndoRequest>()

	override suspend fun calendars(): ApiResult<List<ImportCalendarDto>> = calendarResult

	override suspend fun preview(request: ImportPreviewRequest): ApiResult<ImportPreviewDto> {
		previews += request
		return previewResult
	}

	override suspend fun commit(request: ImportCommitRequest): ApiResult<ImportCommitDto> {
		commits += request
		return commitResult
	}

	override suspend fun undo(request: ImportUndoRequest): ApiResult<ImportUndoDto> {
		undos += request
		return undoResult
	}
}

class FakePrintSource(var result: ApiResult<PrintMonthDto> = ApiResult.Ok(fixturesPrint())) : PrintSource {
	val requests = mutableListOf<Pair<Int?, Int?>>()

	override suspend fun month(year: Int?, month: Int?): ApiResult<PrintMonthDto> {
		requests += year to month
		return result
	}
}

class FakeAdminSource(
	var countsResult: ApiResult<AdminCountsDto> = ApiResult.Ok(AdminCountsDto(openBugs = 3, openPhrases = 2)),
	var bugsResult: ApiResult<AdminBugsDto> = ApiResult.Ok(fixturesBugs()),
	var nlpResult: ApiResult<AdminNlpDto> = ApiResult.Ok(fixturesNlp()),
	var resolveBugResult: ApiResult<Unit> = ApiResult.Ok(Unit),
	var resolvePhraseResult: ApiResult<Unit> = ApiResult.Ok(Unit),
) : AdminSource {
	/** When set, a resolve suspends until completed (lets a test see the optimistic row move). */
	var resolveGate: kotlinx.coroutines.CompletableDeferred<Unit>? = null

	val resolvedBugs = mutableListOf<String>()
	val resolvedPhrases = mutableListOf<String>()

	override suspend fun counts(): ApiResult<AdminCountsDto> = countsResult

	override suspend fun bugs(): ApiResult<AdminBugsDto> = bugsResult

	override suspend fun resolveBug(id: String): ApiResult<Unit> {
		resolvedBugs += id
		resolveGate?.await()
		return resolveBugResult
	}

	override suspend fun nlp(): ApiResult<AdminNlpDto> = nlpResult

	override suspend fun resolvePhrase(id: String): ApiResult<Unit> {
		resolvedPhrases += id
		resolveGate?.await()
		return resolvePhraseResult
	}
}
