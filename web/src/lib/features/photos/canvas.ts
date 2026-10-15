import { PhotoError } from './image.ts';

export interface Decoded {
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

export async function decode(file: Blob): Promise<Decoded> {
	if (typeof createImageBitmap === 'function') {
		try {
			return await decodeWithBitmap(file);
		} catch {
			// fall through to the <img> path
		}
	}
	return decodeWithImage(file);
}

export type Surface = { canvas: OffscreenCanvas | HTMLCanvasElement; context: CanvasDrawing };
type CanvasDrawing = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function createSurface(w: number, h: number): Surface {
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

export async function encodeSurface(surface: Surface, quality: number): Promise<Blob> {
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

export function render(
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
