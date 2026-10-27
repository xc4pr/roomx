import { WALL_THICKNESS } from '#lib/core/defaults.ts';
import type { FreeElement, RoomElement, WallElement } from '#lib/core/schema.ts';

export interface Bounds {
	x0: number;
	x1: number;
	y0: number;
	y1: number;
}

export interface SymbolMetrics {
	gang: number;
	cell: number;
	radius: number;
	total: number;
}

export const SYMBOL_PX = 22;

export function symbolMetrics(element: RoomElement, pxPerMm: number): SymbolMetrics {
	const minimum = SYMBOL_PX / pxPerMm;
	if (element.kind === 'ceilingLamp') {
		const radius = Math.max(150, 13 / pxPerMm);
		return { gang: 1, cell: radius * 2, radius, total: radius * 2 };
	}
	const gang = element.kind === 'socket' ? element.gang : 1;
	const cell = Math.max(element.width / gang, minimum);
	return { gang, cell, radius: cell / 2, total: cell * gang };
}

export function localBounds(
	element: WallElement,
	pxPerMm: number,
	thickness = WALL_THICKNESS
): Bounds {
	const { total, radius } = symbolMetrics(element, pxPerMm);
	const center = element.offset + element.width / 2;
	switch (element.kind) {
		case 'door':
		case 'window':
			return {
				x0: element.offset,
				x1: element.offset + element.width,
				y0: -thickness,
				y1: 0
			};
		case 'builtin':
		case 'obstacle':
		case 'washbasin':
		case 'toilet':
		case 'shower':
		case 'bathtub':
		case 'kitchenRun':
		case 'acWall':
			return { x0: element.offset, x1: element.offset + element.width, y0: 0, y1: element.depth };
		case 'radiator':
			return {
				x0: element.offset,
				x1: element.offset + element.width,
				y0: 0,
				y1: Math.max(element.depth, 5 / pxPerMm)
			};
		default:
			return { x0: center - total / 2, x1: center + total / 2, y0: 0, y1: radius * 2 };
	}
}

export function hitBounds(
	element: WallElement,
	pxPerMm: number,
	minPx = 44,
	thickness = WALL_THICKNESS
): Bounds {
	const bounds = localBounds(element, pxPerMm, thickness);
	const min = minPx / pxPerMm;
	const growX = Math.max(0, min - (bounds.x1 - bounds.x0)) / 2;
	const growY = Math.max(0, min - (bounds.y1 - bounds.y0)) / 2;
	return {
		x0: bounds.x0 - growX,
		x1: bounds.x1 + growX,
		y0: bounds.y0 - growY,
		y1: bounds.y1 + growY
	};
}

export function lateralMeasure(
	element: WallElement,
	pxPerMm: number,
	thickness = WALL_THICKNESS
): number {
	const px = (n: number) => n / pxPerMm;
	if (element.kind === 'door' || element.kind === 'window') {
		return -(thickness + px(26));
	}
	const bounds = localBounds(element, pxPerMm, thickness);
	return Math.max(bounds.y1, px(24)) + px(20);
}

// Free elements are drawn around their centre, turned by their rotation.
export function freeBounds(element: Pick<FreeElement, 'width' | 'depth'>): Bounds {
	return {
		x0: -element.width / 2,
		x1: element.width / 2,
		y0: -element.depth / 2,
		y1: element.depth / 2
	};
}
