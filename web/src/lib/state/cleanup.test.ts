import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Photo } from '#lib/core/schema.ts';
import { useBus, type TabBus, type TabMessage } from './channel.ts';
import {
	CLEANUP_DELAY_MS,
	CLEANUP_LOCK,
	CLEANUP_RETRY_MS,
	cancelCleanup,
	runCleanup,
	scheduleCleanup,
	setKeepProvider
} from './cleanup.ts';
import { db, type StoredPhoto } from './db.ts';
import { getPhoto, ORPHAN_MIN_AGE_MS, putPhoto, pruneOrphanPhotos } from './persistence.ts';
import { createProject, ProjectStore } from './project.svelte.ts';

const photoOf = (hash: string, id = `photo-${hash[0]}`): Photo => ({
	id,
	hash,
	perspective: { kind: 'free', caption: { de: 'Foto', en: 'Photo' } },
	w: 10,
	h: 10,
	takenAt: '2026-10-01T00:00:00.000Z'
});

const stored = (hash: string, storedAt?: number): StoredPhoto => ({
	hash,
	blob: new Blob(['x'], { type: 'image/jpeg' }),
	thumbnail: new Blob(['y'], { type: 'image/jpeg' }),
	w: 10,
	h: 10,
	uploaded: false,
	storedAt
});

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

async function openWithPhoto() {
	const store = new ProjectStore();
	const id = await createProject('Wohnung');
	await store.open(id);
	const roomId = store.addRoom('Raum');
	store.addPhoto(roomId, photoOf(A));
	await store.flush();
	await db.photos.put(stored(A, 0));
	return { store, id, roomId };
}

interface Held {
	name: string;
	clientId: string;
}

function stubLocks(others: Held[] = [], available = true) {
	const request = vi.fn(
		async (name: string, _options: unknown, callback: (lock: object | null) => Promise<unknown>) =>
			available ? callback({ name }) : callback(null)
	);
	const query = vi.fn(async () => ({
		held: [{ name: CLEANUP_LOCK, clientId: 'me' }, ...others]
	}));
	vi.stubGlobal('navigator', { locks: { request, query } });
	return { request, query };
}

beforeEach(async () => {
	stubLocks();
	cancelCleanup();
	await Promise.all(db.tables.map((table) => table.clear()));
});

afterEach(() => {
	vi.unstubAllGlobals();
	useBus(null);
	cancelCleanup();
	setKeepProvider(() => new Set());
	vi.useRealTimers();
});

describe('pruneOrphanPhotos', () => {
	it('removes blobs that no project refers to', async () => {
		await db.photos.bulkPut([stored(A, 0), stored(B, 0)]);
		const { store, roomId } = await openWithPhoto();
		store.addPhoto(roomId, photoOf(B));
		await store.flush();
		await db.photos.put(stored('c'.repeat(64), 0));
		expect(await pruneOrphanPhotos()).toBe(1);
		expect(await db.photos.count()).toBe(2);
		store.abandon();
	});

	it('leaves fresh blobs alone, because their project may not be saved yet', async () => {
		await putPhoto(stored(A));
		expect(await pruneOrphanPhotos()).toBe(0);
		expect(await pruneOrphanPhotos({ now: Date.now() + ORPHAN_MIN_AGE_MS + 1000 })).toBe(1);
	});

	it('refreshes the age of a blob that is stored again', async () => {
		await db.photos.put(stored(A, 0));
		await putPhoto(stored(A));
		expect(await pruneOrphanPhotos()).toBe(0);
	});

	it('keeps what the caller asks to keep', async () => {
		await db.photos.put(stored(A, 0));
		expect(await pruneOrphanPhotos({ keep: new Set([A]) })).toBe(0);
		expect(await pruneOrphanPhotos()).toBe(1);
	});

	it('treats blobs from before the age was recorded as old', async () => {
		await db.photos.put(stored(A));
		expect(await pruneOrphanPhotos()).toBe(1);
	});
});

describe('cleanup after deleting', () => {
	it('is debounced and runs once', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		await db.photos.put(stored(A, 0));
		scheduleCleanup();
		await vi.advanceTimersByTimeAsync(CLEANUP_DELAY_MS - 1);
		scheduleCleanup();
		await vi.advanceTimersByTimeAsync(CLEANUP_DELAY_MS - 1);
		expect(await db.photos.count()).toBe(1);
		await vi.advanceTimersByTimeAsync(2);
		await vi.waitFor(async () => expect(await db.photos.count()).toBe(0), {
			timeout: 2000,
			interval: 20
		});
	});

	it('is wired to removing a photo', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const { store, roomId } = await openWithPhoto();
		setKeepProvider(() => new Set());
		store.removePhoto(roomId, `photo-${A[0]}`);
		await store.flush();
		expect(await getPhoto(A)).toBeDefined();
		await vi.advanceTimersByTimeAsync(CLEANUP_DELAY_MS + 100);
		await vi.waitFor(async () => expect(await getPhoto(A)).toBeUndefined(), {
			timeout: 2000,
			interval: 20
		});
		store.abandon();
	});

	it('is wired to removing a room', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const { store, roomId } = await openWithPhoto();
		setKeepProvider(() => new Set());
		store.removeRoom(roomId);
		await store.flush();
		expect(await getPhoto(A)).toBeDefined();
		await vi.advanceTimersByTimeAsync(CLEANUP_DELAY_MS + 100);
		await vi.waitFor(async () => expect(await getPhoto(A)).toBeUndefined(), {
			timeout: 2000,
			interval: 20
		});
		store.abandon();
	});

	it('does not collect blobs that undo or the toast could bring back', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		const { store, roomId } = await openWithPhoto();
		setKeepProvider(async () => {
			await store.flush();
			return store.referencedPhotoHashes();
		});
		store.removePhoto(roomId, `photo-${A[0]}`);
		await store.flush();
		await vi.advanceTimersByTimeAsync(CLEANUP_DELAY_MS + 100);
		await runCleanup();
		expect(await getPhoto(A)).toBeDefined();
		store.undo();
		expect(store.room(roomId)?.photos).toHaveLength(1);
		store.abandon();
	});
});

describe('undo for deleted photos', () => {
	it('puts the photo back where it was', async () => {
		const { store, roomId } = await openWithPhoto();
		store.addPhoto(roomId, photoOf(B, 'second'));
		const removed = store.removePhoto(roomId, `photo-${A[0]}`);
		expect(store.room(roomId)?.photos.map((photo) => photo.id)).toEqual(['second']);
		expect(store.restorePhoto(roomId, removed!.photo, removed!.index)).toBe(true);
		expect(store.room(roomId)?.photos.map((photo) => photo.id)).toEqual([
			`photo-${A[0]}`,
			'second'
		]);
		await store.flush();
		expect(await getPhoto(A)).toBeDefined();
		store.abandon();
	});

	it('does not restore twice or into a missing room', async () => {
		const { store, roomId } = await openWithPhoto();
		const removed = store.removePhoto(roomId, `photo-${A[0]}`)!;
		expect(store.restorePhoto('nope', removed.photo, 0)).toBe(false);
		expect(store.restorePhoto(roomId, removed.photo, 0)).toBe(true);
		expect(store.restorePhoto(roomId, removed.photo, 0)).toBe(false);
		expect(store.room(roomId)?.photos).toHaveLength(1);
		store.abandon();
	});

	it('reports nothing for an unknown photo', async () => {
		const { store, roomId } = await openWithPhoto();
		expect(store.removePhoto(roomId, 'ghost')).toBeUndefined();
		store.abandon();
	});
});

describe('runCleanup', () => {
	it('asks the provider what must stay', async () => {
		await db.photos.put(stored(A, 0));
		setKeepProvider(() => new Set([A]));
		expect(await runCleanup()).toBe(0);
		setKeepProvider(() => new Set());
		expect(await runCleanup()).toBe(1);
	});

	it('survives a failing database', async () => {
		vi.spyOn(db.photos, 'toCollection').mockImplementation(() => {
			throw new Error('closed');
		});
		expect(await runCleanup()).toBe(0);
		vi.restoreAllMocks();
	});
});

describe('cleanup across tabs', () => {
	beforeEach(async () => {
		await db.photos.put(stored(A, 0));
	});

	it('runs under the cleanup lock', async () => {
		const { request } = stubLocks();
		expect(await runCleanup()).toBe(1);
		expect(request).toHaveBeenCalledWith(CLEANUP_LOCK, { ifAvailable: true }, expect.any(Function));
	});

	it('keeps the blobs while another tab has a project open, and tries again later', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		stubLocks([{ name: 'roomx.project.x', clientId: 'other' }]);
		expect(await runCleanup()).toBe(0);
		expect(await getPhoto(A)).toBeDefined();
		stubLocks();
		await vi.advanceTimersByTimeAsync(CLEANUP_RETRY_MS);
		vi.useRealTimers();
		await vi.waitFor(async () => expect(await getPhoto(A)).toBeUndefined());
	});

	it('ignores the project locks of its own tab', async () => {
		stubLocks([{ name: 'roomx.project.x', clientId: 'me' }]);
		expect(await runCleanup()).toBe(1);
	});

	it('skips when another tab already cleans up', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		stubLocks([], false);
		expect(await runCleanup()).toBe(0);
		expect(await getPhoto(A)).toBeDefined();
	});

	it('does not delete without locks and without a channel', async () => {
		vi.stubGlobal('navigator', {});
		useBus(null);
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		expect(await runCleanup()).toBe(0);
		expect(await getPhoto(A)).toBeDefined();
	});

	function fakeBus(reply: boolean): TabBus {
		const listeners = new Set<(message: TabMessage) => void>();
		return {
			post(message) {
				if (reply && message.type === 'who') {
					queueMicrotask(() => {
						for (const listener of listeners)
							listener({
								type: 'owner',
								projectId: message.projectId,
								from: 'other-tab',
								claimedAt: 1
							});
					});
				}
			},
			subscribe(listener) {
				listeners.add(listener);
				return () => listeners.delete(listener);
			}
		};
	}

	it('asks the other tabs over the channel when there are no locks', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		vi.stubGlobal('navigator', {});
		await createProject('Bus');
		useBus(fakeBus(true));
		expect(await runCleanup()).toBe(0);
		expect(await getPhoto(A)).toBeDefined();
		cancelCleanup();
		useBus(fakeBus(false));
		const pending = runCleanup();
		await vi.advanceTimersByTimeAsync(1000);
		expect(await pending).toBe(1);
	});
});
