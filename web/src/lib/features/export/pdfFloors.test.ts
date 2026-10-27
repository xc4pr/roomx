import { describe, expect, it } from 'vitest';
import { createRoom } from '#lib/core/defaults.ts';
import { stairContext } from '#lib/core/floors.ts';
import type { Project, Room, Stair, StairShape } from '#lib/core/schema.ts';
import { openingStart } from './pdfFloors.ts';

function big(id: string, floorId: string): Room {
	const room = createRoom(id, id, 'living');
	room.polygon = [
		{ x: 0, y: 0 },
		{ x: 7000, y: 0 },
		{ x: 7000, y: 5000 },
		{ x: 0, y: 5000 }
	];
	return { ...room, floorId };
}

function project(shape: StairShape): Project {
	const stair: Stair = {
		id: 'st',
		fromFloorId: 'eg',
		shape,
		x: 3500,
		y: 2500,
		rotation: 0,
		width: 900,
		turn: 'left'
	};
	return {
		id: 'p',
		name: 'Haus',
		schemaVersion: 2,
		rev: 0,
		createdAt: '',
		updatedAt: '',
		floors: [
			{ id: 'eg', name: 'EG', slabThickness: 300 },
			{ id: 'og', name: 'OG', slabThickness: 250 }
		],
		rooms: [big('a', 'eg'), big('b', 'og')],
		stairs: [stair],
		variants: []
	};
}

describe('opening start in the stair section', () => {
	it('follows the step number from the height, not the tread index', () => {
		for (const shape of ['straight', 'l', 'u', 'spiral'] as const) {
			const p = project(shape);
			const context = stairContext(p, p.stairs![0])!;
			const { riser, tread } = context.layout.risers;
			const lowest = Math.min(...context.opening.map((t) => t.height));
			const expected = (Math.round(lowest / riser) - 1) * tread;
			expect(openingStart(context)).toBe(expected);
			// A tread list that is not one entry per riser must not shift the opening.
			const shifted = {
				...context,
				layout: { ...context.layout, treads: context.layout.treads.slice(1) }
			};
			expect(openingStart(shifted)).toBe(expected);
		}
	});
});
