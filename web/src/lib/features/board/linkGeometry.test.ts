import { describe, expect, it } from 'vitest';
import { mirroredOpenings, wallLinks } from '#lib/core/adjacency.ts';
import { WALL_THICKNESS } from '#lib/core/defaults.ts';
import { rectangleRoom } from '#lib/core/fixtures.ts';
import type { Door } from '#lib/core/schema.ts';
import { linkSpans } from './linkGeometry.ts';

function pair(door?: Partial<Door>) {
	const left = { ...rectangleRoom('a', 4000, 3000), elements: [] as Door[] };
	const right = {
		...rectangleRoom('b', 3000, 3000),
		elements: [],
		boardPos: { x: 4000 + WALL_THICKNESS, y: 0, rot: 0 }
	};
	if (door) {
		left.elements.push({
			id: 'd',
			kind: 'door',
			status: 'existing',
			wall: 2,
			offset: 1100,
			width: 800,
			height: 2000,
			elevation: 0,
			hinge: 'start',
			swing: 'in',
			...door
		});
	}
	return [left, right];
}

describe('linkSpans', () => {
	it('lists each shared wall once with its symbol in the middle of the wall strip', () => {
		const rooms = pair();
		const spans = linkSpans(rooms, wallLinks(rooms), mirroredOpenings(rooms), 400);
		expect(spans).toHaveLength(1);
		const span = spans[0];
		expect(span.a).toEqual({ x: 4000, y: 0 });
		expect(span.b).toEqual({ x: 4000, y: 3000 });
		expect(span.symbol?.x).toBeCloseTo(4000 + WALL_THICKNESS / 2);
		expect(span.symbol?.y).toBeCloseTo(1500);
		expect(span.outward.x).toBeCloseTo(1);
		expect(span.outward.y).toBeCloseTo(0);
	});

	it('moves the symbol next to a door in the middle of the wall', () => {
		const rooms = pair({ offset: 1100, width: 800 });
		const spans = linkSpans(rooms, wallLinks(rooms), mirroredOpenings(rooms), 400);
		const y = spans[0].symbol?.y ?? 1500;
		expect(Math.abs(y - 1500)).toBeGreaterThan(400);
	});

	it('hides the symbol when it does not fit', () => {
		const rooms = pair();
		const spans = linkSpans(rooms, wallLinks(rooms), mirroredOpenings(rooms), 5000);
		expect(spans[0].symbol).toBeNull();
	});
});
