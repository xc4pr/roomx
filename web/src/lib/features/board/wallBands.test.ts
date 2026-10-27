import { describe, expect, it } from 'vitest';
import { wallLinks } from '#lib/core/adjacency.ts';
import { WALL_THICKNESS } from '#lib/core/defaults.ts';
import { rectangleRoom } from '#lib/core/fixtures.ts';
import type { Room } from '#lib/core/schema.ts';
import {
	bandOutline,
	glassBandPath,
	thicknessAt,
	wallBadgePlacement,
	wallPieces
} from './wallBands.ts';

function pair(thickness: number): Room[] {
	return [
		{ ...rectangleRoom('a', 4000, 3000), elements: [] },
		{
			...rectangleRoom('b', 3000, 2000),
			elements: [],
			boardPos: { x: 4000 + thickness, y: 500, rot: 0 }
		}
	];
}

describe('glass band', () => {
	it('skips the stretch shared with the house', () => {
		const rooms = pair(100);
		const links = wallLinks(rooms).filter((link) => link.roomId === 'a');
		const all = glassBandPath(rooms[0]!.polygon, []);
		const open = glassBandPath(rooms[0]!.polygon, links);
		expect(all.split('Z').length - 1).toBe(4);
		expect(open.split('Z').length - 1).toBeGreaterThan(4);
		expect(open).not.toBe(all);
	});
});

describe('wall bands', () => {
	for (const thickness of [100, 300]) {
		it(`fills the gap exactly at ${thickness} mm on both sides`, () => {
			const rooms = pair(thickness);
			const links = wallLinks(rooms);
			expect(links).toHaveLength(2);
			for (const link of links) {
				const room = rooms.find((r) => r.id === link.roomId);
				if (!room) throw new Error('room');
				const outline = bandOutline(
					room.polygon,
					wallPieces(
						room.polygon,
						links.filter((l) => l.roomId === room.id)
					)
				);
				const reach = (outline: { x: number }[]) => outline.map((p) => p.x);
				if (room.id === 'a') {
					expect(Math.max(...reach(outline))).toBeCloseTo(
						4000 + Math.max(thickness, WALL_THICKNESS)
					);
					const stepped = outline.filter((p) => Math.abs(p.x - (4000 + thickness)) < 1e-6);
					expect(stepped.map((p) => Math.round(p.y)).sort((x, y) => x - y)).toEqual([500, 2500]);
				} else {
					const local = outline.filter((p) => Math.abs(p.x + thickness) < 1e-6);
					expect(local.map((p) => Math.round(p.y)).sort((x, y) => x - y)).toEqual([
						-WALL_THICKNESS,
						2000 + WALL_THICKNESS
					]);
					expect(Math.min(...reach(outline))).toBeCloseTo(-thickness);
				}
			}
		});
	}

	it('keeps the default thickness where no wall is shared', () => {
		const room = pair(WALL_THICKNESS)[0];
		const pieces = wallPieces(room.polygon, []);
		expect(pieces.every((piece) => piece.thickness === WALL_THICKNESS)).toBe(true);
		expect(pieces).toHaveLength(4);
		expect(bandOutline(room.polygon, pieces)).toHaveLength(4);
	});

	it('splits a shared wall into three stretches', () => {
		const rooms = pair(250);
		const link = wallLinks(rooms).filter((l) => l.roomId === 'a');
		const pieces = wallPieces(rooms[0].polygon, link).filter((piece) => piece.wall === 2);
		expect(pieces.map((p) => [p.from, p.to, p.thickness])).toEqual([
			[0, 500, WALL_THICKNESS],
			[500, 2500, 250],
			[2500, 3000, WALL_THICKNESS]
		]);
		expect(thicknessAt(link, 2, 1000, 800)).toBe(250);
		expect(thicknessAt(link, 2, 100, 200)).toBe(WALL_THICKNESS);
		expect(thicknessAt(link, 1, 1000, 800)).toBe(WALL_THICKNESS);
	});
});

describe('wallBadgePlacement', () => {
	it('keeps the middle on an unshared wall', () => {
		expect(wallBadgePlacement(4000, [], 200, null)).toEqual({ along: 2000, inside: false });
	});

	it('moves to the unshared stretch when the middle is shared', () => {
		const placed = wallBadgePlacement(4000, [{ from: 1000, to: 4000 }], 200, null);
		expect(placed.inside).toBe(false);
		expect(placed.along).toBe(500);
	});

	it('goes inside next to the own label when the wall is fully shared', () => {
		const placed = wallBadgePlacement(4000, [{ from: 0, to: 4000 }], 200, {
			along: 2000,
			half: 300
		});
		expect(placed.inside).toBe(true);
		expect(Math.abs(placed.along - 2000)).toBeGreaterThanOrEqual(300 + 100);
	});

	it('ignores unshared stretches that are too short', () => {
		const placed = wallBadgePlacement(4000, [{ from: 100, to: 4000 }], 200, {
			along: 2000,
			half: 300
		});
		expect(placed.inside).toBe(true);
	});

	it('stays inside the wall', () => {
		const placed = wallBadgePlacement(900, [{ from: 0, to: 900 }], 200, { along: 450, half: 400 });
		expect(placed.along).toBeGreaterThanOrEqual(100);
		expect(placed.along).toBeLessThanOrEqual(800);
	});
});
