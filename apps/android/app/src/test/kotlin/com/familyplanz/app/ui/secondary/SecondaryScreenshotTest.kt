package com.familyplanz.app.ui.secondary

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import com.familyplanz.app.data.AdminCountsDto
import com.familyplanz.app.testing.fixturesArchive
import com.familyplanz.app.testing.fixturesArchiveGate
import com.familyplanz.app.testing.fixturesBugs
import com.familyplanz.app.testing.fixturesNlp
import com.familyplanz.app.testing.fixturesPreviewDto
import com.familyplanz.app.testing.fixturesPrint
import com.familyplanz.app.testing.fixturesStats
import com.familyplanz.app.ui.admin.AdminBugsScreen
import com.familyplanz.app.ui.admin.AdminHomeScreen
import com.familyplanz.app.ui.admin.AdminNlpScreen
import com.familyplanz.app.ui.admin.BugActions
import com.familyplanz.app.ui.admin.NlpActions
import com.familyplanz.app.ui.secondary.archive.ArchiveActions
import com.familyplanz.app.ui.secondary.archive.ArchiveScreen
import com.familyplanz.app.ui.secondary.importer.ImportActions
import com.familyplanz.app.ui.secondary.importer.ImportScreen
import com.familyplanz.app.ui.secondary.importer.ImportUiState
import com.familyplanz.app.ui.secondary.importer.importPreviewOf
import com.familyplanz.app.ui.secondary.print.PrintActions
import com.familyplanz.app.ui.secondary.print.PrintScreen
import com.familyplanz.app.ui.secondary.reportbug.ReportBugActions
import com.familyplanz.app.ui.secondary.reportbug.ReportBugScreen
import com.familyplanz.app.ui.secondary.reportbug.ReportBugUiState
import com.familyplanz.app.ui.secondary.stats.StatsScreen
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * #299 review shots: the nine native pages at the 390 dp reference width and at
 * 320 dp (the narrowest phone the app supports). PNGs land in
 * app/build/screenshots/299/ for the owner to open; the test itself is the
 * proof that every page composes at both widths.
 *
 * The capture draws the window onto a software canvas: Compose's own
 * `captureToImage()` goes through PixelCopy, which Robolectric cannot fill.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SecondaryScreenshotTest {
	@get:Rule
	val rule = createAndroidComposeRule<ComponentActivity>()

	private var page by mutableIntStateOf(0)

	private fun shots(width: String) {
		rule.setContent {
			FamilyPlanzTheme {
				Column(
					Modifier.fillMaxSize()
						.background(MaterialTheme.colorScheme.background)
						.verticalScroll(rememberScrollState())
						.padding(16.dp),
				) {
					render(page)
				}
			}
		}
		PAGES.forEachIndexed { index, name ->
			page = index
			rule.waitForIdle()
			save("${width}_$name")
		}
	}

	private fun save(name: String) {
		val view = rule.activity.window.decorView
		val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
		view.draw(Canvas(bitmap))
		val dir = File("build/screenshots/299").apply { mkdirs() }
		File(dir, "$name.png").outputStream().use { out ->
			bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
		}
	}

	@Composable
	private fun render(index: Int) {
		when (PAGES[index]) {
			"stats" -> StatsScreen(Load.Loaded(fixturesStats()), {})
			"archive" -> ArchiveScreen(Load.Loaded(fixturesArchive()), ArchiveActions())
			"archive-gate" -> ArchiveScreen(Load.Loaded(fixturesArchiveGate()), ArchiveActions())
			"report-bug" -> ReportBugScreen(
				ReportBugUiState(description = "Sunday events vanish from the month grid."),
				ReportBugActions(),
			)
			"import" -> ImportScreen(
				ImportUiState(pending = null, preview = importPreviewOf(fixturesPreviewDto())),
				ImportActions(),
			)
			"print" -> PrintScreen(Load.Loaded(fixturesPrint()), PrintActions())
			"admin" -> AdminHomeScreen(Load.Loaded(AdminCountsDto(3, 2)), {}, {}, {})
			"admin-bugs" -> AdminBugsScreen(Load.Loaded(fixturesBugs()), BugActions())
			else -> AdminNlpScreen(Load.Loaded(fixturesNlp()), NlpActions())
		}
	}

	@Test
	@Config(qualifiers = "w390dp-h844dp-xhdpi")
	fun the_pages_at_390dp() = shots("390dp")

	@Test
	@Config(qualifiers = "w320dp-h640dp-xhdpi")
	fun the_pages_at_320dp() = shots("320dp")

	private companion object {
		val PAGES = listOf("stats", "archive", "archive-gate", "report-bug", "import", "print", "admin", "admin-bugs", "admin-nlp")
	}
}
