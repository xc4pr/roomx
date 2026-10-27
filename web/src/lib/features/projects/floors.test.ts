import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { floorsEnabled } from '#lib/core/floors.ts';
import { db } from '#lib/state/db.ts';
import { loadProject } from '#lib/state/persistence.ts';
import { ProjectStore } from '#lib/state/project.svelte.ts';
import { planRooms, underlayRooms } from '#lib/features/board/floorView.ts';
import { collectWarnings } from '#lib/features/board/buildCheck.ts';
import { createRoom } from '#lib/core/defaults.ts';
import { createProjectWithFloors } from './create.ts';
import {
	floorNamesFor,
	floorRemovable,
	insertIndex,
	orderedFloorNames,
	toggleFloorName,
	unusedFloorNames
} from './floors.ts';

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

async function open(floors?: string[]) {
	const store = new ProjectStore();
	const id = await createProjectWithFloors('Haus', floors);
	await store.open(id);
	return { store, id };
}

describe('creating a project', () => {
	it('starts with one floor by default: no floors in the data', async () => {
		const { id } = await open();
		const project = await loadProject(id);
		expect(project && floorsEnabled(project)).toBe(false);
	});

	it('starts with the chosen floors in order', async () => {
		const { id } = await open(['EG', '1. OG', 'DG']);
		const project = await loadProject(id);
		expect(project?.floors?.map((floor) => floor.name)).toEqual(['EG', '1. OG', 'DG']);
	});

	it('orders chosen names bottom to top', () => {
		expect(orderedFloorNames(['DG', 'EG', 'UG'])).toEqual(['UG', 'EG', 'DG']);
		expect(toggleFloorName(['EG', '1. OG'], 'UG')).toEqual(['UG', 'EG', '1. OG']);
		expect(toggleFloorName(['EG', '1. OG'], 'EG')).toEqual(['1. OG']);
	});
});

describe('floors on and off', () => {
	it('switches on with all rooms on the first floor, off again when allowed', async () => {
		const { store } = await open();
		store.addRoom('A');
		store.enableFloors(['EG', '1. OG']);
		const project = store.project!;
		expect(project.rooms[0].floorId).toBe(project.floors![0].id);
		expect(store.disableFloors()).toBe(true);
		expect(store.project!.floors).toBeUndefined();
	});

	it('refuses to switch off while rooms sit on two floors', async () => {
		const { store } = await open(['EG', '1. OG']);
		const upper = store.project!.floors![1].id;
		store.addRoom('A');
		store.addRoom('B', 'other', upper);
		expect(store.disableFloors()).toBe(false);
		expect(floorsEnabled(store.project!)).toBe(true);
	});

	it('removes only empty floors and never the last', async () => {
		const { store } = await open(['EG', '1. OG']);
		const [ground, upper] = store.project!.floors!;
		store.addRoom('A', 'other', ground.id);
		expect(floorRemovable(store.project!, ground.id)).toBe(false);
		expect(floorRemovable(store.project!, upper.id)).toBe(true);
		store.removeFloor(upper.id);
		expect(floorRemovable(store.project!, ground.id)).toBe(false);
	});

	it('inserts suggested names where they belong', async () => {
		const { store } = await open(['EG', '1. OG']);
		expect(insertIndex(store.project!, 'UG')).toBe(0);
		expect(insertIndex(store.project!, 'DG')).toBeUndefined();
		expect(unusedFloorNames(store.project!)).toEqual(['UG', '2. OG', 'DG']);
	});
});

describe('plan per floor', () => {
	it('shows only the rooms of the chosen floor', async () => {
		const { store } = await open(['EG', '1. OG']);
		const [ground, upper] = store.project!.floors!;
		store.addRoom('A', 'other', ground.id);
		store.addRoom('B', 'other', upper.id);
		expect(planRooms(store.project!, ground.id).map((room) => room.name)).toEqual(['A']);
		expect(planRooms(store.project!, upper.id).map((room) => room.name)).toEqual(['B']);
	});

	it('shows every room without floors', async () => {
		const { store } = await open();
		store.addRoom('A');
		store.addRoom('B');
		expect(planRooms(store.project!, undefined)).toHaveLength(2);
		expect(underlayRooms(store.project!, undefined)).toEqual([]);
	});

	it('uses the floor below as the template, none for the lowest', async () => {
		const { store } = await open(['EG', '1. OG']);
		const [ground, upper] = store.project!.floors!;
		store.addRoom('A', 'other', ground.id);
		expect(underlayRooms(store.project!, upper.id).map((room) => room.name)).toEqual(['A']);
		expect(underlayRooms(store.project!, ground.id)).toEqual([]);
	});

	it('puts new rooms on the chosen floor', async () => {
		const { store } = await open(['EG', '1. OG']);
		const upper = store.project!.floors![1].id;
		const id = store.addRoom('B', 'other', upper)!;
		expect(store.room(id)?.floorId).toBe(upper);
	});

	it('checks connections per floor', () => {
		const a = { ...createRoom('a', 'A'), floorId: 'f1' };
		const b = { ...createRoom('b', 'B'), floorId: 'f2' };
		expect(collectWarnings([a, b], () => ({ done: 0, total: 0 }))).toEqual([]);
		const c = { ...createRoom('c', 'C'), floorId: 'f1', boardPos: { x: 9000, y: 0, rot: 0 } };
		expect(collectWarnings([a, b, c], () => ({ done: 0, total: 0 })).map((w) => w.kind)).toEqual([
			'unconnected',
			'unconnected'
		]);
	});
});

describe('localized floor names', () => {
	it('offers English names and keeps the building order for both languages', () => {
		expect(floorNamesFor('de')).toEqual(['UG', 'EG', '1. OG', '2. OG', 'DG']);
		expect(floorNamesFor('en')).toEqual([
			'Basement',
			'Ground floor',
			'1st floor',
			'2nd floor',
			'Attic'
		]);
		const project = { floors: [{ id: 'a', name: 'Ground floor', slabThickness: 300 }] };
		expect(unusedFloorNames(project, floorNamesFor('en'))).not.toContain('Ground floor');
		expect(insertIndex(project, 'Basement')).toBe(0);
		expect(insertIndex(project, 'Attic')).toBeUndefined();
	});
});
