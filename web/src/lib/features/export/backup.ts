import { strFromU8, strToU8, unzipSync, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { migrateProject, UnsupportedVersionError } from '#lib/core/migrations.ts';
import { newId, type IdFactory } from '#lib/core/ids.ts';
import type { Project } from '#lib/core/schema.ts';
import { sha256Hex } from '#lib/features/photos/hash.ts';
import { getPhoto, loadProject, putPhoto, saveProject } from '#lib/state/persistence.ts';

export const BACKUP_FORMAT = 'roomx-backup';
export const BACKUP_VERSION = 1;

export type BackupErrorCode = 'notZip' | 'noProject' | 'invalid' | 'tooNew';

export class BackupError extends Error {
	readonly code: BackupErrorCode;

	constructor(code: BackupErrorCode) {
		super(code);
		this.name = 'BackupError';
		this.code = code;
	}
}

export interface BackupExtra {
	name: string;
	data: Uint8Array;
	compress?: boolean;
}

export interface BackupOptions {
	extras?: readonly BackupExtra[];
	getBlob?: (hash: string) => Promise<Blob | undefined>;
	now?: Date;
}

export interface BackupResult {
	blob: Blob;
	photoCount: number;
	missingPhotos: number;
}

export function photoHashes(project: Project): string[] {
	const hashes = new Set<string>();
	for (const room of project.rooms) for (const photo of room.photos) hashes.add(photo.hash);
	return [...hashes];
}

async function storedBlob(hash: string): Promise<Blob | undefined> {
	return (await getPhoto(hash))?.blob;
}

export async function createBackup(
	project: Project,
	options: BackupOptions = {}
): Promise<BackupResult> {
	const getBlob = options.getBlob ?? storedBlob;
	const chunks: Uint8Array[] = [];
	let failure: Error | null = null;
	const zip = new Zip((error, chunk) => {
		if (error) failure = error;
		else chunks.push(chunk);
	});
	const add = (name: string, data: Uint8Array, compress: boolean) => {
		const file = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
		zip.add(file);
		file.push(data, true);
	};
	const hashes = photoHashes(project);
	let photoCount = 0;
	let missingPhotos = 0;
	const meta = {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		exportedAt: (options.now ?? new Date()).toISOString(),
		projectId: project.id,
		projectName: project.name
	};
	add('backup.json', strToU8(JSON.stringify(meta, null, 2)), true);
	add('project.json', strToU8(JSON.stringify(project, null, 2)), true);
	for (const hash of hashes) {
		const blob = await getBlob(hash);
		if (!blob) {
			missingPhotos++;
			continue;
		}
		add(`photos/${hash}.jpg`, new Uint8Array(await blob.arrayBuffer()), false);
		photoCount++;
	}
	for (const extra of options.extras ?? []) add(extra.name, extra.data, extra.compress ?? false);
	zip.end();
	if (failure) throw failure;
	return {
		blob: new Blob(chunks as BlobPart[], { type: 'application/zip' }),
		photoCount,
		missingPhotos
	};
}

export interface ParsedBackup {
	project: Project;
	photos: Map<string, Uint8Array>;
}

export function parseBackup(data: Uint8Array): ParsedBackup {
	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(data, {
			filter: (file) =>
				file.name === 'project.json' || /^photos\/[0-9a-f]{64}\.jpg$/.test(file.name)
		});
	} catch {
		throw new BackupError('notZip');
	}
	const raw = files['project.json'];
	if (!raw) throw new BackupError('noProject');
	let project: Project;
	try {
		project = migrateProject(JSON.parse(strFromU8(raw)));
	} catch (error) {
		throw new BackupError(error instanceof UnsupportedVersionError ? 'tooNew' : 'invalid');
	}
	const photos = new Map<string, Uint8Array>();
	for (const [name, bytes] of Object.entries(files)) {
		const match = /^photos\/([0-9a-f]{64})\.jpg$/.exec(name);
		if (match) photos.set(match[1], bytes);
	}
	return { project, photos };
}

export async function projectExists(id: string): Promise<boolean> {
	return (await loadProject(id)) !== undefined;
}

export interface RestoreOptions {
	mode: 'replace' | 'copy';
	copySuffix?: string;
	makeThumbnail?: (blob: Blob) => Promise<Blob>;
	newId?: IdFactory;
	now?: Date;
}

export interface RestoreResult {
	project: Project;
	missingPhotos: number;
}

export async function restoreBackup(
	parsed: ParsedBackup,
	options: RestoreOptions
): Promise<RestoreResult> {
	const source = parsed.project;
	let missingPhotos = 0;
	const sizes = new Map<string, { w: number; h: number }>();
	for (const room of source.rooms) {
		for (const photo of room.photos) sizes.set(photo.hash, { w: photo.w, h: photo.h });
	}
	for (const [hash, size] of sizes) {
		const bytes = parsed.photos.get(hash);
		if (!bytes || (await sha256Hex(bytes)) !== hash) {
			missingPhotos++;
			continue;
		}
		const blob = new Blob([bytes as BlobPart], { type: 'image/jpeg' });
		let thumbnail = blob;
		if (options.makeThumbnail) {
			try {
				thumbnail = await options.makeThumbnail(blob);
			} catch {
				thumbnail = blob;
			}
		}
		await putPhoto({ hash, blob, thumbnail, w: size.w, h: size.h, uploaded: false });
	}
	const { deleted: _deleted, ...rest } = source;
	const now = (options.now ?? new Date()).toISOString();
	const project: Project =
		options.mode === 'copy'
			? {
					...rest,
					id: (options.newId ?? newId)(),
					name: `${source.name} (${options.copySuffix ?? 'copy'})`,
					rev: 0,
					createdAt: now,
					updatedAt: now
				}
			: { ...rest, updatedAt: now };
	await saveProject(project);
	return { project, missingPhotos };
}
