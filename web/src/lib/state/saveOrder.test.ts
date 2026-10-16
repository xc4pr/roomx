import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '#lib/core/schema.ts';
import { db } from './db.ts';
import { loadProject } from './persistence.ts';
import { createProject, ProjectStore } from './project.svelte.ts';
import { reportStorageRecovered } from './storageErrors.ts';
import { storageHealth } from './storageHealth.svelte.ts';

const RETRY = 5000;
const stores: ProjectStore[] = [];

async function openStore(name = 'Wohnung') {
	const store = new ProjectStore();
	stores.push(store);
	const id = await createProject(name);
	await store.open(id);
	return { store, id };
}

function failWhen(shouldFail: (project: Project, call: number) => boolean) {
	const realPut = db.projects.put.bind(db.projects) as (project: Project) => Promise<string>;
	const calls = new Map<string, number>();
	vi.spyOn(db.projects, 'put').mockImplementation((async (project: Project) => {
		const call = (calls.get(project.id) ?? 0) + 1;
		calls.set(project.id, call);
		if (shouldFail(project, call)) throw new DOMException('flaky', 'UnknownError');
		return realPut(project);
	}) as unknown as typeof db.projects.put);
}

async function roomNames(id: string) {
	return (await loadProject(id))?.rooms.map((room) => room.name);
}

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
	reportStorageRecovered();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	for (const store of stores.splice(0)) store.abandon();
});

describe('the newest snapshot of a project always wins', () => {
	it('keeps the newer state when the older save fails and the newer succeeds', async () => {
		const { store, id } = await openStore();
		failWhen((_, call) => call === 1);
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		store.addRoom('A');
		const first = store.flush();
		store.addRoom('B');
		const second = store.flush();
		await Promise.all([first, second]);
		expect(await roomNames(id)).toEqual(['A', 'B']);
		expect(store.hasUnsaved()).toBe(false);
		expect(storageHealth.unsaved).toBe(0);
		await vi.advanceTimersByTimeAsync(RETRY * 2);
		expect(await roomNames(id)).toEqual(['A', 'B']);
		expect(store.hasUnsaved()).toBe(false);
	});

	it('retries the newest state when both saves fail', async () => {
		const { store, id } = await openStore();
		failWhen((_, call) => call <= 2);
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		store.addRoom('A');
		const first = store.flush();
		store.addRoom('B');
		const second = store.flush();
		await Promise.all([first, second]);
		expect(await roomNames(id)).toEqual([]);
		expect(store.hasUnsaved()).toBe(true);
		expect(storageHealth.unsaved).toBe(1);
		await vi.advanceTimersByTimeAsync(RETRY);
		expect(await roomNames(id)).toEqual(['A', 'B']);
		expect(store.hasUnsaved()).toBe(false);
		expect(storageHealth.unsaved).toBe(0);
	});

	it('retries the newer state when the older save succeeds and the newer fails', async () => {
		const { store, id } = await openStore();
		failWhen((_, call) => call === 2);
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		store.addRoom('A');
		const first = store.flush();
		store.addRoom('B');
		const second = store.flush();
		await Promise.all([first, second]);
		expect(await roomNames(id)).toEqual(['A']);
		expect(store.hasUnsaved()).toBe(true);
		expect(storageHealth.unsaved).toBe(1);
		await vi.advanceTimersByTimeAsync(RETRY);
		expect(await roomNames(id)).toEqual(['A', 'B']);
		expect(store.hasUnsaved()).toBe(false);
		expect(storageHealth.unsaved).toBe(0);
	});

	it('does not let projects influence each other', async () => {
		const a = await openStore('A');
		failWhen((project, call) => project.id === a.id && call === 1);
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		a.store.addRoom('a1');
		const flushA = a.store.flush();
		const b = await openStore('B');
		b.store.addRoom('b1');
		await Promise.all([flushA, b.store.flush()]);
		expect(await roomNames(b.id)).toEqual(['b1']);
		expect(b.store.hasUnsaved()).toBe(false);
		expect(await roomNames(a.id)).toEqual([]);
		expect(a.store.hasUnsaved()).toBe(true);
		expect(storageHealth.unsaved).toBe(1);
		await vi.advanceTimersByTimeAsync(RETRY);
		expect(await roomNames(a.id)).toEqual(['a1']);
		expect(await roomNames(b.id)).toEqual(['b1']);
		expect(a.store.hasUnsaved()).toBe(false);
		expect(storageHealth.unsaved).toBe(0);
	});
});

describe('hasUnsaved covers the whole way to the database', () => {
	it('stays true while a write is running', async () => {
		const { store } = await openStore();
		const realPut = db.projects.put.bind(db.projects) as (project: Project) => Promise<string>;
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => (release = resolve));
		vi.spyOn(db.projects, 'put').mockImplementation((async (project: Project) => {
			await Dexie.waitFor(gate);
			return realPut(project);
		}) as unknown as typeof db.projects.put);
		store.addRoom('A');
		const flushing = store.flush();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(store.hasUnsaved()).toBe(true);
		release();
		await flushing;
		expect(store.hasUnsaved()).toBe(false);
	});

	it('stays true while a continued change waits for the save timer', async () => {
		const { store } = await openStore();
		store.addRoom('A');
		await store.flush();
		expect(store.hasUnsaved()).toBe(false);
		store.rename('Neu');
		expect(store.hasUnsaved()).toBe(true);
		await store.flush();
		expect(store.hasUnsaved()).toBe(false);
	});

	it('counts local changes but not replace()', async () => {
		const { store } = await openStore();
		const start = store.changeCount();
		store.addRoom('A');
		expect(store.changeCount()).toBe(start + 1);
		store.replace(structuredClone(store.snapshot()!));
		expect(store.changeCount()).toBe(start + 1);
	});
});
