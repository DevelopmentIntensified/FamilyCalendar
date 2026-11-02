package com.familyplanz.app.ui

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.compose.LifecycleResumeEffect

/** Whether event reminders can reach the user (issue #271). */
enum class NotificationAccess { GRANTED, ASK, BLOCKED }

/**
 * Inline rationale instead of a silent failure: ASK offers the system prompt
 * (API 33+), BLOCKED (refused / turned off in Settings) links to Settings.
 */
@Composable
fun ReminderPermissionBanner(
	access: NotificationAccess,
	onAllow: () -> Unit,
	onOpenSettings: () -> Unit,
	onDismiss: () -> Unit,
) {
	if (access == NotificationAccess.GRANTED) return
	val blocked = access == NotificationAccess.BLOCKED
	Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
		Column(modifier = Modifier.padding(12.dp)) {
			Text(
				text = if (blocked) "Event reminders are off" else "Get event reminders",
				style = MaterialTheme.typography.titleSmall,
			)
			Text(
				text = if (blocked) {
					"Notifications are blocked, so reminders won't show. Turn them on in Settings."
				} else {
					"Family Planz alerts you before events start, right on this phone."
				},
				style = MaterialTheme.typography.bodyMedium,
			)
			Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
				TextButton(onClick = onDismiss) { Text("Not now") }
				if (blocked) {
					TextButton(onClick = onOpenSettings) { Text("Open settings") }
				} else {
					TextButton(onClick = onAllow) { Text("Allow notifications") }
				}
			}
		}
	}
}

/** Stateful wrapper: checks on every resume (back from Settings) and remembers a refusal. */
@Composable
fun ReminderPermissionSlot() {
	val context = LocalContext.current
	var refused by rememberSaveable { mutableStateOf(false) }
	var dismissed by rememberSaveable { mutableStateOf(false) }
	var checks by rememberSaveable { mutableIntStateOf(0) }
	val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
		refused = !granted
		checks++
	}
	LifecycleResumeEffect(Unit) {
		checks++
		onPauseOrDispose { }
	}
	val enabled = remember(checks) { NotificationManagerCompat.from(context).areNotificationsEnabled() }
	val access = when {
		enabled -> NotificationAccess.GRANTED
		Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !refused -> NotificationAccess.ASK
		else -> NotificationAccess.BLOCKED
	}
	if (dismissed) return
	ReminderPermissionBanner(
		access = access,
		onAllow = {
			if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
				launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
			}
		},
		onOpenSettings = {
			context.startActivity(
				Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
					.putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
					.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
			)
		},
		onDismiss = { dismissed = true },
	)
}
