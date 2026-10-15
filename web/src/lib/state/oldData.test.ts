import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateProject, UnsupportedVersionError } from '#lib/core/migrations.ts';
import { SCHEMA_VERSION, type Project } from '#lib/core/schema.ts';
import { db, RoomxDatabase } from './db.ts';
import { listProjects, loadActiveProjects, loadProject } from './persistence.ts';
import { ProjectStore } from './project.svelte.ts';

const modules = import.meta.glob<Record<string, unknown>>('./fixtures/project-v*.json', {
	eager: true,
	import: 'default'
});

const fixtures = Object.entries(modules)
	.map(([path, document]) => ({
		version: Number(/project-v(\d+)\.json$/.exec(path)![1]),
		document
	}))
	.sort((a, b) => a.version - b.version);

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

async function store(document: Record<string, unknown>): Promise<string> {
	await db.projects.put(structuredClone(document) as unknown as Project);
	return document.id as string;
}

describe('fixtures of every schema version', () => {
	it('exist for every version up to the current one', () => {
		expect(fixtures.map((fixture) => fixture.version)).toEqual(
			Array.from({ length: SCHEMA_VERSION + 1 }, (_, version) => version)
		);
	});

	it('really are stored in the version their name promises', () => {
		for (const { version, document } of fixtures) {
			expect(document.schemaVersion ?? 0).toBe(version);
		}
	});
});

describe.each(fixtures)('old data from schema version $version', ({ document }) => {
	it('loads and migrates to the current schema', async () => {
		const id = await store(document);
		const project = await loadProject(id);
		expect(project?.schemaVersion).toBe(SCHEMA_VERSION);
		expect(project?.id).toBe(id);
		expect(project?.rooms.length).toBeGreaterThan(0);
		expect(project?.rooms[0].photos[0]?.hash).toBe('c'.repeat(64));
		expect(project?.rooms[0].elements.length).toBeGreaterThan(0);
		expect(project?.rev).toBeTypeOf('number');
		expect(project?.createdAt).toBeTypeOf('string');
		expect(Array.isArray(project?.variants)).toBe(true);
	});

	it('shows up in the project list and the backup list', async () => {
		const id = await store(document);
		expect((await listProjects()).map((entry) => entry.id)).toContain(id);
		expect((await loadActiveProjects()).map((entry) => entry.id)).toContain(id);
	});

	it('opens in the editor and is written back in the current schema', async () => {
		const id = await store(document);
		const editor = new ProjectStore();
		expect(await editor.open(id)).toBe(true);
		const rooms = editor.project!.rooms.length;
		editor.addRoom('Neu', 'other');
		await editor.flush();
		const saved = await db.projects.get(id);
		expect(saved?.schemaVersion).toBe(SCHEMA_VERSION);
		expect(saved?.rooms).toHaveLength(rooms + 1);
		editor.abandon();
	});

	it('keeps all data of the original document', async () => {
		const original = structuredClone(document) as unknown as Project;
		const migrated = migrateProject(structuredClone(document));
		expect(migrated.name).toBe(original.name);
		expect(migrated.rooms).toEqual(original.rooms);
		expect(migrated.updatedAt).toBe(original.updatedAt);
	});
});

describe('documents without a version', () => {
	it('count as version 0', async () => {
		const [first] = fixtures;
		const { schemaVersion: _version, ...bare } = first.document;
		const id = await store({ ...bare, id: 'bare' });
		expect((await loadProject(id))?.schemaVersion).toBe(SCHEMA_VERSION);
	});
});

describe('data from a newer app', () => {
	it('is refused and left untouched', async () => {
		const [first] = fixtures;
		const id = await store({ ...first.document, id: 'future', schemaVersion: SCHEMA_VERSION + 1 });
		await expect(loadProject(id)).rejects.toBeInstanceOf(UnsupportedVersionError);
		const editor = new ProjectStore();
		await expect(editor.open(id)).rejects.toBeInstanceOf(UnsupportedVersionError);
		expect((await db.projects.get(id))?.schemaVersion).toBe(SCHEMA_VERSION + 1);
	});
});

describe('upgrading the database itself', () => {
	it('keeps projects, photos and settings of the first database version', async () => {
		const name = 'roomx-upgrade-test';
		const first = new Dexie(name);
		first.version(1).stores({
			projects: 'id, updatedAt',
			photos: 'hash',
			sync: 'projectId',
			previews: 'projectId',
			kv: 'key'
		});
		const [fixture] = fixtures;
		await first.table('projects').put(structuredClone(fixture.document));
		await first.table('photos').put({
			hash: 'c'.repeat(64),
			blob: new Blob(['x']),
			thumbnail: new Blob(['y']),
			w: 1,
			h: 1,
			uploaded: false
		});
		await first.table('kv').put({ key: 'a', value: 1 });
		first.close();

		const upgraded = new RoomxDatabase(name);
		expect((await upgraded.projects.toArray()).map((project) => project.id)).toEqual([
			fixture.document.id
		]);
		expect((await upgraded.photos.get('c'.repeat(64)))?.w).toBe(1);
		expect((await upgraded.kv.get('a'))?.value).toBe(1);
		await upgraded.trash.put({ projectId: 'x', trashedAt: '2026-01-01T00:00:00.000Z' });
		expect(await upgraded.trash.count()).toBe(1);
		upgraded.close();
		await Dexie.delete(name);
	});
});
