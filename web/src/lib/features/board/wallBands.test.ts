import { describe, expect, it } from 'vitest';
import { wallLinks } from '#lib/core/adjacency.ts';
import { WALL_THICKNESS } from '#lib/core/defaults.ts';
import { rectangleRoom } from '#lib/core/fixtures.ts';
import type { Room } from '#lib/core/schema.ts';
import { bandOutline, thicknessAt, wallPieces } from './wallBands.ts';

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
