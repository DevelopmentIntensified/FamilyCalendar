package com.familyplanz.app.ui.admin

import android.os.Looper
import com.familyplanz.app.data.ApiError
import com.familyplanz.app.data.ApiResult
import com.familyplanz.app.testing.FakeAdminSource
import com.familyplanz.app.testing.fixturesBugs
import com.familyplanz.app.ui.secondary.Load
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/** #299: the admin registers over a fake source, including the optimistic Resolve and its rollback. */
@RunWith(RobolectricTestRunner::class)
class AdminViewModelTest {
	private val source = FakeAdminSource()

	private fun idle() = shadowOf(Looper.getMainLooper()).idle()

	@Test
	fun the_home_page_loads_the_two_open_counts() {
		val vm = AdminViewModel(source)
		idle()

		assertEquals(3, (vm.ui.value as Load.Loaded).value.openBugs)
		assertEquals(2, (vm.ui.value as Load.Loaded).value.openPhrases)
	}

	@Test
	fun the_bug_register_loads_the_badges_from_the_counts_and_the_register_from_bugs() {
		val vm = AdminBugsViewModel(source)
		idle()

		assertEquals(AdminBadges(bugs = 3, phrases = 2), vm.badges.value)
		assertEquals(listOf("b1"), (vm.ui.value as Load.Loaded).value.open.map { it.id })
	}

	@Test
	fun resolving_a_bug_moves_it_to_resolved_at_once_and_keeps_it_on_success() {
		val vm = AdminBugsViewModel(source)
		idle()
		val gate = CompletableDeferred<Unit>()
		source.resolveGate = gate

		vm.resolve("b1")
		idle()

		val optimistic = vm.ui.value as Load.Loaded
		assertTrue(optimistic.value.open.isEmpty())
		assertEquals(listOf("b1", "b0"), optimistic.value.resolved.map { it.id })
		assertEquals(2, vm.badges.value.bugs)

		gate.complete(Unit)
		idle()
		assertEquals(2, vm.badges.value.bugs)
		assertEquals(listOf("b1"), source.resolvedBugs)
	}

	@Test
	fun a_refused_resolve_puts_the_report_back_and_says_so() {
		source.resolveBugResult = ApiResult.Err(ApiError.Forbidden("Admins only"))
		val vm = AdminBugsViewModel(source)
		idle()

		vm.resolve("b1")
		idle()

		val state = vm.ui.value as Load.Loaded
		assertEquals(listOf("b1"), state.value.open.map { it.id })
		assertEquals(3, vm.badges.value.bugs)
		assertEquals("Couldn't resolve that report — try again.", vm.snack.value)
	}

	@Test
	fun a_bug_not_in_the_open_list_is_ignored() {
		val vm = AdminBugsViewModel(source)
		idle()

		vm.resolve("missing")
		idle()

		assertTrue(source.resolvedBugs.isEmpty())
		assertEquals(fixturesBugs().open.size, (vm.ui.value as Load.Loaded).value.open.size)
	}

	@Test
	fun resolving_a_phrase_moves_it_to_resolved_and_a_refusal_rolls_it_back() {
		val vm = AdminNlpViewModel(source)
		idle()
		source.resolvePhraseResult = ApiResult.Err(ApiError.Server("boom"))

		vm.resolve("p1")
		idle()

		val state = vm.ui.value as Load.Loaded
		assertEquals(listOf("p1", "p2", "p3"), state.value.phrases.map { it.id })
		assertEquals(1, state.value.resolved.size)
		assertEquals("Couldn't resolve that phrase — try again.", vm.snack.value)
		assertEquals(2, vm.badges.value.phrases)
	}

	@Test
	fun a_failed_register_load_keeps_the_counts_from_loading_and_fails_inline() {
		source.bugsResult = ApiResult.Err(ApiError.Network("timeout"))
		val vm = AdminBugsViewModel(source)
		idle()

		assertTrue(vm.ui.value is Load.Failed)
		assertEquals(AdminBadges(bugs = 3, phrases = 2), vm.badges.value)
	}
}
