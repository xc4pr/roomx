import { stripCover } from '#lib/core/outdoor.ts';
import { describe, expect, it } from 'vitest';
import { rectanglePolygon } from '#lib/core/defaults.ts';
import { roomToBoard } from '#lib/core/geometry.ts';
import type { RoomElement } from '#lib/core/schema.ts';
import {
	reframeCover,
	reframeElements,
	reframePolygon,
	remapAfterInsert,
	remapAfterRemove
} from './polygonEdit.ts';

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

describe('reframeElements', () => {
	it('keeps columns and ceiling lamps in place on the board and turns free elements with the room', () => {
		const from = { x: 1000, y: 500, rot: 0 };
		const to = { x: 1000, y: 900, rot: 90 };
		const column = {
			id: 'c',
			kind: 'column' as const,
			status: 'existing' as const,
			x: 2000,
			y: 1500,
			rotation: 30,
			width: 300,
			depth: 300,
			height: 2500,
			elevation: 0,
			shape: 'round' as const
		};
		const lamp = {
			id: 'l',
			kind: 'ceilingLamp' as const,
			status: 'existing' as const,
			x: 500,
			y: 500
		};
		const [movedColumn, movedLamp] = reframeElements([column, lamp], from, to);
		for (const [before, after] of [
			[column, movedColumn],
			[lamp, movedLamp]
		] as const) {
			if (after.kind !== 'column' && after.kind !== 'ceilingLamp') throw new Error('kind');
			const a = roomToBoard({ boardPos: from }, before);
			const b = roomToBoard({ boardPos: to }, after);
			expect(Math.abs(a.x - b.x)).toBeLessThan(1);
			expect(Math.abs(a.y - b.y)).toBeLessThan(1);
		}
		expect(movedColumn).toMatchObject({ rotation: 300 });
	});
});

describe('reframeCover', () => {
	const polygon = [
		{ x: 0, y: 0 },
		{ x: 4000, y: 0 },
		{ x: 4000, y: 2000 },
		{ x: 0, y: 2000 }
	];
	const from = { x: 0, y: 0, rot: 0 };
	const to = { x: 100, y: 50, rot: 90 };

	it('rebuilds a whole-area cover on the new outline', () => {
		const wider = polygon.map((p) => (p.x === 4000 ? { ...p, x: 5000 } : p));
		const cover = { polygon, height: 2400 };
		expect(reframeCover({ polygon, cover }, wider, from, to)?.polygon).toEqual(wider);
	});

	it('keeps a strip a strip along its wall', () => {
		const cover = { polygon: stripCover({ polygon }, 1, 1500, 2400)!.polygon, height: 2400 };
		const wider = polygon.map((p) => (p.x === 4000 ? { ...p, x: 5000 } : p));
		const result = reframeCover({ polygon, cover }, wider, from, to);
		expect(result?.polygon.map((p) => p.x)).toEqual([0, 5000, 5000, 0]);
	});

	it('keeps a hand-drawn cover in place on the board', () => {
		const cover = {
			polygon: [
				{ x: 100, y: 100 },
				{ x: 900, y: 100 },
				{ x: 900, y: 700 }
			],
			height: 2400
		};
		const result = reframeCover({ polygon, cover }, polygon, from, to)!;
		cover.polygon.forEach((p, i) => {
			const a = roomToBoard({ boardPos: from }, p);
			const b = roomToBoard({ boardPos: to }, result.polygon[i]);
			expect(Math.abs(a.x - b.x)).toBeLessThan(1);
			expect(Math.abs(a.y - b.y)).toBeLessThan(1);
		});
	});
});
