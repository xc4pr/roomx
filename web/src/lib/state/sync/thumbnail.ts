import { fitSize, THUMBNAIL_EDGE, THUMBNAIL_QUALITY } from '#lib/features/photos/image.ts';

export interface ThumbnailResult {
	thumbnail: Blob;
	w: number;
	h: number;
}

export type Thumbnailer = (blob: Blob) => Promise<ThumbnailResult>;

export const makeThumbnail: Thumbnailer = async (blob) => {
	if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
		return { thumbnail: blob, w: 0, h: 0 };
	}
	try {
		const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
		try {
			const size = fitSize(bitmap.width, bitmap.height, THUMBNAIL_EDGE);
			const canvas = new OffscreenCanvas(size.w, size.h);
			const context = canvas.getContext('2d');
			if (!context) return { thumbnail: blob, w: bitmap.width, h: bitmap.height };
			context.fillStyle = '#ffffff';
			context.fillRect(0, 0, size.w, size.h);
			context.imageSmoothingQuality = 'high';
			context.drawImage(bitmap, 0, 0, size.w, size.h);
			const thumbnail = await canvas.convertToBlob({
				type: 'image/jpeg',
				quality: THUMBNAIL_QUALITY
			});
			return { thumbnail, w: bitmap.width, h: bitmap.height };
		} finally {
			bitmap.close();
		}
	} catch {
		return { thumbnail: blob, w: 0, h: 0 };
	}
};
