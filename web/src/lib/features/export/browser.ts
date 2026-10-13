import boldUrl from '@fontsource/figtree/files/figtree-latin-600-normal.woff?url';
import regularUrl from '@fontsource/figtree/files/figtree-latin-400-normal.woff?url';
import type { Project, Room } from '#lib/core/schema.ts';
import { fitSize, THUMBNAIL_EDGE, THUMBNAIL_QUALITY } from '#lib/features/photos/image.ts';
import { getPhoto } from '#lib/state/persistence.ts';
import { PHOTO_LONG_EDGE } from './layout.ts';
import type { PackageDeps } from './package.ts';
import type { PdfFonts, RoomImages } from './pdf.ts';

const VIEW_SIZE = 1000;

async function fetchBytes(url: string): Promise<Uint8Array> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`font ${response.status}`);
	return new Uint8Array(await response.arrayBuffer());
}

export async function loadFonts(): Promise<PdfFonts> {
	const [regular, bold] = await Promise.all([fetchBytes(regularUrl), fetchBytes(boldUrl)]);
	return { regular, bold };
}

async function decode(
	blob: Blob
): Promise<{ source: CanvasImageSource; w: number; h: number; release: () => void }> {
	if (typeof createImageBitmap === 'function') {
		const bitmap = await createImageBitmap(blob);
		return { source: bitmap, w: bitmap.width, h: bitmap.height, release: () => bitmap.close() };
	}
	const url = URL.createObjectURL(blob);
	const image = new Image();
	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error('image'));
		image.src = url;
	});
	return {
		source: image,
		w: image.naturalWidth,
		h: image.naturalHeight,
		release: () => URL.revokeObjectURL(url)
	};
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('jpeg'))),
			'image/jpeg',
			quality
		);
	});
}

export async function resizeToJpeg(blob: Blob, maxEdge: number, quality: number): Promise<Blob> {
	const decoded = await decode(blob);
	try {
		const size = fitSize(decoded.w, decoded.h, maxEdge);
		const canvas = document.createElement('canvas');
		canvas.width = size.w;
		canvas.height = size.h;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('canvas');
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, size.w, size.h);
		context.imageSmoothingQuality = 'high';
		context.drawImage(decoded.source, 0, 0, decoded.w, decoded.h, 0, 0, size.w, size.h);
		return await canvasBlob(canvas, quality);
	} finally {
		decoded.release();
	}
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
	return new Uint8Array(await blob.arrayBuffer());
}

export async function loadPhotoForPdf(hash: string): Promise<Uint8Array | undefined> {
	const stored = await getPhoto(hash);
	if (!stored) return undefined;
	try {
		if (stored.blob.type === 'image/jpeg' && Math.max(stored.w, stored.h) <= PHOTO_LONG_EDGE) {
			return await bytesOf(stored.blob);
		}
		return await bytesOf(await resizeToJpeg(stored.blob, PHOTO_LONG_EDGE, 0.8));
	} catch {
		return undefined;
	}
}

export async function renderViewsForPdf(
	project: Project,
	room: Room,
	variantId: string | undefined
): Promise<RoomImages | undefined> {
	try {
		const { renderRoomViews } = await import('#lib/three/offscreen.ts');
		const views = await renderRoomViews(project, room.id, variantId, VIEW_SIZE);
		const convert = async (blob: Blob) => bytesOf(await resizeToJpeg(blob, VIEW_SIZE, 0.86));
		return { top: await convert(views.top), iso: await Promise.all(views.iso.map(convert)) };
	} catch {
		return undefined;
	}
}

export function makeThumbnail(blob: Blob): Promise<Blob> {
	return resizeToJpeg(blob, THUMBNAIL_EDGE, THUMBNAIL_QUALITY);
}

export const browserDeps: PackageDeps = {
	loadFonts,
	loadPhoto: loadPhotoForPdf,
	renderViews: renderViewsForPdf
};
