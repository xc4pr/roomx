import { pruneOrphanPhotos } from './persistence.ts';

export const CLEANUP_DELAY_MS = 30_000;

export type KeepProvider = () => Promise<ReadonlySet<string>> | ReadonlySet<string>;

let provider: KeepProvider = () => new Set();
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<number> | null = null;

export function setKeepProvider(next: KeepProvider): void {
	provider = next;
}

export function runCleanup(): Promise<number> {
	if (running) return running;
	running = (async () => {
		try {
			return await pruneOrphanPhotos({ keep: await provider() });
		} catch {
			return 0;
		} finally {
			running = null;
		}
	})();
	return running;
}

// Debounced so a burst of deletions, or a photo that is deleted and restored, is handled once.
export function scheduleCleanup(delay = CLEANUP_DELAY_MS): void {
	if (timer !== null) clearTimeout(timer);
	timer = setTimeout(() => {
		timer = null;
		void runCleanup();
	}, delay);
}

export function cancelCleanup(): void {
	if (timer !== null) clearTimeout(timer);
	timer = null;
}
