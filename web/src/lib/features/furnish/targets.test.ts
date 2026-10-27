import { describe, expect, it } from 'vitest';
import { createRoom } from '#lib/core/defaults.ts';
import { dropTargets } from './targets.ts';

const project = {
	floors: [
		{ id: 'eg', name: 'EG', slabThickness: 300 },
		{ id: 'og', name: 'OG', slabThickness: 300 }
	],
	rooms: [
		{ ...createRoom('a', 'A'), floorId: 'eg' },
		{ ...createRoom('b', 'B'), floorId: 'eg' },
		{ ...createRoom('c', 'C'), floorId: 'og' }
	]
};

describe('dropTargets', () => {
	it('offers only rooms of the shown floor other than the current one', () => {
		expect(dropTargets(project, 'eg', project.rooms[0]).map((room) => room.id)).toEqual(['b']);
	});

	it('offers every other room without floors', () => {
		const flat = { floors: undefined, rooms: project.rooms };
		expect(dropTargets(flat, undefined, project.rooms[0]).map((room) => room.id)).toEqual([
			'b',
			'c'
		]);
	});
});
