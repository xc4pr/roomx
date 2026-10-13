import type { Language } from '#lib/core/units.ts';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(bytes: number, language: Language): string {
	let value = Math.max(0, bytes);
	let index = 0;
	while (value >= 1000 && index < UNITS.length - 1) {
		value /= 1000;
		index += 1;
	}
	const digits = index === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
	const text = value.toFixed(digits).replace(/\.?0+$/, (match) => (digits === 0 ? match : ''));
	return `${language === 'de' ? text.replace('.', ',') : text} ${UNITS[index]}`;
}

export type PersistState = 'persistent' | 'transient' | 'unsupported';

export interface StorageInfo {
	persist: PersistState;
	usage: number | null;
	quota: number | null;
}

export async function readStorage(request: boolean): Promise<StorageInfo> {
	const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
	if (!storage) return { persist: 'unsupported', usage: null, quota: null };
	let persist: PersistState = 'transient';
	try {
		let granted = (await storage.persisted?.()) ?? false;
		if (!granted && request && storage.persist) granted = await storage.persist();
		persist = granted ? 'persistent' : 'transient';
	} catch {
		persist = 'unsupported';
	}
	try {
		const estimate = await storage.estimate?.();
		return { persist, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null };
	} catch {
		return { persist, usage: null, quota: null };
	}
}

export async function requestPersistence(): Promise<boolean> {
	try {
		const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
		if (!storage?.persist) return false;
		if (await storage.persisted?.()) return true;
		return await storage.persist();
	} catch {
		return false;
	}
}
