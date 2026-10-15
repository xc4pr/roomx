import { describe, expect, it } from 'vitest';
import {
	applyFit,
	boundsOf,
	estimatePackage,
	fitBounds,
	hatchSegments,
	isTooLarge,
	PACKAGE_EXTRA_BYTES,
	PACKAGE_FILE_COUNT,
	packBlocks,
	paperScale,
	planPhotoPages,
	POINT_MM
} from './layout.ts';

describe('fitBounds', () => {
	it('fits a wide room into a box and centres it', () => {
		const fit = fitBounds(
			{ minX: 0, minY: 0, maxX: 4000, maxY: 3000 },
			{ x: 40, y: 100, w: 400, h: 400 }
		);
		expect(fit.scale).toBeCloseTo(0.1);
		const corner = applyFit(fit, { x: 0, y: 0 });
		const opposite = applyFit(fit, { x: 4000, y: 3000 });
		expect(corner.x).toBeCloseTo(40);
		expect(opposite.x).toBeCloseTo(440);
		expect(corner.y + opposite.y).toBeCloseTo(100 + 100 + 400);
	});

	it('respects padding and tall rooms', () => {
		const fit = fitBounds(
			{ minX: -500, minY: 0, maxX: 500, maxY: 5000 },
			{ x: 0, y: 0, w: 300, h: 400 },
			50
		);
		expect(fit.scale).toBeCloseTo(0.06);
		const low = applyFit(fit, { x: 0, y: 0 });
		const high = applyFit(fit, { x: 0, y: 5000 });
		expect(high.y - low.y).toBeCloseTo(300);
		expect(low.x).toBeCloseTo(150);
	});

	it('can align the drawing to the top of the box', () => {
		const fit = fitBounds(
			{ minX: 0, minY: 0, maxX: 1000, maxY: 500 },
			{ x: 0, y: 0, w: 400, h: 600 },
			20,
			'top'
		);
		const top = applyFit(fit, { x: 0, y: 500 });
		expect(top.y).toBeCloseTo(600 - 20);
	});

	it('survives degenerate bounds', () => {
		const fit = fitBounds(boundsOf([{ x: 5, y: 5 }]), { x: 0, y: 0, w: 100, h: 100 });
		expect(Number.isFinite(fit.scale)).toBe(true);
		expect(boundsOf([])).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
	});
});

describe('paperScale', () => {
	it('rounds up to a common drawing scale', () => {
		expect(paperScale(1 / (50 * POINT_MM))).toBe(50);
		expect(paperScale(1 / (44 * POINT_MM))).toBe(50);
		expect(paperScale(1 / (51 * POINT_MM))).toBe(75);
		expect(paperScale(0)).toBe(1000);
	});
});

describe('planPhotoPages', () => {
	it('groups two photos per page and never mixes rooms', () => {
		expect(planPhotoPages([3, 0, 1])).toEqual([
			{ roomIndex: 0, photoIndexes: [0, 1] },
			{ roomIndex: 0, photoIndexes: [2] },
			{ roomIndex: 2, photoIndexes: [0] }
		]);
	});

	it('returns nothing without photos', () => {
		expect(planPhotoPages([0, 0])).toEqual([]);
	});
});

describe('packBlocks', () => {
	it('fills pages greedily and keeps order', () => {
		expect(packBlocks([300, 300, 300, 100], 700, 20)).toEqual([
			[0, 1],
			[2, 3]
		]);
	});

	it('gives oversized blocks their own page', () => {
		expect(packBlocks([900, 100, 100], 700, 10)).toEqual([[0], [1, 2]]);
	});
});

describe('hatchSegments', () => {
	it('stays inside the rectangle', () => {
		const lines = hatchSegments(100, 40, 10);
		expect(lines.length).toBeGreaterThan(5);
		for (const [x0, y0, x1, y1] of lines) {
			for (const [x, y] of [
				[x0, y0],
				[x1, y1]
			]) {
				expect(x).toBeGreaterThanOrEqual(-1e-9);
				expect(x).toBeLessThanOrEqual(100 + 1e-9);
				expect(y).toBeGreaterThanOrEqual(-1e-9);
				expect(y).toBeLessThanOrEqual(40 + 1e-9);
			}
			expect(y1 - y0).toBeCloseTo(x1 - x0);
		}
		expect(hatchSegments(0, 10, 2)).toEqual([]);
	});
});

describe('estimatePackage', () => {
	it('counts pages for rooms, views, furnishing and photos', () => {
		const small = estimatePackage([{ walls: 4, photos: 5, items: 10 }]);
		expect(small.pages).toBe(1 + 1 + 2 + 1 + 1 + 3);
		expect(small.tooLarge).toBe(false);
	});

	it('leaves out photo pages and photo bytes without photos', () => {
		const room = { walls: 4, photos: 10, items: 10 };
		const with10 = estimatePackage([room]);
		const without = estimatePackage([room], true, false);
		expect(without.pages).toBe(with10.pages - 5);
		expect(with10.bytes - without.bytes).toBeGreaterThanOrEqual(10 * 300_000);
	});

	it('counts the files of the package and their fixed size', () => {
		expect(PACKAGE_FILE_COUNT).toBe(5);
		const empty = estimatePackage([]);
		expect(empty.bytes).toBeGreaterThanOrEqual(PACKAGE_EXTRA_BYTES);
	});

	it('flags large packages by pages or size', () => {
		const many = estimatePackage(
			Array.from({ length: 8 }, () => ({ walls: 4, photos: 20, items: 30 }))
		);
		expect(many.pages).toBeGreaterThan(80);
		expect(many.tooLarge).toBe(true);
		expect(isTooLarge(10, 26 * 1024 * 1024)).toBe(true);
		expect(isTooLarge(10, 1024)).toBe(false);
	});
});
