import { describe, expect, it } from 'vitest';
import { rectanglePolygon } from '#lib/core/defaults.ts';
import { roomToBoard } from '#lib/core/geometry.ts';
import type { RoomElement } from '#lib/core/schema.ts';
import { reframePolygon, remapAfterInsert, remapAfterRemove } from './polygonEdit.ts';

const door = (wall: number, offset: number): RoomElement => ({
	id: `d${wall}-${offset}`,
	kind: 'door',
	status: 'existing',
	wall,
	offset,
	width: 800,
	height: 2000,
	elevation: 0,
	hinge: 'start',
	swing: 'in'
});

describe('reframePolygon', () => {
	it('keeps the board shape when a corner moves', () => {
		const pos = { x: 1000, y: 500, rot: 0 };
		const moved = rectanglePolygon(4000, 3000).map((p, i) => (i === 1 ? { x: 4000, y: 400 } : p));
		const result = reframePolygon(pos, moved);
		expect(result).toBeDefined();
		const before = moved.map((p) => roomToBoard({ boardPos: pos }, p));
		const after = result!.polygon.map((p) => roomToBoard({ boardPos: result!.boardPos }, p));
		after.forEach((p, i) => {
			expect(Math.abs(p.x - before[i].x)).toBeLessThan(1.5);
			expect(Math.abs(p.y - before[i].y)).toBeLessThan(1.5);
		});
		expect(result!.polygon[0]).toEqual({ x: 0, y: 0 });
		expect(result!.polygon[1].y).toBeCloseTo(0);
	});
});

describe('element remapping', () => {
	it('shifts walls when a corner is inserted', () => {
		const result = remapAfterInsert([door(1, 3000), door(1, 500), door(2, 100)], 1, 2000) as {
			wall: number;
			offset: number;
		}[];
		expect(result.map((e) => [e.wall, e.offset])).toEqual([
			[2, 1000],
			[1, 500],
			[3, 100]
		]);
	});

	it('merges walls when a corner is removed', () => {
		const result = remapAfterRemove([door(1, 100), door(2, 100), door(3, 100)], 1, 4000) as {
			wall: number;
			offset: number;
		}[];
		expect(result.map((e) => [e.wall, e.offset])).toEqual([
			[1, 100],
			[1, 4100],
			[2, 100]
		]);
	});
});
