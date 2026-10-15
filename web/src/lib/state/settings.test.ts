import { beforeEach, describe, expect, it, vi } from 'vitest';

function memoryStorage(initial: Record<string, string>) {
	const items = new Map(Object.entries(initial));
	return {
		items,
		getItem: (key: string) => items.get(key) ?? null,
		setItem: (key: string, value: string) => void items.set(key, value)
	};
}

async function load(stored: string | undefined) {
	const storage = memoryStorage(stored === undefined ? {} : { 'roomx.settings': stored });
	vi.stubGlobal('localStorage', storage);
	vi.resetModules();
	const mod = await import('./settings.svelte.ts');
	return { storage, ...mod };
}

const legacyKey = 'coachMarksSeen';

beforeEach(() => {
	vi.unstubAllGlobals();
});

describe('settings storage', () => {
	it('drops unknown keys and keeps the new tour flag unset', async () => {
		const { settings, updateSettings, storage } = await load(
			JSON.stringify({ [legacyKey]: true, unit: 'mm', foo: 1 })
		);
		expect(settings.tourSeen).toBe(false);
		expect(settings.unit).toBe('mm');
		updateSettings({ deviceName: 'x' });
		const saved = JSON.parse(storage.items.get('roomx.settings') ?? '{}') as Record<
			string,
			unknown
		>;
		expect(saved).not.toHaveProperty(legacyKey);
		expect(saved).not.toHaveProperty('foo');
		expect(saved.unit).toBe('mm');
	});

	it.each(['not json', '[1,2]', '"text"', 'null', '42'])(
		'falls back to defaults for %s',
		async (raw) => {
			const { settings } = await load(raw);
			expect(settings.unit).toBe('cm');
			expect(settings.tourSeen).toBe(false);
		}
	);
});
