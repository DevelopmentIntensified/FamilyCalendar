const CACHE_NAME = 'familyplanz-v1';
const DATA_CACHE_NAME = 'familyplanz-data-v1';
const DATA_CACHE_LIMIT = 60;
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

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (isDataUrl(url)) {
		event.respondWith(
			(async () => {
				try {
					const response = await fetch(request);
					if (response.ok) {
						const dataCache = await caches.open(DATA_CACHE_NAME);
						await dataCache.put(request, response.clone());
						event.waitUntil(trimDataCache());
					}
					return response;
				} catch (err) {
					const cached = await caches.match(request, { cacheName: DATA_CACHE_NAME });
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
