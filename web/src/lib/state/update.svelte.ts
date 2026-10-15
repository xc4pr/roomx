import { store } from './project.svelte.ts';

export const appUpdate = $state<{ ready: boolean }>({ ready: false });

const FLUSH_TIMEOUT_MS = 4000;

let waiting: ServiceWorker | null = null;

// A reload must never cut off a pending save, but it must not hang on a stuck one either.
export async function afterPendingSaves(
	flush: () => Promise<void>,
	timeoutMs = FLUSH_TIMEOUT_MS
): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, timeoutMs);
	});
	try {
		await Promise.race([flush().catch(() => undefined), timeout]);
	} finally {
		clearTimeout(timer);
	}
}

export function watchForUpdates(): void {
	if (!('serviceWorker' in navigator)) return;
	const hadController = navigator.serviceWorker.controller !== null;
	let reloading = false;
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (!hadController || reloading) return;
		reloading = true;
		void afterPendingSaves(() => store.flush()).then(() => {
			if (store.hasUnsaved()) reloading = false;
			else location.reload();
		});
	});
	void navigator.serviceWorker.ready.then((registration) => {
		const offer = (worker: ServiceWorker | null) => {
			if (!worker || !navigator.serviceWorker.controller) return;
			waiting = worker;
			appUpdate.ready = true;
		};
		offer(registration.waiting);
		registration.addEventListener('updatefound', () => {
			const installing = registration.installing;
			installing?.addEventListener('statechange', () => {
				if (installing.state === 'installed') offer(installing);
			});
		});
	});
}

export function applyUpdate(): void {
	void afterPendingSaves(() => store.flush()).then(() => {
		if (!store.hasUnsaved()) waiting?.postMessage('skip-waiting');
	});
}
