package com.familyplanz.app.data

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

object ApiFactory {
	val json: Json = Json {
		ignoreUnknownKeys = true
		explicitNulls = false
		encodeDefaults = false
	}

	private val contentType = "application/json".toMediaType()

	/** Shared converter so tests verify requests with production settings. */
	private val jsonConverterFactory = json.asConverterFactory(contentType)

	fun createClient(tokenProvider: () -> String?): OkHttpClient =
		OkHttpClient.Builder()
			.connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
			.readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
			.addInterceptor { chain ->
				val token = tokenProvider()
				val request = if (token.isNullOrBlank()) {
					chain.request()
				} else {
					chain.request().newBuilder()
						.header("Authorization", "Bearer $token")
						.build()
				}
				chain.proceed(request)
			}
			.build()

	fun create(baseUrl: String, tokenProvider: () -> String?): FamilyPlanzApi =
		Retrofit.Builder()
			.baseUrl(baseUrl)
			.client(createClient(tokenProvider))
			.addConverterFactory(jsonConverterFactory)
			.build()
			.create(FamilyPlanzApi::class.java)
}
