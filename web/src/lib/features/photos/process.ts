import type { Perspective, Photo } from '#lib/core/schema.ts';
import { LIMITS } from '#lib/security/limits.ts';
import { putPhoto } from '#lib/state/persistence.ts';
import { store } from '#lib/state/project.svelte.ts';
import { decode, encodeSurface, render, type Decoded } from './canvas.ts';
import { sha256Hex } from './hash.ts';
import {
	fitSize,
	isHeic,
	JPEG_QUALITY,
	MAX_EDGE,
	PhotoError,
	precheck,
	THUMBNAIL_EDGE,
	THUMBNAIL_QUALITY,
	type ProcessedImage
} from './image.ts';

export async function processFile(file: File): Promise<ProcessedImage> {
	const problem = precheck(file);
	if (problem) throw new PhotoError(problem);
	let decoded: Decoded;
	try {
		decoded = await decode(file);
	} catch {
		throw new PhotoError(isHeic(file) ? 'heic' : 'decode');
	}
	try {
		if (decoded.w < 1 || decoded.h < 1) throw new PhotoError('decode');
		const size = fitSize(decoded.w, decoded.h, MAX_EDGE);
		const main = render(decoded.source, decoded, size);
		const blob = await encodeSurface(main, JPEG_QUALITY);
		const thumbSize = fitSize(size.w, size.h, THUMBNAIL_EDGE);
		const small = render(main.canvas, size, thumbSize);
		const thumbnail = await encodeSurface(small, THUMBNAIL_QUALITY);
		const hash = await sha256Hex(new Uint8Array(await blob.arrayBuffer()));
		return { hash, blob, thumbnail, w: size.w, h: size.h };
	} catch (error) {
		if (error instanceof PhotoError) throw error;
		throw new PhotoError('encode');
	} finally {
		decoded.release();
	}
}

export function newPhotoId(): string {
	const random = globalThis.crypto;
	if (typeof random?.randomUUID === 'function') return random.randomUUID();
	const bytes = new Uint8Array(16);
	if (random?.getRandomValues) random.getRandomValues(bytes);
	else bytes.forEach((_, i) => (bytes[i] = Math.floor(Math.random() * 256)));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function addPhotoFromFile(
	roomId: string,
	file: File,
	perspective: Perspective,
	note?: string
): Promise<Photo> {
	if (store.readOnly) throw new PhotoError('readOnly');
	const existing = store.room(roomId)?.photos.length ?? 0;
	if (existing >= LIMITS.photosPerRoom) throw new PhotoError('limit');
	const processed = await processFile(file);
	if (store.readOnly) throw new PhotoError('readOnly');
	try {
		await putPhoto({
			hash: processed.hash,
			blob: processed.blob,
			thumbnail: processed.thumbnail,
			w: processed.w,
			h: processed.h,
			uploaded: false
		});
	} catch {
		throw new PhotoError('storage');
	}
	const photo: Photo = {
		id: newPhotoId(),
		hash: processed.hash,
		perspective,
		w: processed.w,
		h: processed.h,
		takenAt: new Date().toISOString(),
		...(note ? { note } : {})
	};
	store.addPhoto(roomId, photo);
	return photo;
}
