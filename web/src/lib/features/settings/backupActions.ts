import type { Project } from '#lib/core/schema.ts';
import { downloadBlob } from '#lib/features/export/deliver.ts';
import {
	BACKUP_LIMITS,
	BackupError,
	createFullBackup,
	parseBackup,
	parseBackupSet,
	type BackupErrorCode,
	type FullBackupResult,
	type ParsedBackup,
	type ParsedBackupSet
} from '#lib/features/export/backup.ts';
import { dateStamp } from '#lib/features/export/slug.ts';
import { locale, t } from '#lib/i18n/index.svelte.ts';
import { loadActiveProjects } from '#lib/state/persistence.ts';
import { updateSettings } from '#lib/state/settings.svelte.ts';
import { messages } from './i18n.ts';
import { formatBytes } from './storage.ts';

export function backupFileName(date: Date = new Date()): string {
	return `roomx-backup-${dateStamp(date)}.zip`;
}

// Unsaved in-memory states win over what the database holds, so nothing is left out when saving failed.
export async function collectBackupProjects(
	overrides: readonly Project[] = []
): Promise<Project[]> {
	let stored: Project[] = [];
	try {
		stored = await loadActiveProjects();
	} catch {
		stored = [];
	}
	const byId = new Map(stored.map((project) => [project.id, project]));
	for (const project of overrides) byId.set(project.id, project);
	return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function runFullBackup(
	overrides: readonly Project[] = [],
	now: Date = new Date()
): Promise<FullBackupResult | null> {
	const projects = await collectBackupProjects(overrides);
	if (projects.length === 0) return null;
	const result = await createFullBackup(projects, { now });
	downloadBlob(backupFileName(now), result.blob);
	updateSettings({ lastBackupAt: now.toISOString() });
	return result;
}

export type RestoreErrorCode = BackupErrorCode | 'unreadable' | 'fullBackup';

type ReadResult<T> = { kind: 'ok'; value: T } | { kind: 'error'; code: RestoreErrorCode };

async function readBytes(file: Blob): Promise<ReadResult<Uint8Array>> {
	if (file.size > BACKUP_LIMITS.fileBytes) return { kind: 'error', code: 'tooLarge' };
	try {
		return { kind: 'ok', value: new Uint8Array(await file.arrayBuffer()) };
	} catch {
		return { kind: 'error', code: 'unreadable' };
	}
}

function codeOf(error: unknown): BackupErrorCode {
	return error instanceof BackupError ? error.code : 'invalid';
}

export type ReadBackupResult =
	{ kind: 'ok'; set: ParsedBackupSet } | { kind: 'error'; code: RestoreErrorCode };

export async function readBackupFile(file: Blob): Promise<ReadBackupResult> {
	const bytes = await readBytes(file);
	if (bytes.kind === 'error') return bytes;
	try {
		return { kind: 'ok', set: parseBackupSet(bytes.value) };
	} catch (error) {
		return { kind: 'error', code: codeOf(error) };
	}
}

export type ReadSingleResult =
	{ kind: 'ok'; parsed: ParsedBackup } | { kind: 'error'; code: RestoreErrorCode };

export async function readSingleBackupFile(file: Blob): Promise<ReadSingleResult> {
	const bytes = await readBytes(file);
	if (bytes.kind === 'error') return bytes;
	try {
		return { kind: 'ok', parsed: parseBackup(bytes.value) };
	} catch (error) {
		const code = codeOf(error);
		if (code !== 'noProject') return { kind: 'error', code };
		try {
			parseBackupSet(bytes.value);
			return { kind: 'error', code: 'fullBackup' };
		} catch {
			return { kind: 'error', code };
		}
	}
}

type MessageKey = keyof (typeof messages)['de'];

const RESTORE_ERROR_KEYS = {
	notZip: 'restoreNotZip',
	noProject: 'restoreNoProject',
	invalid: 'restoreInvalid',
	tooNew: 'restoreTooNew',
	tooLarge: 'restoreTooLarge',
	tooMany: 'restoreTooMany',
	unreadable: 'restoreUnreadable',
	fullBackup: 'restoreIsFullBackup'
} as const satisfies Record<RestoreErrorCode, MessageKey>;

export function restoreErrorKey(code: RestoreErrorCode): MessageKey {
	return RESTORE_ERROR_KEYS[code];
}

export function restoreErrorMessage(code: RestoreErrorCode): string {
	return t(messages, restoreErrorKey(code), {
		max: formatBytes(BACKUP_LIMITS.fileBytes, locale.language)
	});
}

export function photoLossNotes(missing: number, rejected: number): string[] {
	const notes: string[] = [];
	if (rejected > 0) notes.push(t(messages, 'restorePhotosRejected', { n: rejected }));
	if (missing - rejected > 0) {
		notes.push(t(messages, 'restorePhotosMissing', { n: missing - rejected }));
	}
	return notes;
}
