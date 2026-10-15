import 'fake-indexeddb/auto';
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '#lib/core/schema.ts';
import { createBackup, createFullBackup, BACKUP_LIMITS } from '#lib/features/export/backup.ts';
import { furnishedProject } from '#lib/features/export/testing.ts';
import { updateSettings } from '#lib/state/settings.svelte.ts';
import { db } from '#lib/state/db.ts';
import { saveProject } from '#lib/state/persistence.ts';
import {
	collectBackupProjects,
	collectBackupSet,
	photoLossNotes,
	readBackupFile,
	readSingleBackupFile,
	restoreErrorKey,
	restoreErrorMessage,
	type RestoreErrorCode
} from './backupActions.ts';
import { messages } from './i18n.ts';

const file = (bytes: Uint8Array) => new Blob([bytes as BlobPart]);

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
	updateSettings({ language: 'de' });
});

describe('reading a single backup file', () => {
	it('returns the project of a valid backup', async () => {
		const project = furnishedProject();
		const { blob } = await createBackup(project);
		const read = await readSingleBackupFile(blob);
		expect(read.kind).toBe('ok');
		if (read.kind === 'ok') expect(read.parsed.project.id).toBe(project.id);
	});

	it.each<[string, Uint8Array, RestoreErrorCode]>([
		['not a zip', strToU8('hello'), 'notZip'],
		['a zip without a project', zipSync({ 'readme.txt': strToU8('x') }), 'noProject'],
		['a damaged project', zipSync({ 'project.json': strToU8('{oops') }), 'invalid'],
		[
			'a newer schema',
			zipSync({
				'project.json': strToU8(JSON.stringify({ ...furnishedProject(), schemaVersion: 99 }))
			}),
			'tooNew'
		]
	])('names the problem of %s', async (_label, bytes, code) => {
		expect(await readSingleBackupFile(file(bytes))).toEqual({ kind: 'error', code });
	});

	it('recognises a backup of all projects and points to the settings', async () => {
		const { blob } = await createFullBackup([furnishedProject()]);
		expect(await readSingleBackupFile(blob)).toEqual({ kind: 'error', code: 'fullBackup' });
		expect(restoreErrorMessage('fullBackup')).toMatch(/Alles wiederherstellen/);
	});

	it('refuses oversized files before reading them', async () => {
		const huge = {
			size: BACKUP_LIMITS.fileBytes + 1,
			arrayBuffer: () => Promise.reject(new Error('read'))
		};
		expect(await readSingleBackupFile(huge as unknown as Blob)).toEqual({
			kind: 'error',
			code: 'tooLarge'
		});
		expect(await readBackupFile(huge as unknown as Blob)).toEqual({
			kind: 'error',
			code: 'tooLarge'
		});
	});

	it('reports a file that cannot be read', async () => {
		const broken = { size: 10, arrayBuffer: () => Promise.reject(new Error('read')) };
		expect(await readSingleBackupFile(broken as unknown as Blob)).toEqual({
			kind: 'error',
			code: 'unreadable'
		});
	});
});

describe('messages for restore problems', () => {
	const codes: RestoreErrorCode[] = [
		'notZip',
		'noProject',
		'invalid',
		'tooNew',
		'tooLarge',
		'tooMany',
		'unreadable',
		'fullBackup'
	];

	it('exist in both languages for every code', () => {
		for (const code of codes) {
			const key = restoreErrorKey(code);
			expect(messages.de[key]).toBeTruthy();
			expect(messages.en[key]).toBeTruthy();
		}
	});

	it('say how large a file may be', () => {
		expect(restoreErrorMessage('tooLarge')).toContain('500 MB');
	});

	it('count invalid and missing photos separately', () => {
		expect(photoLossNotes(0, 0)).toEqual([]);
		expect(photoLossNotes(3, 3)).toEqual(['3 ungültige Bilder wurden übersprungen.']);
		expect(photoLossNotes(5, 2)).toEqual([
			'2 ungültige Bilder wurden übersprungen.',
			'3 Fotos fehlten oder waren beschädigt.'
		]);
	});
});

describe('collecting projects for a backup', () => {
	it('lets unsaved states win over the stored ones and skips deleted projects', async () => {
		const stored = furnishedProject();
		await saveProject(stored);
		const gone = { ...furnishedProject(), id: 'gone', deleted: true };
		await db.projects.put(gone);
		const unsaved = { ...stored, name: 'Nur im Speicher' };
		const extra = { ...furnishedProject(), id: 'extra', name: 'Neu' };
		const collected = await collectBackupProjects([unsaved, extra]);
		expect(collected.map((project) => project.name).sort()).toEqual(['Neu', 'Nur im Speicher']);
		expect(collected.some((project) => project.id === 'gone')).toBe(false);
	});

	it('keeps stored projects that cannot be read as raw data', async () => {
		const good = furnishedProject();
		await saveProject(good);
		const broken = { ...furnishedProject(), id: 'broken', name: 'Kaputt', rooms: 'oops' };
		await db.projects.put(broken as unknown as Project);
		const set = await collectBackupSet();
		expect(set.projects.map((project) => project.id)).toEqual([good.id]);
		expect(set.unreadable.map((entry) => [entry.id, entry.name])).toEqual([['broken', 'Kaputt']]);
		const repaired = { ...furnishedProject(), id: 'broken' };
		const withOverride = await collectBackupSet([repaired]);
		expect(withOverride.unreadable).toEqual([]);
	});

	it('reports a database that cannot be read instead of backing up nothing', async () => {
		await db.delete();
		await expect(collectBackupProjects([furnishedProject()])).rejects.toThrow();
		await db.open();
	});
});
