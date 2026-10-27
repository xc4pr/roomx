import { describe, expect, it } from 'vitest';
import { createRoom } from '#lib/core/defaults.ts';
import type { Project } from '#lib/core/schema.ts';
import { floorOfSelection, selectionKey } from './floorView.ts';

const project: Pick<Project, 'rooms' | 'floors'> = {
	floors: [
		{ id: 'eg', name: 'EG', slabThickness: 300 },
		{ id: 'og', name: 'OG', slabThickness: 250 }
	],
	rooms: [
		{ ...createRoom('a', 'A', 'living'), floorId: 'eg' },
		{ ...createRoom('b', 'B', 'living'), floorId: 'og' }
	]
};

describe('floorOfSelection', () => {
	it('names the floor of a selected room on another floor', () => {
		expect(floorOfSelection(project, 'b', 'eg')).toBe('og');
	});

	it('does nothing for a room on the shown floor, no selection or no floors', () => {
		expect(floorOfSelection(project, 'a', 'eg')).toBeUndefined();
		expect(floorOfSelection(project, null, 'eg')).toBeUndefined();
		expect(floorOfSelection(project, 'b', undefined)).toBeUndefined();
	});
});

describe('selectionKey', () => {
	it('changes with the selection and with the floor of the selected room only', () => {
		const moved = {
			...project,
			rooms: [{ ...project.rooms[0], floorId: 'og' }, project.rooms[1]]
		};
		expect(selectionKey(project, 'a')).not.toBe(selectionKey(project, 'b'));
		expect(selectionKey(project, 'a')).not.toBe(selectionKey(moved, 'a'));
		expect(selectionKey(project, 'b')).toBe(selectionKey(moved, 'b'));
		expect(selectionKey(project, null)).toBe(selectionKey(moved, null));
	});
});
