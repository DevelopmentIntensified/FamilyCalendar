package com.familyplanz.app.data

/** Who the bearer token belongs to. */
interface AccountSource {
	suspend fun me(): ApiResult<MeDto>
}

class NetworkAccountSource(private val api: FamilyPlanzApi) : AccountSource {
	override suspend fun me(): ApiResult<MeDto> = apiCall { api.me() }
}
