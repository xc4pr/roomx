import { cancelCleanup } from '#lib/state/cleanup.ts';
import { sharedBus, tabId } from '#lib/state/channel.ts';
import { db } from '#lib/state/db.ts';
import { store } from '#lib/state/project.svelte.ts';

export const LOCAL_KEY_PREFIX = 'roomx.';

type KeyStorage = Pick<Storage, 'length' | 'key' | 'removeItem'>;

export function clearPrefixedKeys(
	storage: KeyStorage | undefined,
	prefix = LOCAL_KEY_PREFIX
): number {
	if (!storage) return 0;
	const keys: string[] = [];
	for (let index = 0; index < storage.length; index++) {
		const key = storage.key(index);
		if (key !== null && key.startsWith(prefix)) keys.push(key);
	}
	for (const key of keys) storage.removeItem(key);
	return keys.length;
}

function browserStorage(read: () => Storage): Storage | undefined {
	try {
		return read();
	} catch {
		return undefined;
	}
}

export interface WipeTargets {
	storages?: readonly (KeyStorage | undefined)[];
	waitMs?: number;
}

export const WIPE_WAIT_MS = 200;

export async function wipeAllLocalData(targets: WipeTargets = {}): Promise<void> {
	store.abandon();
	cancelCleanup();
	sharedBus()?.post({ type: 'wiped', from: tabId });
	await new Promise<void>((resolve) => setTimeout(resolve, targets.waitMs ?? WIPE_WAIT_MS));
	await db.delete();
	const storages = targets.storages ?? [
		browserStorage(() => globalThis.localStorage),
		browserStorage(() => globalThis.sessionStorage)
	];
	for (const storage of storages) clearPrefixedKeys(storage);
}
