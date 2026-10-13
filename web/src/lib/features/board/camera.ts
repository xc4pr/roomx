import type { Vec } from '#lib/core/geometry.ts';

export interface Camera {
	x: number;
	y: number;
	k: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface Insets {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface Box {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export const MIN_K = 0.008;
export const MAX_K = 3;
export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

export function clampK(k: number): number {
	return Math.min(MAX_K, Math.max(MIN_K, k));
}

export function boardToScreen(cam: Camera, p: Vec): Vec {
	return { x: (p.x - cam.x) * cam.k, y: (cam.y - p.y) * cam.k };
}

export function screenToBoard(cam: Camera, s: Vec): Vec {
	return { x: cam.x + s.x / cam.k, y: cam.y - s.y / cam.k };
}

export function panBy(cam: Camera, dx: number, dy: number): Camera {
	return { k: cam.k, x: cam.x - dx / cam.k, y: cam.y + dy / cam.k };
}

export function zoomAt(cam: Camera, factor: number, screen: Vec): Camera {
	const k = clampK(cam.k * factor);
	const anchor = screenToBoard(cam, screen);
	return { k, x: anchor.x - screen.x / k, y: anchor.y + screen.y / k };
}

export interface PointerPair {
	a: Vec;
	b: Vec;
}

function middle(pair: PointerPair): Vec {
	return { x: (pair.a.x + pair.b.x) / 2, y: (pair.a.y + pair.b.y) / 2 };
}

function spread(pair: PointerPair): number {
	return Math.hypot(pair.a.x - pair.b.x, pair.a.y - pair.b.y);
}

export function pinchStep(cam: Camera, previous: PointerPair, next: PointerPair): Camera {
	const before = spread(previous);
	const ratio = before < 1 ? 1 : spread(next) / before;
	const anchor = screenToBoard(cam, middle(previous));
	const k = clampK(cam.k * ratio);
	const to = middle(next);
	return { k, x: anchor.x - to.x / k, y: anchor.y + to.y / k };
}

export function availableRegion(size: Size, insets: Insets): Box {
	const minX = Math.min(insets.left, size.width - 80);
	const minY = Math.min(insets.top, size.height - 80);
	return {
		minX,
		minY,
		maxX: Math.max(minX + 80, size.width - insets.right),
		maxY: Math.max(minY + 80, size.height - insets.bottom)
	};
}

export interface FitOptions {
	margin?: number;
	maxK?: number;
	minK?: number;
}

export function fitBox(box: Box, size: Size, insets: Insets, options: FitOptions = {}): Camera {
	const margin = options.margin ?? 48;
	const region = availableRegion(size, insets);
	const width = Math.max(box.maxX - box.minX, 100);
	const height = Math.max(box.maxY - box.minY, 100);
	const freeW = Math.max(region.maxX - region.minX - margin * 2, 40);
	const freeH = Math.max(region.maxY - region.minY - margin * 2, 40);
	const k = Math.min(
		options.maxK ?? MAX_K,
		Math.max(options.minK ?? MIN_K, Math.min(freeW / width, freeH / height))
	);
	const centerX = (box.minX + box.maxX) / 2;
	const centerY = (box.minY + box.maxY) / 2;
	const screenX = (region.minX + region.maxX) / 2;
	const screenY = (region.minY + region.maxY) / 2;
	return { k, x: centerX - screenX / k, y: centerY + screenY / k };
}

export function isInRegion(cam: Camera, size: Size, insets: Insets, p: Vec, margin = 24): boolean {
	const region = availableRegion(size, insets);
	const s = boardToScreen(cam, p);
	return (
		s.x >= region.minX + margin &&
		s.x <= region.maxX - margin &&
		s.y >= region.minY + margin &&
		s.y <= region.maxY - margin
	);
}

export function centerPoint(cam: Camera, size: Size): Vec {
	return screenToBoard(cam, { x: size.width / 2, y: size.height / 2 });
}

export function lerpCamera(from: Camera, to: Camera, t: number, size: Size): Camera {
	const a = centerPoint(from, size);
	const b = centerPoint(to, size);
	const k = from.k * Math.pow(to.k / from.k, t);
	const cx = a.x + (b.x - a.x) * t;
	const cy = a.y + (b.y - a.y) * t;
	return { k, x: cx - size.width / 2 / k, y: cy + size.height / 2 / k };
}

export function easeOutCubic(t: number): number {
	return 1 - Math.pow(1 - t, 3);
}

export interface GridSteps {
	minor: number;
	major: number;
}

const GRID_LEVELS: readonly GridSteps[] = [
	{ minor: 100, major: 500 },
	{ minor: 500, major: 1000 },
	{ minor: 1000, major: 5000 },
	{ minor: 5000, major: 10000 },
	{ minor: 10000, major: 50000 }
];

export function gridSteps(k: number, minPixels = 10): GridSteps {
	return (
		GRID_LEVELS.find((level) => level.minor * k >= minPixels) ?? GRID_LEVELS[GRID_LEVELS.length - 1]
	);
}
