import { describe, expect, it } from 'vitest';
import { rectanglePolygon } from '#lib/core/defaults.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import type { Slope } from '#lib/core/schema.ts';
import {
	addDormer,
	addSection,
	angleForDepth,
	depthOf,
	dormerWindow,
	freeSectionGap,
	isWholeWall,
	removeDormer,
	resizeDormer,
	resizeSection,
	restrictToPart,
	widenToWholeWall
} from './sections.ts';

const room = { polygon: rectanglePolygon(6000, 3000), height: 2500 };
const base: Slope = { id: 's1', wall: 1, kneeHeight: 500, angle: 45 };

describe('depth and angle', () => {
	it('gives 45 degrees for the documented example', () => {
		expect(angleForDepth({ height: 2500 }, 500, 2000)).toBe(45);
		expect(depthOf({ height: 2500 }, { kneeHeight: 500, angle: 45 })).toBe(2000);
	});

	it('keeps the angle when the room height changes', () => {
		const slope = { ...base, angle: angleForDepth({ height: 2500 }, 500, 1500) };
		expect(depthOf({ height: 2500 }, slope)).toBeGreaterThanOrEqual(1495);
		expect(depthOf({ height: 2500 }, slope)).toBeLessThanOrEqual(1505);
		expect(depthOf({ height: 3000 }, slope)).toBeGreaterThan(depthOf({ height: 2500 }, slope));
	});
});

describe('sections', () => {
	it('stores the whole wall without from and to', () => {
		const part = restrictToPart(base, 6000);
		expect(isWholeWall(part)).toBe(false);
		expect(isWholeWall(widenToWholeWall(part))).toBe(true);
		expect('from' in widenToWholeWall(part)).toBe(false);
	});

	it('adds a section into the free part and refuses when the wall is full', () => {
		const first = restrictToPart(base, 6000);
		const next = addSection([first], 1, 6000, sequentialIds('n'))!;
		expect(next).toHaveLength(2);
		expect(next[1].from).toBe(3000);
		expect(next[1].to).toBe(6000);
		expect(freeSectionGap(next, 6000)).toBeUndefined();
		expect(addSection(next, 1, 6000, sequentialIds('m'))).toBeUndefined();
	});

	it('limits a section so that sections never overlap', () => {
		const a: Slope = { ...base, id: 'a', from: 0, to: 2000 };
		const b: Slope = { ...base, id: 'b', from: 3000, to: 5000 };
		const grown = resizeSection([a, b], 'a', { to: 4500 }, 6000);
		expect(grown[0].to).toBe(3000);
		const moved = resizeSection([a, b], 'b', { from: 1000 }, 6000);
		expect(moved[1].from).toBe(2000);
		const stretched = resizeSection([a, b], 'a', { to: 100 }, 6000);
		expect(stretched[0].to).toBe(300);
	});

	it('goes back to a whole wall when the section covers it', () => {
		const grown = resizeSection(
			[{ ...base, from: 1000, to: 5000 }],
			's1',
			{ from: 0, to: 6000 },
			6000
		);
		expect(isWholeWall(grown[0])).toBe(true);
	});
});

describe('dormers', () => {
	const section: Slope = { ...base, from: 1000, to: 5000 };

	it('adds a dormer in the middle of the free stretch, 2.10 m high', () => {
		const next = addDormer(section, 6000, room, sequentialIds('d'))!;
		expect(next.dormers).toHaveLength(1);
		expect(next.dormers![0]).toMatchObject({ from: 2250, to: 3750, height: 2100 });
	});

	it('limits the height to the room height and keeps dormers apart', () => {
		const one = addDormer(section, 6000, { height: 1800 }, sequentialIds('d'))!;
		expect(one.dormers![0].height).toBe(1800);
		const two = addDormer(one, 6000, room, sequentialIds('e'))!;
		const [first, second] = two.dormers!;
		const apart = (slope: Slope) => {
			const [a, b] = [...slope.dormers!].sort((x, y) => x.from - y.from);
			return a.to <= b.from;
		};
		expect(apart(two)).toBe(true);
		expect(
			apart(resizeDormer(two, second.id, { from: first.from, to: first.to }, 6000, room))
		).toBe(true);
		expect(apart(resizeDormer(two, first.id, { from: 2000, to: 4900 }, 6000, room))).toBe(true);
		const tall = resizeDormer(two, first.id, { height: 9000 }, 6000, room);
		expect(tall.dormers![0].height).toBe(2500);
	});

	it('removes a dormer and drops the empty list', () => {
		const one = addDormer(section, 6000, room, sequentialIds('d'))!;
		expect(removeDormer(one, one.dormers![0].id).dormers).toBeUndefined();
	});

	it('puts a window into the dormer front', () => {
		const one = addDormer(section, 6000, room, sequentialIds('d'))!;
		const dormer = one.dormers![0];
		const window = dormerWindow(room, one, dormer, sequentialIds('w'))!;
		expect(window.kind).toBe('window');
		expect(window.wall).toBe(1);
		expect(window.width).toBe(dormer.to - dormer.from - 300);
		expect(window.offset).toBe(dormer.from + 150);
		expect(window.elevation + window.height).toBe(dormer.height - 100);
		expect(window.elevation).toBeGreaterThanOrEqual(0);
	});

	it('refuses a window when the dormer is too narrow', () => {
		const narrow = { id: 'x', from: 1000, to: 1500, height: 2100 };
		expect(dormerWindow(room, section, narrow, sequentialIds('w'))).toBeUndefined();
	});

	it('sinks the window to the floor in a low dormer', () => {
		const low = { id: 'x', from: 1000, to: 2500, height: 1200 };
		const window = dormerWindow(room, section, low, sequentialIds('w'))!;
		expect(window.elevation).toBe(0);
		expect(window.height).toBe(1100);
	});
});
