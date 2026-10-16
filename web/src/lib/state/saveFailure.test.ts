import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db.ts';
import { loadProject } from './persistence.ts';
import { createProject, ProjectStore } from './project.svelte.ts';
import { currentStorageProblem, reportStorageRecovered } from './storageErrors.ts';
import { storageHealth, unsavedSnapshots } from './storageHealth.svelte.ts';

const stores: ProjectStore[] = [];

async function openStore() {
	const store = new ProjectStore();
	stores.push(store);
	const id = await createProject('Wohnung');
	await store.open(id);
	return { store, id };
}

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
	reportStorageRecovered();
});

afterEach(async () => {
	vi.restoreAllMocks();
	for (const store of stores.splice(0)) {
		store.abandon();
	}
});

describe('failing saves are never silent', () => {
	it('reports a full disk, keeps the change and saves it once there is room', async () => {
		const { store, id } = await openStore();
		const quota = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
		const put = vi.spyOn(db.projects, 'put').mockRejectedValue(quota);
		const roomId = store.addRoom('Küche', 'kitchen')!;
		await store.flush();
		expect(currentStorageProblem()).toBe('quota');
		expect(storageHealth.problem).toBe('quota');
		expect(storageHealth.unsaved).toBe(1);
		expect(store.hasUnsaved()).toBe(true);
		expect(unsavedSnapshots()[0].rooms.map((room) => room.id)).toEqual([roomId]);
		expect(store.room(roomId)?.name).toBe('Küche');
		expect((await loadProject(id))?.rooms).toHaveLength(0);

		put.mockRestore();
		await store.flush();
		expect(store.hasUnsaved()).toBe(false);
		expect(storageHealth.problem).toBeNull();
		expect(storageHealth.unsaved).toBe(0);
		expect((await loadProject(id))?.rooms.map((room) => room.id)).toEqual([roomId]);
	});

	it('keeps the newest state when later changes arrive during the outage', async () => {
		const { store, id } = await openStore();
		vi.spyOn(db.projects, 'put').mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
		store.addRoom('Eins', 'other');
		await store.flush();
		store.addRoom('Zwei', 'other');
		await store.flush();
		vi.restoreAllMocks();
		await store.flush();
		expect((await loadProject(id))?.rooms.map((room) => room.name)).toEqual(['Eins', 'Zwei']);
	});

	it('reports storage that is not available at all', async () => {
		const { store } = await openStore();
		const closed = Object.assign(new Error('Database is not open'), {
			name: 'DatabaseClosedError'
		});
		vi.spyOn(db, 'transaction').mockRejectedValue(closed);
		store.addRoom('Bad', 'bath');
		await store.flush();
		expect(storageHealth.problem).toBe('unavailable');
		expect(store.hasUnsaved()).toBe(true);
	});

	it('retries by itself while the problem lasts', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const { store, id } = await openStore();
			const put = vi
				.spyOn(db.projects, 'put')
				.mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));
			store.addRoom('Flur', 'hall');
			await store.flush();
			expect(storageHealth.problem).toBe('quota');
			await vi.advanceTimersByTimeAsync(5100);
			await vi.waitFor(async () => expect((await loadProject(id))?.rooms).toHaveLength(1), {
				timeout: 2000,
				interval: 20
			});
			expect(put).toHaveBeenCalledTimes(2);
			expect(storageHealth.problem).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('lets project creation fail loudly', async () => {
		vi.spyOn(db, 'transaction').mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
		await expect(createProject('Neu')).rejects.toThrowError();
		expect(storageHealth.problem).toBe('quota');
	});

	it('flush never throws, so leaving a page cannot crash', async () => {
		const { store } = await openStore();
		vi.spyOn(db.projects, 'put').mockRejectedValue(new Error('boom'));
		store.addRoom('X', 'other');
		await expect(store.flush()).resolves.toBeUndefined();
		expect(storageHealth.problem).toBe('failed');
	});
});
