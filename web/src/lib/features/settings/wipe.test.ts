import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '#lib/state/db.ts';
import { emptyProject, getPhoto, listProjects, saveProject } from '#lib/state/persistence.ts';
import { ProjectStore } from '#lib/state/project.svelte.ts';
import { trashProject } from '#lib/state/trash.ts';
import { clearPrefixedKeys, wipeAllLocalData } from './wipe.ts';

function memoryStorage(initial: Record<string, string>) {
	const items = new Map(Object.entries(initial));
	return {
		items,
		get length() {
			return items.size;
		},
		key: (index: number) => [...items.keys()][index] ?? null,
		removeItem: (key: string) => void items.delete(key)
	};
}

beforeEach(async () => {
	await db.open();
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('clearPrefixedKeys', () => {
	it('removes only the keys of roomx', () => {
		const storage = memoryStorage({
			'roomx.settings': '{}',
			'roomx.sync': '{}',
			'roomx.panelWidth': '400',
			other: '1',
			'my.roomx.thing': '1'
		});
		expect(clearPrefixedKeys(storage)).toBe(3);
		expect([...storage.items.keys()]).toEqual(['other', 'my.roomx.thing']);
	});

	it('copes with missing storage', () => {
		expect(clearPrefixedKeys(undefined)).toBe(0);
	});
});

describe('wipeAllLocalData', () => {
	it('empties the database, the settings and the open project', async () => {
		await saveProject(emptyProject('a', 'A'));
		await saveProject(emptyProject('b', 'B'));
		await trashProject('b');
		await db.photos.put({
			hash: 'a'.repeat(64),
			blob: new Blob(['x']),
			thumbnail: new Blob(['x']),
			w: 1,
			h: 1,
			uploaded: false
		});
		await db.previews.put({ projectId: 'a', blob: new Blob(['x']), updatedAt: '2026-01-01' });
		const storage = memoryStorage({ 'roomx.settings': '{}', 'roomx.reminder': '{}', keep: 'me' });
		await wipeAllLocalData({ storages: [storage] });
		await db.open();

		expect(await listProjects()).toEqual([]);
		expect(await db.projects.count()).toBe(0);
		expect(await db.trash.count()).toBe(0);
		expect(await db.previews.count()).toBe(0);
		expect(await db.sync.count()).toBe(0);
		expect(await getPhoto('a'.repeat(64))).toBeUndefined();
		expect([...storage.items.keys()]).toEqual(['keep']);
	});

	it('does not write the open project back afterwards', async () => {
		const { store } = await import('#lib/state/project.svelte.ts');
		await saveProject(emptyProject('a', 'A'));
		await store.open('a');
		store.rename('Nicht mehr speichern');
		await wipeAllLocalData({ storages: [] });
		await store.flush();
		await db.open();
		expect(await db.projects.count()).toBe(0);
		expect(store.project).toBeNull();
	});

	it('leaves an unrelated store alone', async () => {
		const other = new ProjectStore();
		await wipeAllLocalData({ storages: [] });
		expect(other.project).toBeNull();
	});
});
