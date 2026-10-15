import type { CatalogEntry } from '#lib/core/catalog.ts';

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | undefined>>();
const wanted = new Map<string, number>();
let tail: Promise<unknown> = Promise.resolve();

const IDLE_TIMEOUT = 500;
const MIN_GAP = 24;

function idle(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(() => {
			if (typeof requestIdleCallback === 'function') {
				requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT });
			} else resolve();
		}, MIN_GAP);
	});
}

export function cachedThumbnail(entry: CatalogEntry): string | undefined {
	return cache.get(entry.id);
}

export function loadThumbnail(entry: CatalogEntry): Promise<string | undefined> {
	const hit = cache.get(entry.id);
	if (hit) return Promise.resolve(hit);
	const running = pending.get(entry.id);
	if (running) return running;
	const job = tail
		.then(async () => {
			if (wanted.get(entry.id) === 0) return undefined;
			await idle();
			if (wanted.get(entry.id) === 0) return undefined;
			const { renderCatalogThumbnail } = await import('#lib/three/offscreen.ts');
			const url = await renderCatalogThumbnail(entry, 192);
			cache.set(entry.id, url);
			return url;
		})
		.catch(() => undefined)
		.finally(() => pending.delete(entry.id));
	tail = job;
	pending.set(entry.id, job);
	return job;
}

export function lazyThumbnail(
	node: HTMLElement,
	options: { entry: CatalogEntry; onload: (url: string) => void }
) {
	let current = options;
	let observer: IntersectionObserver | undefined;
	let holding: string | undefined;
	const release = () => {
		if (holding === undefined) return;
		wanted.set(holding, Math.max(0, (wanted.get(holding) ?? 1) - 1));
		holding = undefined;
	};
	const request = () => {
		release();
		holding = current.entry.id;
		wanted.set(holding, (wanted.get(holding) ?? 0) + 1);
		void loadThumbnail(current.entry).then((url) => {
			if (url) current.onload(url);
		});
	};
	const hit = cachedThumbnail(current.entry);
	if (hit) current.onload(hit);
	else if (typeof IntersectionObserver === 'undefined') request();
	else {
		observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer?.disconnect();
					request();
				}
			},
			{ rootMargin: '120px' }
		);
		observer.observe(node);
	}
	return {
		update(next: { entry: CatalogEntry; onload: (url: string) => void }) {
			current = next;
		},
		destroy() {
			observer?.disconnect();
			release();
		}
	};
}
