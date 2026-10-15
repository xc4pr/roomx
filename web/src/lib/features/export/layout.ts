export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 40;
export const CONTENT_TOP = PAGE_HEIGHT - MARGIN;
export const CONTENT_BOTTOM = 58;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
export const POINT_MM = 25.4 / 72;
export const PHOTOS_PER_PAGE = 2;
export const PHOTO_LONG_EDGE = 1600;
export const MAX_PAGES = 80;
export const MAX_BYTES = 25 * 1024 * 1024;
export const PACKAGE_FILE_COUNT = 5;
export const PACKAGE_EXTRA_BYTES = 120_000;
export const PHOTO_BYTES = 330_000;
export const VIEW_BYTES = 60_000;

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface Fit {
	scale: number;
	ox: number;
	oy: number;
}

export function boundsOf(points: readonly { x: number; y: number }[]): Bounds {
	if (points.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of points) {
		minX = Math.min(minX, p.x);
		minY = Math.min(minY, p.y);
		maxX = Math.max(maxX, p.x);
		maxY = Math.max(maxY, p.y);
	}
	return { minX, minY, maxX, maxY };
}

export function fitBounds(
	bounds: Bounds,
	box: Box,
	padding = 0,
	align: 'center' | 'top' = 'center'
): Fit {
	const width = Math.max(bounds.maxX - bounds.minX, 1);
	const height = Math.max(bounds.maxY - bounds.minY, 1);
	const availW = Math.max(box.w - padding * 2, 1);
	const availH = Math.max(box.h - padding * 2, 1);
	const scale = Math.min(availW / width, availH / height);
	return {
		scale,
		ox: box.x + (box.w - width * scale) / 2 - bounds.minX * scale,
		oy:
			(align === 'top'
				? box.y + box.h - padding - height * scale
				: box.y + (box.h - height * scale) / 2) -
			bounds.minY * scale
	};
}

export function applyFit(fit: Fit, p: { x: number; y: number }): { x: number; y: number } {
	return { x: p.x * fit.scale + fit.ox, y: p.y * fit.scale + fit.oy };
}

const NICE_SCALES = [5, 10, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 1000];

export function paperScale(pointsPerMm: number): number {
	if (pointsPerMm <= 0) return NICE_SCALES[NICE_SCALES.length - 1];
	const exact = 1 / (pointsPerMm * POINT_MM);
	return NICE_SCALES.find((candidate) => candidate >= exact - 1e-9) ?? Math.ceil(exact);
}

export interface PhotoSlot {
	roomIndex: number;
	photoIndexes: number[];
}

export function planPhotoPages(counts: readonly number[], perPage = PHOTOS_PER_PAGE): PhotoSlot[] {
	const pages: PhotoSlot[] = [];
	counts.forEach((count, roomIndex) => {
		for (let start = 0; start < count; start += perPage) {
			const photoIndexes: number[] = [];
			for (let index = start; index < Math.min(count, start + perPage); index++) {
				photoIndexes.push(index);
			}
			pages.push({ roomIndex, photoIndexes });
		}
	});
	return pages;
}

export function packBlocks(heights: readonly number[], available: number, gap: number): number[][] {
	const pages: number[][] = [];
	let current: number[] = [];
	let used = 0;
	heights.forEach((height, index) => {
		const needed = current.length === 0 ? height : used + gap + height;
		if (current.length > 0 && needed > available) {
			pages.push(current);
			current = [];
			used = 0;
		}
		used = current.length === 0 ? height : used + gap + height;
		current.push(index);
	});
	if (current.length > 0) pages.push(current);
	return pages;
}

export function hatchSegments(
	width: number,
	height: number,
	step: number
): [number, number, number, number][] {
	const lines: [number, number, number, number][] = [];
	if (width <= 0 || height <= 0 || step <= 0) return lines;
	for (let c = -width + step; c < height; c += step) {
		const x0 = Math.max(0, -c);
		const x1 = Math.min(width, height - c);
		if (x1 > x0) lines.push([x0, x0 + c, x1, x1 + c]);
	}
	return lines;
}

export interface RoomEstimateInput {
	walls: number;
	photos: number;
	items: number;
}

export interface PackageEstimate {
	pages: number;
	bytes: number;
	tooLarge: boolean;
}

export const ITEM_ROWS_PER_PAGE = 40;

export function estimatePackage(
	rooms: readonly RoomEstimateInput[],
	withViews = true,
	withPhotos = true
): PackageEstimate {
	let pages = 1 + Math.floor(rooms.length / 16);
	let bytes = 0;
	for (const room of rooms) {
		pages += 1 + Math.ceil(room.walls / 2);
		if (withViews) {
			pages += 1;
			bytes += 5 * VIEW_BYTES;
		}
		if (room.items > 0) pages += 1 + Math.floor(room.items / ITEM_ROWS_PER_PAGE);
		if (withPhotos) {
			pages += Math.ceil(room.photos / PHOTOS_PER_PAGE);
			bytes += room.photos * PHOTO_BYTES;
		}
	}
	bytes += pages * 6_000 + 40_000 + PACKAGE_EXTRA_BYTES;
	return { pages, bytes, tooLarge: pages > MAX_PAGES || bytes > MAX_BYTES };
}

export function isTooLarge(pages: number, bytes: number): boolean {
	return pages > MAX_PAGES || bytes > MAX_BYTES;
}
