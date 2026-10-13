export const MAX_EDGE = 2560;
export const THUMBNAIL_EDGE = 320;
export const JPEG_QUALITY = 0.82;
export const THUMBNAIL_QUALITY = 0.72;
export const MAX_FILE_BYTES = 80 * 1024 * 1024;

export type PhotoErrorCode =
	'notImage' | 'heic' | 'tooLarge' | 'empty' | 'decode' | 'encode' | 'storage';

export class PhotoError extends Error {
	readonly code: PhotoErrorCode;

	constructor(code: PhotoErrorCode) {
		super(code);
		this.name = 'PhotoError';
		this.code = code;
	}
}

export interface ProcessedImage {
	hash: string;
	blob: Blob;
	thumbnail: Blob;
	w: number;
	h: number;
}

export function fitSize(w: number, h: number, maxEdge: number): { w: number; h: number } {
	const longest = Math.max(w, h);
	if (longest <= maxEdge || longest <= 0)
		return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
	const factor = maxEdge / longest;
	return { w: Math.max(1, Math.round(w * factor)), h: Math.max(1, Math.round(h * factor)) };
}

export function isHeic(file: { name: string; type: string }): boolean {
	return /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

export function precheck(file: {
	name: string;
	type: string;
	size: number;
}): PhotoErrorCode | null {
	if (file.size === 0) return 'empty';
	if (file.size > MAX_FILE_BYTES) return 'tooLarge';
	if (isHeic(file)) return null;
	if (file.type && !file.type.startsWith('image/')) return 'notImage';
	if (!file.type && !/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name)) return 'notImage';
	return null;
}
