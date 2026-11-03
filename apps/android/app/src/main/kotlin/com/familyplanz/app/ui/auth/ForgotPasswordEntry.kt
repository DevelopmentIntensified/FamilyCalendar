package com.familyplanz.app.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.familyplanz.app.ui.FpCard
import com.familyplanz.app.ui.nav.AppNav
import com.familyplanz.app.ui.nav.AppRoute
import com.familyplanz.app.ui.shell.LocalAppModules

/**
 * /forgot-password reached while signed in (§2.13; Q7 default: native via
 * G12 `forgot`, the emailed link resets on the web). Signed out, the
 * sign-in card shows the same face through [SignInStep.FORGOT].
 */
@Composable
fun ForgotPasswordEntry(nav: AppNav) {
	val modules = LocalAppModules.current
	val vm = viewModel { modules.auth.forgotPasswordViewModel() }
	val state by vm.ui.collectAsStateWithLifecycle()
	Column(
		modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 64.dp),
		horizontalAlignment = Alignment.CenterHorizontally,
	) {
		FpCard(modifier = Modifier.widthIn(max = 448.dp).fillMaxWidth(), padding = PaddingValues(32.dp)) {
			AuthTitle("Reset Password", "Remember your password? ", "Log in", "") { nav.open(AppRoute.ACCOUNT) }
			var email by rememberSaveable { mutableStateOf(state.email) }
			Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
				state.error?.let { AuthAlert(it) }
				ForgotForm(state, email, { email = it }) { vm.requestCode(it) }
			}
		}
	}
}
