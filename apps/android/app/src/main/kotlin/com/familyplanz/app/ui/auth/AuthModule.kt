package com.familyplanz.app.ui.auth

import com.familyplanz.app.AppServices

/** L5's DI seam for sign-in / sign-up / forgot password (#288, #292 §2.13), built from [services]. */
class AuthModule(private val services: AppServices) {
	fun signInViewModel() = SignInViewModel(services.auth)

	/** The signed-in /forgot-password page: the same machine, opened on its forgot face. */
	fun forgotPasswordViewModel() = SignInViewModel(services.auth).apply { showStep(SignInStep.FORGOT) }
}
