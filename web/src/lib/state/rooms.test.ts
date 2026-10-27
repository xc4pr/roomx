import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement } from '#lib/core/defaults.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import { db } from './db.ts';
import { loadProject } from './persistence.ts';
import { createProject, ProjectStore } from './project.svelte.ts';

const opened: ProjectStore[] = [];

async function openStore() {
	const store = new ProjectStore();
	opened.push(store);
	const id = await createProject('Haus');
	await store.open(id);
	return { store, id };
}

afterEach(async () => {
	await Promise.all(opened.splice(0).map((store) => store.flush()));
});

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('room type', () => {
	it('keeps every element when the type changes', async () => {
		const { store } = await openStore();
		const bath = store.addRoom('Bad', 'bath')!;
		const ids = sequentialIds('e');
		store.addElement(bath, createElement('toilet', store.room(bath)!, 1, 1000, ids));
		store.addElement(bath, createElement('door', store.room(bath)!, 3, 1000, ids));
		store.changeRoomType(bath, 'office');
		expect(store.room(bath)!.type).toBe('office');
		expect(store.room(bath)!.elements.map((element) => element.kind)).toEqual(['toilet', 'door']);
		store.undo();
		expect(store.room(bath)!.type).toBe('bath');
	});

	it('moves doors in a shared wall into the indoor room when a room becomes a terrace', async () => {
		const { store, id } = await openStore();
		const kitchen = store.addRoom('Küche', 'kitchen')!;
		const terrace = store.addRoom('Terrasse', 'other')!;
		store.moveRoom(terrace, { x: 0, y: 3150, rot: 0 });
		const ids = sequentialIds('e');
		const door = createElement('door', store.room(terrace)!, 1, 1000, ids);
		const lone = createElement('window', store.room(terrace)!, 3, 2000, ids);
		store.addElement(terrace, door);
		store.addElement(terrace, lone);
		store.changeRoomType(terrace, 'terrace');
		expect(store.room(terrace)!.elements.map((element) => element.id)).toEqual([lone.id]);
		const moved = store.room(kitchen)!.elements;
		expect(moved).toHaveLength(1);
		expect(moved[0]).toMatchObject({ id: door.id, kind: 'door', wall: 3, offset: 2600 });
		await store.flush();
		expect(
			(await loadProject(id))!.rooms.find((room) => room.id === kitchen)!.elements
		).toHaveLength(1);
		store.undo();
		expect(store.room(terrace)!.elements).toHaveLength(2);
		expect(store.room(kitchen)!.elements).toHaveLength(0);
	});
});

describe('floors and stairs', () => {
	it('puts all rooms on the first floor and new rooms on the chosen floor', async () => {
		const { store } = await openStore();
		const a = store.addRoom('Wohnen', 'living')!;
		store.enableFloors(['EG', '1. OG']);
		const [eg, og] = store.project!.floors!;
		expect(store.room(a)!.floorId).toBe(eg.id);
		const b = store.addRoom('Zimmer', 'bedroom', og.id)!;
		expect(store.room(b)!.floorId).toBe(og.id);
		expect(store.room(b)!.boardPos.x).toBe(0);
		const c = store.addRoom('Bad', 'bath')!;
		expect(store.room(c)!.floorId).toBe(eg.id);
	});

	it('switches floors off only while one floor holds rooms and no stair exists', async () => {
		const { store } = await openStore();
		store.addRoom('Wohnen', 'living');
		store.enableFloors(['EG', '1. OG']);
		const [eg, og] = store.project!.floors!;
		const upper = store.addRoom('Zimmer', 'bedroom', og.id)!;
		expect(store.disableFloors()).toBe(false);
		store.updateRoom(upper, { floorId: eg.id });
		const stair = store.addStair({
			fromFloorId: eg.id,
			shape: 'straight',
			x: 0,
			y: 0,
			rotation: 0,
			width: 900,
			turn: 'left'
		})!;
		expect(store.disableFloors()).toBe(false);
		expect(store.removeFloor(og.id)).toBe(false);
		store.removeStair(stair);
		expect(store.removeFloor(og.id)).toBe(true);
		expect(store.disableFloors()).toBe(true);
		expect(store.project!.floors).toBeUndefined();
		expect(store.project!.rooms.every((room) => room.floorId === undefined)).toBe(true);
	});

	it('adds, renames and reorders floors', async () => {
		const { store } = await openStore();
		store.enableFloors();
		const dg = store.addFloor('DG')!;
		const ug = store.addFloor('UG', 0)!;
		store.updateFloor(dg, { slabThickness: 200, height: 2300 });
		expect(store.project!.floors!.map((floor) => floor.name)).toEqual(['UG', 'EG', 'DG']);
		expect(store.moveFloor(ug, 2)).toBe(true);
		expect(store.project!.floors!.map((floor) => floor.name)).toEqual(['EG', 'DG', 'UG']);
		const eg = store.project!.floors![0].id;
		store.addStair({
			fromFloorId: eg,
			shape: 'straight',
			x: 0,
			y: 0,
			rotation: 0,
			width: 900,
			turn: 'left'
		});
		expect(store.moveFloor(dg, 0)).toBe(false);
		expect(store.addFloor('1. OG', 1)).toBeUndefined();
		expect(store.addFloor('2. OG')).toBeDefined();
		expect(store.project!.floors!.map((floor) => floor.name)).toEqual(['EG', 'DG', 'UG', '2. OG']);
		expect(store.project!.floors!.find((floor) => floor.id === dg)).toMatchObject({
			slabThickness: 200,
			height: 2300
		});
	});

	it('adds a floor above a stair that leads nowhere yet', async () => {
		const { store } = await openStore();
		store.enableFloors();
		const og = store.project!.floors!.at(-1)!.id;
		store.addStair({
			fromFloorId: og,
			shape: 'straight',
			x: 0,
			y: 0,
			rotation: 0,
			width: 900,
			turn: 'left'
		});
		const dg = store.addFloor('DG');
		expect(dg).toBeDefined();
		expect(store.moveFloor(dg!, 0)).toBe(false);
	});
});
