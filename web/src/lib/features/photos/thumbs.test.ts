import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { db } from '#lib/state/db.ts';
import type { Api } from '#lib/state/sync/api.ts';
import { ensurePhoto, setPhotoSource, setThumbnailer } from '#lib/state/sync/photos.ts';
import { sha256Hex } from './hash.ts';
import { ThumbCache } from './thumbs.svelte.ts';

async function settle(check: () => boolean): Promise<void> {
	await vi.waitFor(() => expect(check()).toBe(true), { timeout: 2000 });
}

describe('ThumbCache', () => {
	it('shows a placeholder offline and loads the photo once it arrives', async () => {
		const bytes = new Uint8Array([1, 2, 3, 4, 5]);
		const hash = await sha256Hex(bytes);
		const blob = new Blob([bytes], { type: 'image/jpeg' });
		setThumbnailer(async (source) => ({ thumbnail: source, w: 2, h: 2 }));
		setPhotoSource(null);
		const cache = new ThumbCache();
		cache.sync([hash]);
		await settle(() => cache.missing[hash] === true && !cache.fetching[hash]);
		expect(cache.urls[hash]).toBeUndefined();

		setPhotoSource({ getPhoto: async () => blob } as unknown as Api);
		expect(await ensurePhoto(hash)).toBe(true);
		await settle(() => cache.urls[hash] !== undefined);
		expect(cache.missing[hash]).toBeUndefined();
		expect(await db.photos.get(hash)).toBeDefined();

		cache.dispose();
		setPhotoSource(null);
		setThumbnailer(null);
	});
});
