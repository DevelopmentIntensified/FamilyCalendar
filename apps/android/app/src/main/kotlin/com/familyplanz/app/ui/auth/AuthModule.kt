package com.familyplanz.app.ui.auth

import com.familyplanz.app.AppServices

/** L5's DI seam for sign-in / sign-up (#288), built from [services]. */
class AuthModule(private val services: AppServices) {
	fun signInViewModel() = SignInViewModel(services.auth)
}
