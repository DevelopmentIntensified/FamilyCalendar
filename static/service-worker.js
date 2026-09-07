const CACHE_NAME = 'familyplanz-v1';
const DATA_CACHE_NAME = 'familyplanz-data-v1';
const DATA_CACHE_LIMIT = 60;
/** Age cap for cached data (privacy audit #029 M2): 1 day. */
const DATA_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CACHED_AT_HEADER = 'x-cached-at';
const OFFLINE_URL = '/offline.html';
const IMMUTABLE_PREFIX = '/_app/immutable/';
const API_DATA_PREFIXES = ['/api/events', '/api/tasks'];

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_NAME);
			await cache.put(OFFLINE_URL, await fetch(OFFLINE_URL, { cache: 'no-cache' }));
			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => key !== CACHE_NAME && key !== DATA_CACHE_NAME)
					.map((key) => caches.delete(key))
			);
			await self.clients.claim();
		})()
	);
});

function isDataUrl(url) {
	return (
		API_DATA_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) ||
		url.pathname.includes('/__data.json')
	);
}

async function trimDataCache() {
	const cache = await caches.open(DATA_CACHE_NAME);
	const keys = await cache.keys();
	while (keys.length > DATA_CACHE_LIMIT) {
		const oldest = keys.shift();
		if (oldest) await cache.delete(oldest);
	}
}

/** Stamps a cache entry with its write time so stale entries can age out. */
function stampWithCachedAt(response) {
	const headers = new Headers(response.headers);
	headers.set(CACHED_AT_HEADER, String(Date.now()));
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

/** True when an entry is missing its stamp or older than the 1-day cap. */
async function isStale(cache, request) {
	const cached = await cache.match(request);
	if (!cached) return true;
	const cachedAt = Number(cached.headers.get(CACHED_AT_HEADER));
	// No stamp = written before the cap existed: purge it.
	return !Number.isFinite(cachedAt) || Date.now() - cachedAt > DATA_CACHE_MAX_AGE_MS;
}

/** Logs out everywhere the SW can see: drop all cached authed data. */
function purgeDataCache() {
	return caches.delete(DATA_CACHE_NAME);
}

self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'purge-data-cache') {
		event.waitUntil(purgeDataCache());
	}
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);

	// Logout (even the plain HTML form POST) clears the data cache so the
	// next user on this device never sees the previous one's events/tasks.
	if (
		request.method === 'POST' &&
		url.origin === self.location.origin &&
		url.pathname === '/api/logout'
	) {
		event.respondWith(
			(async () => {
				try {
					const response = await fetch(request);
					event.waitUntil(purgeDataCache());
					return response;
				} catch (err) {
					event.waitUntil(purgeDataCache());
					throw err;
				}
			})()
		);
		return;
	}

	if (request.method !== 'GET') return;

	if (url.origin !== self.location.origin) return;

	if (isDataUrl(url)) {
		event.respondWith(
			(async () => {
				try {
					const response = await fetch(request);
					if (response.ok) {
						const dataCache = await caches.open(DATA_CACHE_NAME);
						await dataCache.put(request, stampWithCachedAt(response.clone()));
						event.waitUntil(trimDataCache());
					}
					return response;
				} catch (err) {
					const dataCache = await caches.open(DATA_CACHE_NAME);
					// 1-day cap: stale cached data is dropped, not served.
					if (await isStale(dataCache, request)) {
						await dataCache.delete(request);
						throw err;
					}
					const cached = await dataCache.match(request);
					if (cached) return cached;
					throw err;
				}
			})()
		);
		return;
	}

	if (url.pathname.startsWith('/api/')) return;

	if (request.mode === 'navigate') {
		event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
		return;
	}

	if (url.pathname.startsWith(IMMUTABLE_PREFIX)) {
		event.respondWith(
			(async () => {
				const cached = await caches.match(request);
				if (cached) return cached;
				const response = await fetch(request);
				if (response.ok) {
					const cache = await caches.open(CACHE_NAME);
					cache.put(request, response.clone());
				}
				return response;
			})()
		);
	}
});

self.addEventListener('push', (event) => {
	let payload = {};
	try {
		payload = event.data ? event.data.json() : {};
	} catch {
		// Malformed push payloads fall back to the default notification body.
	}
	const title = payload.title || 'FamilyPlanz';
	event.waitUntil(
		self.registration.showNotification(title, {
			body: payload.body,
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			data: { link: payload.link || '/calendar' }
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const link = (event.notification.data && event.notification.data.link) || '/calendar';
	event.waitUntil(
		(async () => {
			const clientList = await self.clients.matchAll({
				type: 'window',
				includeUncontrolled: true
			});
			const client = clientList[0];
			if (client) {
				if ('navigate' in client) {
					await client.navigate(link);
				}
				await client.focus();
			} else {
				await self.clients.openWindow(link);
			}
		})()
	);
});
