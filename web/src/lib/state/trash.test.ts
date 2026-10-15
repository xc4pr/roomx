import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db.ts';
import {
	listProjects,
	loadProject,
	projectIdTaken,
	pruneOrphanPhotos,
	saveProject
} from './persistence.ts';
import {
	daysLeft,
	isExpired,
	listTrash,
	purgeExpiredTrash,
	purgeFromTrash,
	restoreFromTrash,
	TRASH_DAYS,
	trashProject
} from './trash.ts';
import { emptyProject } from './persistence.ts';

const DAY = 24 * 60 * 60 * 1000;
const start = new Date('2026-10-01T10:00:00.000Z');
const after = (days: number) => new Date(start.getTime() + days * DAY);

async function seed(id: string, name = id) {
	await saveProject(emptyProject(id, name, start.toISOString()));
	await db.sync.put({ projectId: id, baseRev: 2, dirty: false });
}

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('trash', () => {
	it('hides a project from the list and from opening, without a tombstone', async () => {
		await seed('a', 'Wohnung');
		await seed('b', 'Büro');
		expect(await trashProject('a', start)).toBe(true);
		expect((await listProjects()).map((project) => project.id)).toEqual(['b']);
		expect(await loadProject('a')).toBeUndefined();
		const stored = await db.projects.get('a');
		expect(stored?.deleted).toBeUndefined();
		expect(stored?.name).toBe('Wohnung');
		expect(await db.sync.get('a')).toMatchObject({ baseRev: 2, dirty: false });
	});

	it('restores a project with all its data', async () => {
		await seed('a');
		await trashProject('a', start);
		expect(await restoreFromTrash('a')).toBe(true);
		expect((await listProjects()).map((project) => project.id)).toEqual(['a']);
		expect((await loadProject('a'))?.id).toBe('a');
		expect(await restoreFromTrash('a')).toBe(false);
	});

	it('lists entries with the days that are left', async () => {
		await seed('a');
		await seed('b');
		await trashProject('a', start);
		await trashProject('b', after(10));
		const entries = await listTrash(after(12));
		expect(entries.map((entry) => [entry.id, entry.daysLeft])).toEqual([
			['b', 28],
			['a', 18]
		]);
		expect(daysLeft(start.toISOString(), after(TRASH_DAYS))).toBe(0);
		expect(daysLeft(start.toISOString(), after(29.5))).toBe(1);
	});

	it('does not remove anything before 30 days are over', async () => {
		await seed('a');
		await trashProject('a', start);
		expect(await purgeExpiredTrash(after(29.9))).toBe(0);
		expect((await db.projects.get('a'))?.deleted).toBeUndefined();
		expect(await listTrash(after(29.9))).toHaveLength(1);
	});

	it('deletes for good after 30 days and only then writes the tombstone', async () => {
		await seed('a');
		await seed('b');
		await trashProject('a', start);
		await trashProject('b', after(20));
		expect(await purgeExpiredTrash(after(30))).toBe(1);
		const tombstone = await db.projects.get('a');
		expect(tombstone).toMatchObject({ deleted: true, rooms: [], variants: [] });
		expect(await db.sync.get('a')).toMatchObject({ dirty: true, baseRev: 2 });
		expect(await db.trash.get('a')).toBeUndefined();
		expect((await db.projects.get('b'))?.deleted).toBeUndefined();
		expect((await listTrash(after(30))).map((entry) => entry.id)).toEqual(['b']);
	});

	it('deletes for good on request', async () => {
		await seed('a');
		await trashProject('a', start);
		await purgeFromTrash('a');
		expect((await db.projects.get('a'))?.deleted).toBe(true);
		expect(await db.trash.count()).toBe(0);
		expect(await listTrash()).toEqual([]);
	});

	it('never purges on a damaged date', async () => {
		await seed('a');
		await db.trash.put({ projectId: 'a', trashedAt: 'kaputt' });
		expect(isExpired('kaputt', after(400))).toBe(false);
		expect(await purgeExpiredTrash(after(400))).toBe(0);
		expect((await db.projects.get('a'))?.deleted).toBeUndefined();
	});

	it('forgets entries whose project is gone', async () => {
		await db.trash.put({ projectId: 'ghost', trashedAt: start.toISOString() });
		expect(await listTrash()).toEqual([]);
		expect(await db.trash.count()).toBe(0);
	});

	it('refuses to trash an unknown or already deleted project', async () => {
		expect(await trashProject('nope')).toBe(false);
		await db.projects.put({ ...emptyProject('d', 'D'), deleted: true });
		expect(await trashProject('d')).toBe(false);
	});

	it('keeps the id taken so a backup of it becomes a copy', async () => {
		await seed('a');
		await trashProject('a', start);
		expect(await projectIdTaken('a')).toBe(true);
	});

	it('keeps the photos of a trashed project and releases them on purge', async () => {
		const hash = 'd'.repeat(64);
		const project = emptyProject('a', 'A', start.toISOString());
		project.rooms.push({
			id: 'r',
			name: 'R',
			type: 'other',
			polygon: [
				{ x: 0, y: 0 },
				{ x: 1000, y: 0 },
				{ x: 0, y: 1000 }
			],
			height: 2500,
			boardPos: { x: 0, y: 0, rot: 0 },
			elements: [],
			photos: [
				{
					id: 'p',
					hash,
					perspective: { kind: 'free', caption: { de: 'x', en: 'x' } },
					w: 1,
					h: 1,
					takenAt: start.toISOString()
				}
			]
		});
		await saveProject(project);
		await db.photos.put({
			hash,
			blob: new Blob(['x']),
			thumbnail: new Blob(['x']),
			w: 1,
			h: 1,
			uploaded: false,
			storedAt: 0
		});
		await trashProject('a', start);
		expect(await pruneOrphanPhotos()).toBe(0);
		await purgeFromTrash('a');
		expect(await pruneOrphanPhotos()).toBe(1);
	});
});
