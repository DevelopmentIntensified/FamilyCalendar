# 268 — Android: background refresh of the offline cache (WorkManager)

Status: done

Source: #210 finish pass 2026-11-02.

## Evidence

#210 slice 6 shipped a file cache filled only while the app is open. Sync contract stays full refresh (no `tasks.updated_at`; delta sync deferred).

## Done

- `androidx.work:work-runtime-ktx:2.12.0` (latest stable on maven.google.com).
- `sync/CacheRefresher.kt`: plain decision class over `CacheRefreshSource` (`allTasks()` +
  `monthEvents(year, month)` only; repository write-through fills the file cache). No/blank token ->
  `SKIPPED_NO_TOKEN` (no calls); 401 -> `UNAUTHORIZED` (stops, nothing cleared); network/5xx ->
  `RETRY`; other 4xx -> `FAILED`; a tasks network failure still refreshes events; worst outcome wins.
- `sync/RefreshWorker.kt`: `CoroutineWorker` wiring `NetworkTaskRepository` + `FileTaskCache`;
  outcome -> `Result` (401/skip = success, so no retry storm; RETRY = `Result.retry()` backoff).
  `BackgroundRefresh.schedule()` enqueues unique periodic work `fp-cache-refresh` every 6h, KEEP,
  constraints network CONNECTED + battery not low. Called once from `MainActivity.onCreate`.
- Tests (written first, seen red 9/9): `CacheRefresherTest` (10 cases, fake source) +
  `RefreshWorkResultTest` (outcome -> Result table).

## Needs doing

(none)
