export const appUpdate = $state<{ ready: boolean }>({ ready: false });

let waiting: ServiceWorker | null = null;

export function watchForUpdates(): void {
	if (!('serviceWorker' in navigator)) return;
	const hadController = navigator.serviceWorker.controller !== null;
	let reloading = false;
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (!hadController || reloading) return;
		reloading = true;
		location.reload();
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
	waiting?.postMessage('skip-waiting');
}
