import { decode, encodeSurface, render, type Decoded } from './canvas.ts';
import { sha256Hex } from './hash.ts';
import {
	fitSize,
	MAX_EDGE,
	PhotoError,
	THUMBNAIL_EDGE,
	THUMBNAIL_QUALITY,
	type ProcessedImage
} from './image.ts';
import { IMAGE_MIME, type ImageKind } from './sniff.ts';

export const REENCODE_QUALITY = 0.9;

export type Reencode = (bytes: Uint8Array, kind: ImageKind) => Promise<ProcessedImage>;

// Foreign images are only kept as freshly encoded JPEG pixels, never as the original bytes.
export const reencodeImage: Reencode = async (bytes, kind) => {
	const source = new Blob([bytes as BlobPart], { type: IMAGE_MIME[kind] });
	let decoded: Decoded;
	try {
		decoded = await decode(source);
	} catch {
		throw new PhotoError('decode');
	}
	try {
		if (decoded.w < 1 || decoded.h < 1) throw new PhotoError('decode');
		const size = fitSize(decoded.w, decoded.h, MAX_EDGE);
		const main = render(decoded.source, decoded, size);
		const blob = await encodeSurface(main, REENCODE_QUALITY);
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
};
