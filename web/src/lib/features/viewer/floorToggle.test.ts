import { describe, expect, it } from 'vitest';
import { createRoom } from '#lib/core/defaults.ts';
import type { Project } from '#lib/core/schema.ts';
import { floorsWithRooms, toggleHidden } from './floorToggle.ts';

const project: Pick<Project, 'floors' | 'rooms'> = {
	floors: [
		{ id: 'ug', name: 'UG', slabThickness: 300 },
		{ id: 'eg', name: 'EG', slabThickness: 300 },
		{ id: 'og', name: 'OG', slabThickness: 300 }
	],
	rooms: [
		{ ...createRoom('a', 'A', 'living'), floorId: 'eg' },
		{ ...createRoom('b', 'B', 'living'), floorId: 'og' }
	]
};

describe('floor toggle', () => {
	it('offers only floors that hold rooms', () => {
		expect(floorsWithRooms(project).map((floor) => floor.id)).toEqual(['eg', 'og']);
	});

	it('keeps the last visible floor even when empty floors exist', () => {
		const ids = floorsWithRooms(project).map((floor) => floor.id);
		const first = toggleHidden(ids, [], 'eg');
		expect(first).toEqual(['eg']);
		expect(toggleHidden(ids, first, 'og')).toEqual(['eg']);
		expect(toggleHidden(ids, first, 'eg')).toEqual([]);
	});
});
