export type ImageKind = 'jpeg' | 'png' | 'webp';

export const IMAGE_MIME: Record<ImageKind, string> = {
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp'
};

export const MAX_IMAGE_EDGE = 20_000;
export const MAX_IMAGE_PIXELS = 50_000_000;

export interface ImageInfo {
	kind: ImageKind;
	w: number;
	h: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MARKUP = ['<svg ', '<svg>', '<script', '<html', '<?xml'];

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
	return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
	let text = '';
	for (let index = 0; index < length; index++) {
		text += String.fromCharCode(bytes[offset + index] ?? 0);
	}
	return text;
}

export function sniffImage(bytes: Uint8Array): ImageKind | null {
	if (bytes.length < 12) return null;
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
	if (startsWith(bytes, PNG_SIGNATURE)) return 'png';
	if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
	return null;
}

// An image that also reads as SVG or HTML can run code if it is ever served with the wrong type.
export function containsMarkup(bytes: Uint8Array): boolean {
	for (let index = 0; index < bytes.length - 4; index++) {
		if (bytes[index] !== 0x3c) continue;
		const head = ascii(bytes, index, 8).toLowerCase();
		if (MARKUP.some((marker) => head.startsWith(marker))) return true;
	}
	return false;
}

function jpegSize(bytes: Uint8Array): { w: number; h: number } | null {
	let offset = 2;
	while (offset + 4 < bytes.length) {
		if (bytes[offset] !== 0xff) return null;
		let marker = bytes[offset + 1];
		while (marker === 0xff && offset + 2 < bytes.length) {
			offset += 1;
			marker = bytes[offset + 1];
		}
		if (marker === 0xd9 || marker === 0xda) return null;
		if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			offset += 2;
			continue;
		}
		const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
		const frame =
			marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
		if (frame) {
			const h = (bytes[offset + 5] << 8) | bytes[offset + 6];
			const w = (bytes[offset + 7] << 8) | bytes[offset + 8];
			return { w, h };
		}
		if (length < 2) return null;
		offset += 2 + length;
	}
	return null;
}

function pngSize(bytes: Uint8Array): { w: number; h: number } | null {
	if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return { w: view.getUint32(16), h: view.getUint32(20) };
}

function webpSize(bytes: Uint8Array): { w: number; h: number } | null {
	const chunk = ascii(bytes, 12, 4);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (chunk === 'VP8 ' && bytes.length >= 30) {
		if (!startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) return null;
		return { w: view.getUint16(26, true) & 0x3fff, h: view.getUint16(28, true) & 0x3fff };
	}
	if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
		const bits = view.getUint32(21, true);
		return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
	}
	if (chunk === 'VP8X' && bytes.length >= 30) {
		const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
		const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
		return { w, h };
	}
	return null;
}

export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
	const kind = sniffImage(bytes);
	if (!kind) return null;
	const size =
		kind === 'jpeg' ? jpegSize(bytes) : kind === 'png' ? pngSize(bytes) : webpSize(bytes);
	if (!size || size.w < 1 || size.h < 1) return null;
	return { kind, ...size };
}

export type ImageVerdict =
	{ ok: true; info: ImageInfo } | { ok: false; reason: 'format' | 'markup' | 'size' };

export function checkImageBytes(bytes: Uint8Array): ImageVerdict {
	const info = readImageInfo(bytes);
	if (!info) return { ok: false, reason: 'format' };
	if (containsMarkup(bytes)) return { ok: false, reason: 'markup' };
	if (info.w > MAX_IMAGE_EDGE || info.h > MAX_IMAGE_EDGE || info.w * info.h > MAX_IMAGE_PIXELS) {
		return { ok: false, reason: 'size' };
	}
	return { ok: true, info };
}
