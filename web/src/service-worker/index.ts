import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self as sw } from '$app/service-worker';
import { respondFromCache, staleCaches } from './respond.ts';

const CACHE = `roomx-${version}`;
// The worker's scope is the app's base path ('/' on the own server, '/roomx/' on GitHub Pages).
const SCOPE = new URL(sw.registration.scope).pathname;
const SHELL = SCOPE;
const ASSETS = new Set([...immutable, ...assets].map((entry) => `${SCOPE}${entry.path}`));

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([SHELL, ...ASSETS])));
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(staleCaches(keys, CACHE).map((key) => caches.delete(key))))
			// A failed cleanup must not keep the worker from taking control.
			.catch(() => undefined)
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
	if (url.pathname.startsWith(`${SCOPE}api/`)) return;
	const cached = ASSETS.has(url.pathname)
		? url.pathname
		: request.mode === 'navigate'
			? SHELL
			: null;
	if (!cached) return;
	event.respondWith(respondFromCache(() => caches.open(CACHE), cached, request, fetch));
});
