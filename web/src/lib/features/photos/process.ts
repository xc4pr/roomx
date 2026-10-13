import type { Perspective, Photo } from '#lib/core/schema.ts';
import { putPhoto } from '#lib/state/persistence.ts';
import { store } from '#lib/state/project.svelte.ts';
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

interface Decoded {
	source: CanvasImageSource;
	w: number;
	h: number;
	release: () => void;
}

async function decodeWithBitmap(file: Blob): Promise<Decoded> {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
	return { source: bitmap, w: bitmap.width, h: bitmap.height, release: () => bitmap.close() };
}

async function decodeWithImage(file: Blob): Promise<Decoded> {
	const url = URL.createObjectURL(file);
	const image = new Image();
	image.decoding = 'async';
	try {
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve();
			image.onerror = () => reject(new Error('image'));
			image.src = url;
		});
		await image.decode().catch(() => undefined);
	} catch (error) {
		URL.revokeObjectURL(url);
		throw error;
	}
	return {
		source: image,
		w: image.naturalWidth,
		h: image.naturalHeight,
		release: () => URL.revokeObjectURL(url)
	};
}

async function decode(file: Blob): Promise<Decoded> {
	if (typeof createImageBitmap === 'function') {
		try {
			return await decodeWithBitmap(file);
		} catch {
			// fall through to the <img> path
		}
	}
	return decodeWithImage(file);
}

type Surface = { canvas: OffscreenCanvas | HTMLCanvasElement; context: CanvasDrawing };
type CanvasDrawing = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function createSurface(w: number, h: number): Surface {
	if (typeof OffscreenCanvas !== 'undefined') {
		const canvas = new OffscreenCanvas(w, h);
		const context = canvas.getContext('2d');
		if (context) return { canvas, context };
	}
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const context = canvas.getContext('2d');
	if (!context) throw new PhotoError('encode');
	return { canvas, context };
}

async function encodeSurface(surface: Surface, quality: number): Promise<Blob> {
	const { canvas } = surface;
	if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
		try {
			const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
			if (blob.type === 'image/jpeg') return blob;
		} catch {
			// fall through to the element path
		}
		const copy = document.createElement('canvas');
		copy.width = canvas.width;
		copy.height = canvas.height;
		copy.getContext('2d')?.drawImage(canvas, 0, 0);
		return elementToBlob(copy, quality);
	}
	return elementToBlob(canvas as HTMLCanvasElement, quality);
}

function elementToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) =>
				blob && blob.type === 'image/jpeg' ? resolve(blob) : reject(new PhotoError('encode')),
			'image/jpeg',
			quality
		);
	});
}

function render(
	source: CanvasImageSource,
	from: { w: number; h: number },
	to: { w: number; h: number }
): Surface {
	const surface = createSurface(to.w, to.h);
	surface.context.fillStyle = '#ffffff';
	surface.context.fillRect(0, 0, to.w, to.h);
	surface.context.imageSmoothingEnabled = true;
	surface.context.imageSmoothingQuality = 'high';
	surface.context.drawImage(source, 0, 0, from.w, from.h, 0, 0, to.w, to.h);
	return surface;
}

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
	const processed = await processFile(file);
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
