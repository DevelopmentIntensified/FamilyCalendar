package com.familyplanz.app.push

import android.app.Application
import androidx.work.Configuration
import androidx.work.NetworkType
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.WorkManagerTestInitHelper
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** Issue #273: the WorkManager edge — one unique, network-bound job per kind; repeats collapse. */
@RunWith(RobolectricTestRunner::class)
class PushWorkTest {
	private val app: Application = RuntimeEnvironment.getApplication()
	private lateinit var work: WorkManager

	@Before
	fun setUp() {
		val config = Configuration.Builder().setExecutor(SynchronousExecutor()).build()
		WorkManagerTestInitHelper.initializeTestWorkManager(app, config)
		work = WorkManager.getInstance(app)
	}

	private fun pending(name: String): List<WorkInfo> =
		work.getWorkInfosForUniqueWork(name).get().filter { it.state == WorkInfo.State.ENQUEUED }

	@Test
	fun `events_changed bursts collapse into one network-bound refresh`() {
		val scheduler = WorkManagerEventsRefresh(app)
		repeat(3) { scheduler.enqueue() }

		val queued = pending(WorkManagerEventsRefresh.WORK_NAME)
		assertEquals(1, queued.size)
		assertEquals(NetworkType.CONNECTED, queued.single().constraints.requiredNetworkType)
	}

	@Test
	fun `failed registrations queue a single network-bound retry`() {
		val retry = WorkManagerRegisterRetry(app)
		retry.schedule("fcm-old")
		retry.schedule("fcm-new")

		val queued = pending(WorkManagerRegisterRetry.WORK_NAME)
		assertEquals(1, queued.size)
		assertEquals(NetworkType.CONNECTED, queued.single().constraints.requiredNetworkType)
	}
}
