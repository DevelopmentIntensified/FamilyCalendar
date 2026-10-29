package com.familyplanz.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Native app shell (issue #210, slice 1). Render-only state until the
 * session bootstrap slice lands: no invented data, no dummy features.
 */
class MainActivity : ComponentActivity() {
	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		enableEdgeToEdge()
		setContent {
			MaterialTheme {
				FamilyPlanzApp()
			}
		}
	}
}

@Composable
fun FamilyPlanzApp(modifier: Modifier = Modifier) {
	Scaffold(modifier = modifier.fillMaxSize()) { innerPadding ->
		Column(
			modifier = Modifier
				.fillMaxSize()
				.padding(innerPadding)
				.padding(horizontal = 24.dp),
			horizontalAlignment = Alignment.CenterHorizontally,
			verticalArrangement = Arrangement.Center,
		) {
			Text(
				text = "Family Planz",
				style = MaterialTheme.typography.headlineMedium,
				textAlign = TextAlign.Center,
			)
			Text(
				text = "Native Android app skeleton is running.",
				style = MaterialTheme.typography.bodyMedium,
				textAlign = TextAlign.Center,
			)
		}
	}
}

@Preview(showBackground = true)
@Composable
private fun FamilyPlanzAppPreview() {
	MaterialTheme {
		FamilyPlanzApp()
	}
}
