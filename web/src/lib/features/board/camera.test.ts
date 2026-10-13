import { describe, expect, it } from 'vitest';
import {
	boardToScreen,
	fitBox,
	gridSteps,
	isInRegion,
	lerpCamera,
	panBy,
	pinchStep,
	screenToBoard,
	zoomAt,
	MAX_K,
	NO_INSETS
} from './camera.ts';

const size = { width: 1000, height: 600 };

describe('camera', () => {
	it('round-trips between board and screen', () => {
		const cam = { x: -500, y: 2000, k: 0.2 };
		const p = { x: 1234, y: -321 };
		const back = screenToBoard(cam, boardToScreen(cam, p));
		expect(back.x).toBeCloseTo(p.x);
		expect(back.y).toBeCloseTo(p.y);
	});

	it('flips y so that board up is screen up', () => {
		const cam = { x: 0, y: 0, k: 1 };
		expect(boardToScreen(cam, { x: 10, y: 20 })).toEqual({ x: 10, y: -20 });
	});

	it('keeps the cursor point fixed while zooming', () => {
		const cam = { x: 100, y: 800, k: 0.3 };
		const cursor = { x: 420, y: 250 };
		const before = screenToBoard(cam, cursor);
		const zoomed = zoomAt(cam, 1.7, cursor);
		const after = screenToBoard(zoomed, cursor);
		expect(zoomed.k).toBeCloseTo(0.51);
		expect(after.x).toBeCloseTo(before.x);
		expect(after.y).toBeCloseTo(before.y);
	});

	it('clamps the zoom', () => {
		expect(zoomAt({ x: 0, y: 0, k: 1 }, 100, { x: 0, y: 0 }).k).toBe(MAX_K);
	});

	it('pans by screen pixels', () => {
		const moved = panBy({ x: 0, y: 0, k: 0.5 }, 50, 20);
		expect(moved).toEqual({ x: -100, y: 40, k: 0.5 });
	});

	it('pinch scales around the finger centre and follows it', () => {
		const cam = { x: 0, y: 0, k: 1 };
		const previous = { a: { x: 100, y: 100 }, b: { x: 200, y: 100 } };
		const next = { a: { x: 120, y: 130 }, b: { x: 320, y: 130 } };
		const anchor = screenToBoard(cam, { x: 150, y: 100 });
		const result = pinchStep(cam, previous, next);
		expect(result.k).toBeCloseTo(2);
		const landed = screenToBoard(result, { x: 220, y: 130 });
		expect(landed.x).toBeCloseTo(anchor.x);
		expect(landed.y).toBeCloseTo(anchor.y);
	});

	it('fits a box centred inside the free region', () => {
		const box = { minX: 0, minY: 0, maxX: 4000, maxY: 3000 };
		const cam = fitBox(box, size, { top: 0, right: 400, bottom: 0, left: 0 }, { margin: 20 });
		const centre = boardToScreen(cam, { x: 2000, y: 1500 });
		expect(centre.x).toBeCloseTo(300);
		expect(centre.y).toBeCloseTo(300);
		expect(cam.k).toBeCloseTo(Math.min(560 / 4000, 560 / 3000));
		expect(isInRegion(cam, size, NO_INSETS, { x: 2000, y: 1500 })).toBe(true);
	});

	it('respects the max zoom when fitting tiny boxes', () => {
		const cam = fitBox({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, size, NO_INSETS, { maxK: 0.5 });
		expect(cam.k).toBe(0.5);
	});

	it('interpolates cameras between ends', () => {
		const a = { x: 0, y: 600, k: 0.1 };
		const b = { x: 5000, y: 3000, k: 0.4 };
		expect(lerpCamera(a, b, 0, size)).toEqual(expect.objectContaining({ k: 0.1 }));
		const end = lerpCamera(a, b, 1, size);
		expect(end.k).toBeCloseTo(0.4);
		expect(end.x).toBeCloseTo(5000);
		expect(end.y).toBeCloseTo(3000);
		expect(lerpCamera(a, b, 0.5, size).k).toBeCloseTo(0.2);
	});

	it('picks coarser grids when zoomed out', () => {
		expect(gridSteps(1).minor).toBe(100);
		expect(gridSteps(0.05).minor).toBe(500);
		expect(gridSteps(0.015).minor).toBe(1000);
	});
});
