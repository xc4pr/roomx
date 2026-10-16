import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement } from '#lib/core/defaults.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import type { Item } from '#lib/core/schema.ts';
import { db } from './db.ts';
import { deleteProject, listProjects, loadProject } from './persistence.ts';
import { createProject, ProjectStore } from './project.svelte.ts';

const desk: Omit<Item, 'id' | 'roomId'> = {
	name: 'Desk',
	category: 'desk',
	dims: { w: 1600, d: 800, h: 740 },
	x: 1000,
	y: 400,
	rotation: 0,
	elevation: 0
};

const opened: ProjectStore[] = [];

async function openStore() {
	const store = new ProjectStore();
	opened.push(store);
	const id = await createProject('Wohnung');
	await store.open(id);
	return { store, id };
}

afterEach(async () => {
	await Promise.all(opened.splice(0).map((store) => store.flush()));
});

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('project store', () => {
	it('adds rooms next to each other and persists them', async () => {
		const { store, id } = await openStore();
		const first = store.addRoom('Schlafzimmer', 'bedroom')!;
		const second = store.addRoom('Büro', 'office')!;
		expect(store.room(first)?.boardPos).toEqual({ x: 0, y: 0, rot: 0 });
		expect(store.room(second)?.boardPos).toEqual({ x: 4500, y: 0, rot: 0 });
		await store.flush();
		expect((await loadProject(id))?.rooms).toHaveLength(2);
		expect((await db.sync.get(id))?.dirty).toBe(true);
	});

	it('undoes and redoes', async () => {
		const { store } = await openStore();
		const roomId = store.addRoom('Raum')!;
		store.updateRoom(roomId, { height: 2700 });
		expect(store.canUndo).toBe(true);
		store.undo();
		expect(store.room(roomId)?.height).toBe(2500);
		store.undo();
		expect(store.project?.rooms).toHaveLength(0);
		expect(store.canUndo).toBe(false);
		store.redo();
		store.redo();
		expect(store.room(roomId)?.height).toBe(2700);
		expect(store.canRedo).toBe(false);
	});

	it('coalesces a drag into one undo step', async () => {
		const { store } = await openStore();
		const roomId = store.addRoom('Raum')!;
		for (const x of [100, 200, 300]) {
			store.moveRoom(roomId, { x, y: 0, rot: 0 }, { coalesce: 'drag' });
		}
		store.sealHistory();
		store.moveRoom(roomId, { x: 900, y: 0, rot: 0 }, { coalesce: 'drag' });
		store.undo();
		expect(store.room(roomId)?.boardPos.x).toBe(300);
		store.undo();
		expect(store.room(roomId)?.boardPos.x).toBe(0);
	});

	it('drops elements of removed walls', async () => {
		const { store } = await openStore();
		const roomId = store.addRoom('Raum')!;
		const room = store.room(roomId)!;
		store.addElement(roomId, createElement('door', room, 4, 1000, sequentialIds()));
		store.addElement(roomId, createElement('ceilingLamp', room, 1, 0, sequentialIds('lamp')));
		store.setPolygon(roomId, room.polygon.slice(0, 3));
		expect(store.room(roomId)?.elements.map((element) => element.kind)).toEqual(['ceilingLamp']);
	});

	it('creates a variant on demand and moves stacked items with their carrier', async () => {
		const { store } = await openStore();
		const roomId = store.addRoom('Raum')!;
		const deskId = store.addItem({ ...desk, roomId })!;
		const monitorId = store.addItem({
			...desk,
			roomId,
			name: 'Monitor',
			category: 'electronics',
			dims: { w: 600, d: 200, h: 450 },
			y: 100,
			elevation: 740,
			onItemId: deskId
		})!;
		expect(store.project?.variants).toHaveLength(1);
		expect(store.activeVariant?.name).toBe('A');
		store.transformItem(deskId, { x: 2000, y: 1400 });
		expect(store.item(monitorId)).toMatchObject({ x: 2000, y: 1100, elevation: 740 });
		store.transformItem(deskId, { rotation: 90 });
		expect(store.item(monitorId)).toMatchObject({ x: 2300, y: 1400, rotation: 90 });
		store.removeItem(deskId);
		expect(store.item(monitorId)).toMatchObject({ elevation: 0 });
		expect(store.item(monitorId)?.onItemId).toBeUndefined();
	});

	it('copies variants with remapped stacking and accepts suggestions', async () => {
		const { store } = await openStore();
		const roomId = store.addRoom('Raum')!;
		const deskId = store.addItem({ ...desk, roomId })!;
		store.addItem({ ...desk, roomId, name: 'Monitor', onItemId: deskId, elevation: 740 });
		const sourceId = store.activeVariant!.id;
		const copyId = store.addVariant('B', sourceId)!;
		const copy = store.project!.variants.find((variant) => variant.id === copyId)!;
		expect(copy.items).toHaveLength(2);
		expect(copy.items[1].onItemId).toBe(copy.items[0].id);
		expect(copy.items[0].id).not.toBe(deskId);

		const socket = createElement('socket', store.room(roomId)!, 1, 500, sequentialIds('s'));
		store.importVariants([
			{
				id: 'ai',
				name: 'KI',
				source: 'ai',
				items: [],
				suggestions: [{ roomId, element: { ...socket, status: 'suggested' } }]
			}
		]);
		expect(store.project?.activeVariantId).toBe('ai');
		store.acceptSuggestion('ai', socket.id);
		expect(store.room(roomId)?.elements[0]).toMatchObject({ id: socket.id, status: 'planned' });
		expect(store.activeVariant?.suggestions).toEqual([]);
	});

	it('removes a room with its items and keeps tombstones for deleted projects', async () => {
		const { store, id } = await openStore();
		const roomId = store.addRoom('Raum')!;
		store.addItem({ ...desk, roomId });
		store.removeRoom(roomId);
		expect(store.activeVariant?.items).toEqual([]);
		await store.close();
		await deleteProject(id);
		expect(await listProjects()).toEqual([]);
		expect((await db.projects.get(id))?.deleted).toBe(true);
	});
});
