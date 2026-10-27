import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement } from '#lib/core/defaults.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import { db } from '#lib/state/db.ts';
import { createProject, ProjectStore } from '#lib/state/project.svelte.ts';
import { describeTypeChange, noticeMessage, selectableTypes } from './roomType.ts';

const opened: ProjectStore[] = [];

async function openStore() {
	const store = new ProjectStore();
	opened.push(store);
	await store.open(await createProject('Haus'));
	return store;
}

afterEach(async () => {
	await Promise.all(opened.splice(0).map((store) => store.flush()));
});

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('selectableTypes', () => {
	it('offers the outdoor types for every room', () => {
		for (const current of ['living', 'terrace'] as const) {
			const types = selectableTypes(current);
			expect(types).toContain('kitchen');
			expect(types).toEqual(
				expect.arrayContaining(['balcony', 'terrace', 'garden', 'winterGarden'])
			);
		}
	});
});

describe('describeTypeChange', () => {
	it('reports doors that moved to the house and elements that do not fit', async () => {
		const store = await openStore();
		const kitchen = store.addRoom('Küche', 'kitchen')!;
		const terrace = store.addRoom('Terrasse', 'other')!;
		store.moveRoom(terrace, { x: 0, y: 3150, rot: 0 });
		const ids = sequentialIds('e');
		store.addElement(terrace, createElement('door', store.room(terrace)!, 1, 1000, ids));
		store.addElement(terrace, createElement('window', store.room(terrace)!, 3, 2000, ids));
		const before = store.room(terrace)!.elements.map((element) => element.id);
		store.changeRoomType(terrace, 'terrace');
		const notice = describeTypeChange(terrace, before, store.project!.rooms);
		expect(notice).toEqual({ moved: [{ room: 'Küche', count: 1 }], unfit: 1 });
		expect(store.room(kitchen)!.elements).toHaveLength(1);
		expect(noticeMessage(notice)).toContain('Küche');
	});

	it('stays silent when nothing moved and everything fits', async () => {
		const store = await openStore();
		const room = store.addRoom('Wohnen', 'living')!;
		const before = store.room(room)!.elements.map((element) => element.id);
		store.changeRoomType(room, 'office');
		expect(describeTypeChange(room, before, store.project!.rooms)).toEqual({ moved: [], unfit: 0 });
	});
});
