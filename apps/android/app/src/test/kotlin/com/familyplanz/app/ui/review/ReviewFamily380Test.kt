package com.familyplanz.app.ui.review

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.familyplanz.app.data.ActivityRowDto
import com.familyplanz.app.data.FamilyDetailDto
import com.familyplanz.app.data.FamilyDto
import com.familyplanz.app.data.RosterRowDto
import com.familyplanz.app.ui.family.FamilyDetailActions
import com.familyplanz.app.ui.family.FamilyDetailScreen
import com.familyplanz.app.ui.family.FamilyDetailState
import com.familyplanz.app.ui.theme.FamilyPlanzTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.Instant
import java.time.temporal.ChronoUnit

/** 380 dp review shot of the family detail page (#306): PNG lands in `build/screenshots/380/family-detail.png`. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ReviewFamily380Test {
	@get:Rule
	val rule = createAndroidComposeRule<ComponentActivity>()

	@Test
	@Config(qualifiers = "w380dp-h2600dp-xhdpi")
	fun the_family_detail_page_at_380dp() {
		rule.setContent { FamilyPlanzTheme { FamilyDetailScreen(state = familyState(), actions = FamilyDetailActions()) } }
		rule.waitForIdle()
		val view = rule.activity.window.decorView
		val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
		view.draw(Canvas(bitmap))
		val dir = File("build/screenshots/380").apply { mkdirs() }
		File(dir, "family-detail.png").outputStream().use { out -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, out) }
		rule.onNodeWithText("Recent Activity", ignoreCase = true).assertExists()
	}
}

@Suppress("LongParameterList")
private fun member(familyId: String, userId: String, first: String, last: String, email: String, role: String, memberType: String) =
	RosterRowDto(
		familyId = familyId,
		userId = userId,
		firstName = first,
		lastName = last,
		email = email,
		role = role,
		memberType = memberType,
	)

@Suppress("LongParameterList")
private fun activity(kind: String, title: String, actor: String, ago: Long, unit: ChronoUnit, target: String? = null) =
	ActivityRowDto(
		kind = kind,
		title = title,
		actorName = actor,
		targetName = target,
		at = Instant.now().minus(ago, unit).toString(),
	)

private fun familyState(): FamilyDetailState.Ready = FamilyDetailState.Ready(
	detail = FamilyDetailDto(
		family = FamilyDto(id = "fam-1", name = "Smiths"),
		members = listOf(
			member("fam-1", "u-admin", "Sam", "Smith", "sam@example.com", "creator", "adult"),
			member("fam-1", "u-ada", "Ada", "Smith", "ada@example.com", "admin", "adult"),
			member("fam-1", "u-mia", "Mia", "Smith", "mia@example.com", "member", "child"),
		),
		currentUserRole = "admin",
		currentUserId = "u-admin",
		activity = listOf(
			activity("completed", "Mow lawn", "Sam", 5, ChronoUnit.MINUTES),
			activity(
				"completed",
				"Take the recycling, the glass and the cardboard out to the kerb before the truck comes",
				"Ada",
				2,
				ChronoUnit.HOURS,
			),
			activity("assigned", "Mow lawn", "Sam", 3, ChronoUnit.DAYS, target = "Ada"),
			activity("assigned", "Dishes", "Ada", 20, ChronoUnit.DAYS, target = "Sam"),
		),
	),
	name = "Smiths",
	color = "#3b82f6",
)
