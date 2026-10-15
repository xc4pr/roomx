import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import type { Project } from '#lib/core/schema.ts';
import { RoomxDatabase } from './db.ts';

describe('upgrade from database version 2', () => {
	it('keeps data and adds empty mirror tables', async () => {
		const name = 'roomx-upgrade-test';
		const old = new Dexie(name);
		old.version(1).stores({
			projects: 'id, updatedAt',
			photos: 'hash',
			sync: 'projectId',
			previews: 'projectId',
			kv: 'key'
		});
		old.version(2).stores({ trash: 'projectId' });
		await old.open();
		await old.table('projects').put({ id: 'p1', name: 'Alt', updatedAt: '2026-01-01' });
		await old.table('trash').put({ projectId: 'p1', trashedAt: '2026-01-02' });
		await old.table('kv').put({ key: 'k', value: 1 });
		old.close();

		const db = new RoomxDatabase(name);
		await db.open();
		expect(db.verno).toBe(3);
		expect((await db.projects.get('p1'))?.name).toBe('Alt');
		expect((await db.trash.get('p1'))?.trashedAt).toBe('2026-01-02');
		expect((await db.kv.get('k'))?.value).toBe(1);
		expect(await db.mirrorJobs.count()).toBe(0);
		expect(await db.mirrorShots.count()).toBe(0);

		await db.mirrorJobs.put({
			id: 'j',
			role: 'host',
			projectId: 'p1',
			token: 't',
			createdAt: 1,
			expiresAt: 2,
			rooms: [],
			links: [],
			received: []
		});
		expect((await db.mirrorJobs.where('projectId').equals('p1').toArray()).length).toBe(1);
		expect(((await db.projects.toArray()) as Project[]).length).toBe(1);
		db.close();
		await Dexie.delete(name);
	});
});
