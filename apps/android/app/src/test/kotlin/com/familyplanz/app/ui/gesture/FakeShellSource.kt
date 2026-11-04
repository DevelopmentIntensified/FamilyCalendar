package com.familyplanz.app.ui.gesture

import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.ui.shell.NotificationsResponse
import com.familyplanz.app.ui.shell.ShellMeDto
import com.familyplanz.app.ui.shell.ShellSource

/** In-memory [ShellSource] (#292 L1): every answer is a settable field, every call is counted. */
class FakeShellSource : ShellSource {
	var notificationsResult: ApiResult<NotificationsResponse> = ApiResult.Ok(NotificationsResponse())
	var meResult: ApiResult<ShellMeDto> = ApiResult.Ok(ShellMeDto(id = "u-1", emailVerified = true))
	var defaultViewResult: ApiResult<String?> = ApiResult.Ok(null)
	var verifyResult: ApiResult<Unit> = ApiResult.Ok(Unit)
	var resendResult: ApiResult<Unit> = ApiResult.Ok(Unit)
	var markResult: ApiResult<Unit> = ApiResult.Ok(Unit)

	/** AC-SH-4: the badge refetches on mount, on every route change and on resume. */
	var badgeReads = 0
	var meReads = 0
	var resends = 0
	var markedAll = 0
	val verifyCodes = mutableListOf<String>()
	val markedRead = mutableListOf<String>()

	override suspend fun notifications(): ApiResult<NotificationsResponse> {
		badgeReads++
		return notificationsResult
	}

	override suspend fun markRead(id: String): ApiResult<Unit> {
		markedRead += id
		return markResult
	}

	override suspend fun markAllRead(): ApiResult<Unit> {
		markedAll++
		return markResult
	}

	override suspend fun me(): ApiResult<ShellMeDto> {
		meReads++
		return meResult
	}

	override suspend fun defaultView(): ApiResult<String?> = defaultViewResult

	override suspend fun verifyEmail(code: String): ApiResult<Unit> {
		verifyCodes += code
		return verifyResult
	}

	override suspend fun resendVerifyEmail(): ApiResult<Unit> {
		resends++
		return resendResult
	}
}
