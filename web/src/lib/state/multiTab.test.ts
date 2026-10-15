import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useBus } from './channel.ts';
import { db } from './db.ts';
import { loadProject } from './persistence.ts';
import { createProject, ProjectStore } from './project.svelte.ts';
import { TabGuard } from './tabs.ts';
import { FakeLocks, Network } from './tabsTesting.ts';

let network: Network;
let locks: FakeLocks;
const stores: ProjectStore[] = [];

function tab(id: string, options: { locks?: boolean } = {}): ProjectStore {
	const bus = network.bus();
	const store = new ProjectStore({
		createGuard: (hooks) =>
			new TabGuard({
				...hooks,
				tabId: id,
				locks: options.locks === false ? null : locks,
				bus,
				probeMs: 20,
				takeoverMs: 80
			})
	});
	stores.push(store);
	return store;
}

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
	network = new Network();
	locks = new FakeLocks();
	useBus(network.bus());
});

afterEach(() => {
	for (const store of stores.splice(0)) store.abandon();
	useBus(null);
});

describe('the same project in two tabs', () => {
	it('opens the second tab read-only and ignores its edits', async () => {
		const id = await createProject('Wohnung');
		const a = tab('a');
		const b = tab('b');
		await a.open(id);
		await b.open(id);
		expect(a.readOnly).toBe(false);
		expect(b.readOnly).toBe(true);

		b.addRoom('Nicht gespeichert');
		b.rename('Nicht gespeichert');
		b.undo();
		await b.flush();
		expect(b.project?.rooms).toHaveLength(0);
		expect(b.project?.name).toBe('Wohnung');
		expect((await loadProject(id))?.rooms).toHaveLength(0);
		expect(b.canUndo).toBe(false);
	});

	it('shows changes of the editing tab live in the read-only tab', async () => {
		const id = await createProject('Wohnung');
		const a = tab('a');
		const b = tab('b');
		await a.open(id);
		await b.open(id);
		a.addRoom('Küche', 'kitchen');
		await a.flush();
		await expect.poll(() => b.project?.rooms.map((room) => room.name)).toEqual(['Küche']);
		a.rename('Neuer Name');
		await a.flush();
		await expect.poll(() => b.project?.name).toBe('Neuer Name');
	});

	it('hands editing over without losing the last change of the old tab', async () => {
		const id = await createProject('Wohnung');
		const a = tab('a');
		const b = tab('b');
		await a.open(id);
		await b.open(id);
		a.mutate((project) => (project.name = 'Gerade getippt'), { coalesce: 'typing' });

		await b.takeOver();
		expect(b.readOnly).toBe(false);
		expect(a.readOnly).toBe(true);
		expect(b.project?.name).toBe('Gerade getippt');
		expect((await loadProject(id))?.name).toBe('Gerade getippt');

		b.addRoom('Bad', 'bath');
		await b.flush();
		await expect.poll(() => a.project?.rooms.map((room) => room.name)).toEqual(['Bad']);
		a.addRoom('Ignoriert');
		expect(a.project?.rooms).toHaveLength(1);
	});

	it('drops the unsaved edits of a tab that lost the lock without warning', async () => {
		const id = await createProject('Wohnung');
		const a = new ProjectStore({
			createGuard: (hooks) =>
				new TabGuard({ ...hooks, tabId: 'a', locks, bus: null, takeoverMs: 80 })
		});
		stores.push(a);
		const b = tab('b');
		await a.open(id);
		await b.open(id);
		a.mutate((project) => (project.name = 'Veraltet'), { coalesce: 'typing' });
		await b.takeOver();
		expect(a.readOnly).toBe(true);
		await a.flush();
		b.addRoom('Neu', 'other');
		await b.flush();
		expect((await loadProject(id))?.name).toBe('Wohnung');
		expect((await loadProject(id))?.rooms).toHaveLength(1);
		await expect.poll(() => a.project?.name).toBe('Wohnung');
	});

	it('frees the project when the editing tab leaves it', async () => {
		const id = await createProject('Wohnung');
		const a = tab('a');
		const b = tab('b');
		await a.open(id);
		await a.releaseLock();
		await b.open(id);
		expect(b.readOnly).toBe(false);
	});

	it('lets different projects be edited in different tabs', async () => {
		const first = await createProject('Eins');
		const second = await createProject('Zwei');
		const a = tab('a');
		const b = tab('b');
		await a.open(first);
		await b.open(second);
		expect(a.readOnly).toBe(false);
		expect(b.readOnly).toBe(false);
	});

	it('works without Web Locks too', async () => {
		const id = await createProject('Wohnung');
		const a = tab('a', { locks: false });
		const b = tab('b', { locks: false });
		await a.open(id);
		await b.open(id);
		expect(a.readOnly).toBe(false);
		expect(b.readOnly).toBe(true);
		await b.takeOver();
		expect(b.readOnly).toBe(false);
		expect(a.readOnly).toBe(true);
	});

	it('closing the project releases it for others', async () => {
		const id = await createProject('Wohnung');
		const a = tab('a');
		const b = tab('b');
		await a.open(id);
		await a.close();
		await b.open(id);
		expect(b.readOnly).toBe(false);
	});
});
