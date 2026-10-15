import { describe, expect, it } from 'vitest';
import { clipToViewport, pickAnchor, scrollDelta, visibleFraction } from './anchor.ts';

const viewport = { width: 400, height: 300 };
const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('visibleFraction', () => {
	it('is 1 inside, 0 outside and partial when cut off', () => {
		expect(visibleFraction(box(10, 10, 100, 50), viewport)).toBe(1);
		expect(visibleFraction(box(500, 10, 100, 50), viewport)).toBe(0);
		expect(visibleFraction(box(350, 0, 100, 100), viewport)).toBeCloseTo(0.5);
		expect(visibleFraction(box(0, 0, 0, 0), viewport)).toBe(0);
	});
});

describe('clipToViewport', () => {
	it('cuts the box to the viewport', () => {
		expect(clipToViewport(box(350, 250, 100, 100), viewport)).toEqual(box(350, 250, 50, 50));
	});
});

describe('pickAnchor', () => {
	const all = () => true;

	it('takes the first usable candidate in priority order', () => {
		const picked = pickAnchor(
			[
				{ item: 'hidden', rect: box(500, 0, 50, 50) },
				{ item: 'first', rect: box(10, 10, 50, 50) },
				{ item: 'second', rect: box(80, 10, 50, 50) }
			],
			viewport,
			all
		);
		expect(picked?.item).toBe('first');
	});

	it('skips empty, mostly clipped and covered candidates', () => {
		const picked = pickAnchor(
			[
				{ item: 'empty', rect: box(10, 10, 0, 50) },
				{ item: 'clipped', rect: box(380, 10, 100, 50) },
				{ item: 'covered', rect: box(10, 10, 50, 50) },
				{ item: 'free', rect: box(100, 100, 50, 50) }
			],
			viewport,
			(item) => item !== 'covered'
		);
		expect(picked?.item).toBe('free');
	});

	it('accepts a partly visible candidate and reports its clipped box', () => {
		const picked = pickAnchor([{ item: 'tall', rect: box(10, 200, 100, 150) }], viewport, all);
		expect(picked?.rect).toEqual(box(10, 200, 100, 150));
		expect(picked?.clipped).toEqual(box(10, 200, 100, 100));
	});

	it('returns null when nothing qualifies', () => {
		expect(pickAnchor([], viewport, all)).toBeNull();
		expect(pickAnchor([{ item: 'a', rect: box(0, 600, 10, 10) }], viewport, all)).toBeNull();
	});
});

describe('scrollDelta', () => {
	const port = box(0, 0, 400, 300);

	it('is zero when the box is comfortably inside', () => {
		expect(scrollDelta(box(10, 100, 100, 50), port)).toBe(0);
	});

	it('scrolls down or up just enough', () => {
		expect(scrollDelta(box(10, 400, 100, 50), port)).toBe(400 + 50 - (300 - 16));
		expect(scrollDelta(box(10, -80, 100, 50), port)).toBe(-80 - 16);
	});

	it('aligns the top of a box taller than the port', () => {
		expect(scrollDelta(box(10, 120, 100, 500), port)).toBe(120 - 16);
	});
});
