import { sha256Hex } from '#lib/features/photos/hash.ts';
import { db, type StoredPhoto } from '../db.ts';
import { HttpError, type Api } from './api.ts';
import { makeThumbnail, type Thumbnailer } from './thumbnail.ts';

export function projectPhotoHashes(project: {
	rooms: readonly { photos: readonly { hash: string }[] }[];
}): string[] {
	const hashes = new Set<string>();
	for (const room of project.rooms) for (const photo of room.photos) hashes.add(photo.hash);
	return [...hashes];
}

export async function uploadPhotos(api: Api, hashes: readonly string[]): Promise<void> {
	for (const hash of hashes) {
		const stored = await db.photos.get(hash);
		if (!stored || stored.uploaded) continue;
		try {
			if (!(await api.hasPhoto(hash))) await api.putPhoto(hash, stored.blob);
		} catch (error) {
			if (error instanceof HttpError && error.status < 500) continue;
			throw error;
		}
		await db.photos.update(hash, { uploaded: true });
	}
}

export async function missingPhotos(hashes: readonly string[]): Promise<string[]> {
	const known = await db.photos.bulkGet([...hashes]);
	return hashes.filter((_, index) => !known[index]);
}

type PhotoListener = (hash: string) => void;
const listeners = new Set<PhotoListener>();

export function onPhotoStored(listener: PhotoListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

let source: Api | null = null;
let thumbnailer: Thumbnailer = makeThumbnail;
const inflight = new Map<string, Promise<boolean>>();

export function setPhotoSource(api: Api | null): void {
	source = api;
}

export function setThumbnailer(next: Thumbnailer | null): void {
	thumbnailer = next ?? makeThumbnail;
}

async function download(api: Api, hash: string): Promise<boolean> {
	try {
		const blob = await api.getPhoto(hash);
		if (!blob) return false;
		const digest = await sha256Hex(new Uint8Array(await blob.arrayBuffer()));
		if (digest !== hash) return false;
		const { thumbnail, w, h } = await thumbnailer(blob);
		const record: StoredPhoto = { hash, blob, thumbnail, w, h, uploaded: true };
		if (!(await db.photos.get(hash))) await db.photos.put(record);
		for (const listener of listeners) listener(hash);
		return true;
	} catch {
		return false;
	}
}

export async function ensurePhoto(hash: string): Promise<boolean> {
	if (await db.photos.get(hash)) return true;
	const api = source;
	if (!api) return false;
	const running = inflight.get(hash);
	if (running) return running;
	const job = download(api, hash).finally(() => inflight.delete(hash));
	inflight.set(hash, job);
	return job;
}

export async function prefetchPhotos(hashes: readonly string[], concurrency = 2): Promise<void> {
	const queue = await missingPhotos(hashes);
	const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
		for (let hash = queue.shift(); hash !== undefined; hash = queue.shift()) {
			if (!source) return;
			await ensurePhoto(hash);
		}
	});
	await Promise.all(workers);
}
