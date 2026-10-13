import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self as sw } from '$app/service-worker';

const CACHE = `roomx-${version}`;
const SHELL = '/';
const ASSETS = new Set([...immutable, ...assets].map((entry) => `/${entry.path}`));

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([SHELL, ...ASSETS])));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
			)
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('message', (event) => {
	if (event.data === 'skip-waiting') void sw.skipWaiting();
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (request.method !== 'GET' || url.origin !== sw.location.origin) return;
	if (url.pathname.startsWith('/api/')) return;
	const cached = ASSETS.has(url.pathname)
		? url.pathname
		: request.mode === 'navigate'
			? SHELL
			: null;
	if (!cached) return;
	event.respondWith(
		caches
			.open(CACHE)
			.then((cache) => cache.match(cached))
			.then((response) => response ?? fetch(request))
	);
});
