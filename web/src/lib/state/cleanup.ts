import { sharedBus, tabId, type TabBus } from './channel.ts';
import { db } from './db.ts';
import { pruneOrphanPhotos } from './persistence.ts';
import { browserLocks } from './tabs.ts';

export const CLEANUP_DELAY_MS = 30_000;
export const CLEANUP_RETRY_MS = 60_000;
export const CLEANUP_LOCK = 'roomx.cleanup';
export const PROJECT_LOCK_PREFIX = 'roomx.project.';
const PROBE_MS = 300;

interface HeldLock {
	name?: string;
	clientId?: string;
}

interface CleanupLocks {
	request(
		name: string,
		options: { ifAvailable: boolean },
		callback: (lock: object | null) => Promise<number | null>
	): Promise<number | null>;
	query(): Promise<{ held?: HeldLock[] }>;
}

function queryable(locks: unknown): locks is CleanupLocks {
	return (
		typeof locks === 'object' &&
		locks !== null &&
		typeof (locks as CleanupLocks).request === 'function' &&
		typeof (locks as CleanupLocks).query === 'function'
	);
}

async function otherTabHoldsProject(locks: CleanupLocks): Promise<boolean> {
	const held = (await locks.query()).held ?? [];
	const own = held.find((lock) => lock.name === CLEANUP_LOCK)?.clientId;
	return held.some(
		(lock) =>
			typeof lock.name === 'string' &&
			lock.name.startsWith(PROJECT_LOCK_PREFIX) &&
			(own === undefined || lock.clientId !== own)
	);
}

async function otherTabOwnsProject(bus: TabBus): Promise<boolean> {
	const ids = await db.projects.toCollection().primaryKeys();
	return new Promise<boolean>((resolve) => {
		const timer = setTimeout(() => {
			stop();
			resolve(false);
		}, PROBE_MS);
		const stop = bus.subscribe((message) => {
			if (message.type !== 'owner' || message.from === tabId) return;
			clearTimeout(timer);
			stop();
			resolve(true);
		});
		for (const id of ids) bus.post({ type: 'who', projectId: String(id), from: tabId });
	});
}

async function prune(): Promise<number | null> {
	const keep = await provider();
	return pruneOrphanPhotos({ keep });
}

async function pruneUnlessOtherTabs(): Promise<number | null> {
	const locks = browserLocks();
	if (queryable(locks)) {
		return locks.request(CLEANUP_LOCK, { ifAvailable: true }, async (lock) => {
			if (!lock || (await otherTabHoldsProject(locks))) return null;
			return prune();
		});
	}
	const bus = sharedBus();
	if (!bus || (await otherTabOwnsProject(bus))) return null;
	return prune();
}

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
			const removed = await pruneUnlessOtherTabs();
			if (removed === null) {
				scheduleCleanup(CLEANUP_RETRY_MS);
				return 0;
			}
			return removed;
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
