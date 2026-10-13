import 'fake-indexeddb/auto';
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { sequentialIds } from '#lib/core/ids.ts';
import { sha256Hex } from '#lib/features/photos/hash.ts';
import { db } from '#lib/state/db.ts';
import { getPhoto, loadProject, putPhoto, saveProject } from '#lib/state/persistence.ts';
import {
	BackupError,
	createBackup,
	parseBackup,
	photoHashes,
	projectExists,
	restoreBackup
} from './backup.ts';
import { furnishedProject, testPng } from './testing.ts';

async function seed() {
	const bytes = testPng(80, 60, 90);
	const hash = await sha256Hex(bytes);
	const project = furnishedProject(hash);
	await putPhoto({
		hash,
		blob: new Blob([bytes as BlobPart], { type: 'image/jpeg' }),
		thumbnail: new Blob([bytes as BlobPart], { type: 'image/jpeg' }),
		w: 64,
		h: 48,
		uploaded: false
	});
	await saveProject(project);
	return { project, hash, bytes };
}

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
});

describe('backup roundtrip', () => {
	it('writes project.json, photos and extras into a zip', async () => {
		const { project, hash } = await seed();
		const result = await createBackup(project, {
			extras: [{ name: 'roomx-x.json', data: strToU8('{}'), compress: true }]
		});
		expect(result.photoCount).toBe(1);
		expect(result.missingPhotos).toBe(0);
		const parsed = parseBackup(new Uint8Array(await result.blob.arrayBuffer()));
		expect(parsed.project).toEqual(project);
		expect([...parsed.photos.keys()]).toEqual([hash]);
	});

	it('restores into an empty database with the photo', async () => {
		const { project, hash, bytes } = await seed();
		const { blob } = await createBackup(project);
		await Promise.all(db.tables.map((table) => table.clear()));
		expect(await projectExists(project.id)).toBe(false);
		const parsed = parseBackup(new Uint8Array(await blob.arrayBuffer()));
		const restored = await restoreBackup(parsed, { mode: 'replace' });
		expect(restored.missingPhotos).toBe(0);
		const loaded = await loadProject(project.id);
		expect(loaded?.name).toBe(project.name);
		expect(loaded?.rooms[0].photos[0].hash).toBe(hash);
		const photo = await getPhoto(hash);
		expect(photo?.blob.size).toBe(bytes.length);
		expect(photo?.w).toBe(64);
		expect((await db.sync.get(project.id))?.dirty).toBe(true);
	});

	it('replaces an existing project', async () => {
		const { project } = await seed();
		const { blob } = await createBackup(project);
		await saveProject({ ...project, name: 'Geändert', rooms: [] });
		expect(await projectExists(project.id)).toBe(true);
		const parsed = parseBackup(new Uint8Array(await blob.arrayBuffer()));
		await restoreBackup(parsed, { mode: 'replace' });
		const loaded = await loadProject(project.id);
		expect(loaded?.name).toBe(project.name);
		expect(loaded?.rooms).toHaveLength(2);
	});

	it('creates a copy with a new id and keeps the original', async () => {
		const { project } = await seed();
		const { blob } = await createBackup(project);
		const parsed = parseBackup(new Uint8Array(await blob.arrayBuffer()));
		const restored = await restoreBackup(parsed, {
			mode: 'copy',
			copySuffix: 'Kopie',
			newId: sequentialIds('copy')
		});
		expect(restored.project.id).toBe('copy-1');
		expect(restored.project.name).toBe('Wohnung Müller-Köhler (Kopie)');
		expect((await loadProject('copy-1'))?.rooms).toHaveLength(2);
		expect((await loadProject(project.id))?.name).toBe(project.name);
	});

	it('skips damaged photos and counts them', async () => {
		const { project, hash } = await seed();
		const archive = zipSync({
			'project.json': strToU8(JSON.stringify(project)),
			[`photos/${hash}.jpg`]: strToU8('not the original bytes')
		});
		const restored = await restoreBackup(parseBackup(archive), { mode: 'copy' });
		expect(restored.missingPhotos).toBe(1);
		await db.photos.clear();
		const missing = await restoreBackup(
			parseBackup(zipSync({ 'project.json': strToU8(JSON.stringify(project)) })),
			{ mode: 'replace' }
		);
		expect(missing.missingPhotos).toBe(1);
		expect(await getPhoto(hash)).toBeUndefined();
	});

	it('counts photos missing from the local store when creating a backup', async () => {
		const { project } = await seed();
		await db.photos.clear();
		const result = await createBackup(project);
		expect(result.photoCount).toBe(0);
		expect(result.missingPhotos).toBe(1);
		expect(photoHashes(project)).toHaveLength(1);
	});
});

describe('parseBackup errors', () => {
	const code = (data: Uint8Array) => {
		try {
			parseBackup(data);
		} catch (error) {
			return error instanceof BackupError ? error.code : 'other';
		}
		return 'none';
	};

	it('rejects non-zip data', () => {
		expect(code(strToU8('hello'))).toBe('notZip');
	});

	it('rejects archives without project.json', () => {
		expect(code(zipSync({ 'readme.txt': strToU8('x') }))).toBe('noProject');
	});

	it('rejects broken or invalid project data', () => {
		expect(code(zipSync({ 'project.json': strToU8('{oops') }))).toBe('invalid');
		expect(code(zipSync({ 'project.json': strToU8('{"id":"a"}') }))).toBe('invalid');
	});

	it('rejects projects from a newer schema', async () => {
		const { project } = await seed();
		const archive = zipSync({
			'project.json': strToU8(JSON.stringify({ ...project, schemaVersion: 99 }))
		});
		expect(code(archive)).toBe('tooNew');
	});
});
