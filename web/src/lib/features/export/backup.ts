import {
	strFromU8,
	strToU8,
	Unzip,
	UnzipInflate,
	UnzipPassThrough,
	Zip,
	ZipDeflate,
	ZipPassThrough
} from 'fflate';
import { migrateProject, UnsupportedVersionError } from '#lib/core/migrations.ts';
import { newId, type IdFactory } from '#lib/core/ids.ts';
import type { Project } from '#lib/core/schema.ts';
import { sha256Hex } from '#lib/features/photos/hash.ts';
import type { ProcessedImage } from '#lib/features/photos/image.ts';
import { reencodeImage, type Reencode } from '#lib/features/photos/reencode.ts';
import { checkImageBytes } from '#lib/features/photos/sniff.ts';
import {
	getPhoto,
	photoHashesOf,
	projectIdTaken,
	putPhoto,
	saveProject
} from '#lib/state/persistence.ts';

export const BACKUP_FORMAT = 'roomx-backup';
export const BACKUP_VERSION = 1;

const MIB = 1024 * 1024;

export const BACKUP_LIMITS = {
	fileBytes: 500_000_000,
	unpackedBytes: 800 * MIB,
	imageBytes: 40 * MIB,
	jsonBytes: 25 * MIB,
	entries: 6000,
	projects: 300,
	photos: 5000
} as const;

export type BackupLimits = { [K in keyof typeof BACKUP_LIMITS]: number };

export type BackupErrorCode =
	'notZip' | 'noProject' | 'invalid' | 'tooNew' | 'tooLarge' | 'tooMany';

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
	return [...new Set(photoHashesOf(project))];
}

async function storedBlob(hash: string): Promise<Blob | undefined> {
	return (await getPhoto(hash))?.blob;
}

class ZipWriter {
	readonly #chunks: Uint8Array[] = [];
	#failure: Error | null = null;
	readonly #zip = new Zip((error, chunk) => {
		if (error) this.#failure = error;
		else this.#chunks.push(chunk);
	});

	add(name: string, data: Uint8Array, compress: boolean): void {
		const file = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
		this.#zip.add(file);
		file.push(data, true);
	}

	finish(): Blob {
		this.#zip.end();
		if (this.#failure) throw this.#failure;
		return new Blob(this.#chunks as BlobPart[], { type: 'application/zip' });
	}
}

function json(value: unknown): Uint8Array {
	return strToU8(JSON.stringify(value, null, 2));
}

export async function createBackup(
	project: Project,
	options: BackupOptions = {}
): Promise<BackupResult> {
	const getBlob = options.getBlob ?? storedBlob;
	const writer = new ZipWriter();
	let photoCount = 0;
	let missingPhotos = 0;
	writer.add(
		'backup.json',
		json({
			format: BACKUP_FORMAT,
			version: BACKUP_VERSION,
			exportedAt: (options.now ?? new Date()).toISOString(),
			projectId: project.id,
			projectName: project.name
		}),
		true
	);
	writer.add('project.json', json(project), true);
	for (const hash of photoHashes(project)) {
		const blob = await readBlob(getBlob, hash);
		if (!blob) {
			missingPhotos++;
			continue;
		}
		writer.add(`photos/${hash}.jpg`, new Uint8Array(await blob.arrayBuffer()), false);
		photoCount++;
	}
	for (const extra of options.extras ?? [])
		writer.add(extra.name, extra.data, extra.compress ?? false);
	return { blob: writer.finish(), photoCount, missingPhotos };
}

async function readBlob(
	getBlob: (hash: string) => Promise<Blob | undefined>,
	hash: string
): Promise<Blob | undefined> {
	try {
		return await getBlob(hash);
	} catch {
		return undefined;
	}
}

export interface UnreadableProject {
	id: string;
	name: string;
	raw: unknown;
}

export interface FullBackupOptions extends Omit<BackupOptions, 'extras'> {
	unreadable?: readonly UnreadableProject[];
}

export interface FullBackupResult extends BackupResult {
	projectCount: number;
	unreadableCount: number;
}

const UNSAFE_ID = /[^A-Za-z0-9_-]/g;

function rawJson(raw: unknown): Uint8Array | undefined {
	try {
		const text = JSON.stringify(raw, null, 2);
		return text === undefined ? undefined : strToU8(text);
	} catch {
		return undefined;
	}
}

function rawPhotoHashes(raw: unknown): string[] {
	try {
		return photoHashes(raw as Project);
	} catch {
		return [];
	}
}

export async function createFullBackup(
	projects: readonly Project[],
	options: FullBackupOptions = {}
): Promise<FullBackupResult> {
	const getBlob = options.getBlob ?? storedBlob;
	const writer = new ZipWriter();
	const unreadable: { id: string; name: string; data: Uint8Array }[] = [];
	for (const entry of options.unreadable ?? []) {
		const data = rawJson(entry.raw);
		if (data) unreadable.push({ id: entry.id, name: entry.name, data });
	}
	writer.add(
		'backup.json',
		json({
			format: BACKUP_FORMAT,
			version: BACKUP_VERSION,
			scope: 'all',
			exportedAt: (options.now ?? new Date()).toISOString(),
			projects: projects.map((project) => ({ id: project.id, name: project.name })),
			unreadable: unreadable.map(({ id, name }) => ({ id, name }))
		}),
		true
	);
	const hashes = new Set<string>();
	projects.forEach((project, index) => {
		writer.add(`projects/${index + 1}.json`, json(project), true);
		for (const hash of photoHashes(project)) hashes.add(hash);
	});
	const usedNames = new Set<string>();
	for (const entry of options.unreadable ?? []) {
		const item = unreadable.find((candidate) => candidate.id === entry.id);
		if (!item) continue;
		let name = `unreadable/${entry.id.replace(UNSAFE_ID, '_').slice(0, 100) || 'project'}`;
		while (usedNames.has(name)) name += '_';
		usedNames.add(name);
		writer.add(`${name}.json`, item.data, true);
		for (const hash of rawPhotoHashes(entry.raw)) hashes.add(hash);
	}
	let photoCount = 0;
	let missingPhotos = 0;
	for (const hash of hashes) {
		const blob = await readBlob(getBlob, hash);
		if (!blob) {
			missingPhotos++;
			continue;
		}
		writer.add(`photos/${hash}.jpg`, new Uint8Array(await blob.arrayBuffer()), false);
		photoCount++;
	}
	return {
		blob: writer.finish(),
		projectCount: projects.length,
		unreadableCount: unreadable.length,
		photoCount,
		missingPhotos
	};
}

export interface ParsedBackup {
	project: Project;
	photos: Map<string, Uint8Array>;
}

export interface ParsedBackupSet {
	projects: Project[];
	photos: Map<string, Uint8Array>;
	skipped: number;
	skippedNames: string[];
}

const PHOTO_ENTRY = /^photos\/([0-9a-f]{64})\.(?:jpg|png|webp)$/;
const PROJECT_ENTRY = /^projects\/\d{1,6}\.json$/;
const UNREADABLE_ENTRY = /^unreadable\/[A-Za-z0-9_-]{1,120}\.json$/;

const CHUNK_BYTES = 64 * 1024;
const SLICE_MS = 25;

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function isZipStart(data: Uint8Array): boolean {
	return (
		data.length >= 4 &&
		data[0] === 0x50 &&
		data[1] === 0x4b &&
		((data[2] === 3 && data[3] === 4) || (data[2] === 5 && data[3] === 6))
	);
}

function joinParts(parts: Uint8Array[], size: number): Uint8Array {
	if (parts.length === 1) return parts[0];
	const out = new Uint8Array(size);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

async function unpack(
	data: Uint8Array,
	acceptProjects: boolean,
	overrides: Partial<BackupLimits>
): Promise<Record<string, Uint8Array>> {
	const limits: BackupLimits = { ...BACKUP_LIMITS, ...overrides };
	if (data.length > limits.fileBytes) throw new BackupError('tooLarge');
	if (!isZipStart(data)) throw new BackupError('notZip');
	const files: Record<string, Uint8Array> = {};
	let seen = 0;
	let entries = 0;
	let photos = 0;
	let projects = 0;
	let unpacked = 0;
	let started = 0;
	let finished = 0;
	const unzip = new Unzip((file) => {
		const { name } = file;
		if (++seen > limits.entries * 2) throw new BackupError('tooMany');
		const isPhoto = PHOTO_ENTRY.test(name);
		const isProject =
			name === 'project.json' ||
			(acceptProjects && (PROJECT_ENTRY.test(name) || UNREADABLE_ENTRY.test(name)));
		if (!isPhoto && !isProject && name !== 'backup.json') return;
		entries++;
		if (isPhoto) photos++;
		if (isProject) projects++;
		if (entries > limits.entries) throw new BackupError('tooMany');
		if (photos > limits.photos || projects > limits.projects) throw new BackupError('tooMany');
		const limit = isPhoto ? limits.imageBytes : limits.jsonBytes;
		const declared = file.originalSize;
		if (declared !== undefined && declared > limit) throw new BackupError('tooLarge');
		const parts: Uint8Array[] = [];
		let size = 0;
		started++;
		file.ondata = (error, chunk, final) => {
			if (error) throw error;
			size += chunk.length;
			unpacked += chunk.length;
			if (size > limit || unpacked > limits.unpackedBytes) {
				file.terminate();
				throw new BackupError('tooLarge');
			}
			if (chunk.length > 0) parts.push(chunk);
			if (!final) return;
			if (declared !== undefined && size !== declared) throw new BackupError('invalid');
			finished++;
			files[name] = parts.length === 0 ? new Uint8Array(0) : joinParts(parts, size);
		};
		file.start();
	});
	unzip.register(UnzipInflate);
	unzip.register(UnzipPassThrough);
	try {
		let sliceStart = performance.now();
		let offset = 0;
		do {
			const end = Math.min(offset + CHUNK_BYTES, data.length);
			unzip.push(data.subarray(offset, end), end >= data.length);
			offset = end;
			if (performance.now() - sliceStart > SLICE_MS) {
				await yieldToEventLoop();
				sliceStart = performance.now();
			}
		} while (offset < data.length);
	} catch (error) {
		if (error instanceof BackupError) throw error;
		throw new BackupError('notZip');
	}
	if (finished !== started) throw new BackupError('notZip');
	return files;
}

function readMeta(files: Record<string, Uint8Array>): void {
	const raw = files['backup.json'];
	if (!raw) return;
	try {
		const meta = JSON.parse(strFromU8(raw)) as { version?: unknown };
		if (typeof meta.version === 'number' && meta.version > BACKUP_VERSION) {
			throw new BackupError('tooNew');
		}
	} catch (error) {
		if (error instanceof BackupError) throw error;
	}
}

function readProject(raw: Uint8Array): Project {
	try {
		return migrateProject(JSON.parse(strFromU8(raw)));
	} catch (error) {
		throw new BackupError(error instanceof UnsupportedVersionError ? 'tooNew' : 'invalid');
	}
}

function entryLabel(entry: string, raw: Uint8Array): string {
	try {
		const parsed: unknown = JSON.parse(strFromU8(raw));
		if (typeof parsed === 'object' && parsed !== null && 'name' in parsed) {
			const name = (parsed as { name: unknown }).name;
			if (typeof name === 'string' && name.trim()) return name.trim().slice(0, 60);
		}
	} catch {
		return entry;
	}
	return entry;
}

function readPhotos(files: Record<string, Uint8Array>): Map<string, Uint8Array> {
	const photos = new Map<string, Uint8Array>();
	for (const [name, bytes] of Object.entries(files)) {
		const match = PHOTO_ENTRY.exec(name);
		if (match) photos.set(match[1], bytes);
	}
	return photos;
}

export async function parseBackup(
	data: Uint8Array,
	limits: Partial<BackupLimits> = {}
): Promise<ParsedBackup> {
	const files = await unpack(data, false, limits);
	readMeta(files);
	const raw = files['project.json'];
	if (!raw) throw new BackupError('noProject');
	return { project: readProject(raw), photos: readPhotos(files) };
}

export async function parseBackupSet(
	data: Uint8Array,
	limits: Partial<BackupLimits> = {}
): Promise<ParsedBackupSet> {
	const files = await unpack(data, true, limits);
	readMeta(files);
	const names = Object.keys(files)
		.filter(
			(name) => name === 'project.json' || PROJECT_ENTRY.test(name) || UNREADABLE_ENTRY.test(name)
		)
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
	if (names.length === 0) throw new BackupError('noProject');
	const projects: Project[] = [];
	const skippedNames: string[] = [];
	let tooNew = 0;
	for (const name of names) {
		try {
			projects.push(readProject(files[name]));
		} catch (error) {
			if (error instanceof BackupError && error.code === 'tooNew') tooNew++;
			skippedNames.push(entryLabel(name, files[name]));
		}
	}
	if (projects.length === 0) throw new BackupError(tooNew > 0 ? 'tooNew' : 'invalid');
	return { projects, photos: readPhotos(files), skipped: skippedNames.length, skippedNames };
}

export async function projectExists(id: string): Promise<boolean> {
	return projectIdTaken(id);
}

export interface PhotoMapping {
	hash: string;
	w: number;
	h: number;
}

export type PhotoCache = Map<string, PhotoMapping | 'rejected' | 'missing'>;

export interface RestoreOptions {
	mode: 'keep' | 'copy';
	copySuffix?: string;
	makeThumbnail?: (blob: Blob) => Promise<Blob>;
	newId?: IdFactory;
	now?: Date;
	reencode?: Reencode;
	cache?: PhotoCache;
}

export interface RestoreResult {
	project: Project;
	missingPhotos: number;
	rejectedPhotos: number;
	copied: boolean;
}

async function importPhoto(
	hash: string,
	bytes: Uint8Array | undefined,
	options: RestoreOptions
): Promise<PhotoMapping | 'rejected' | 'missing'> {
	if (!bytes || (await sha256Hex(bytes)) !== hash) return 'missing';
	const verdict = checkImageBytes(bytes);
	if (!verdict.ok) return 'rejected';
	let processed: ProcessedImage;
	try {
		processed = await (options.reencode ?? reencodeImage)(bytes, verdict.info.kind);
	} catch {
		return 'rejected';
	}
	const blob = new Blob([processed.blob], { type: 'image/jpeg' });
	let thumbnail = new Blob([processed.thumbnail], { type: 'image/jpeg' });
	if (options.makeThumbnail) {
		try {
			thumbnail = new Blob([await options.makeThumbnail(blob)], { type: 'image/jpeg' });
		} catch {
			thumbnail = new Blob([processed.thumbnail], { type: 'image/jpeg' });
		}
	}
	await putPhoto({
		hash: processed.hash,
		blob,
		thumbnail,
		w: processed.w,
		h: processed.h,
		uploaded: false
	});
	return { hash: processed.hash, w: processed.w, h: processed.h };
}

export async function restoreBackup(
	parsed: { project: Project; photos: Map<string, Uint8Array> },
	options: RestoreOptions
): Promise<RestoreResult> {
	const source = parsed.project;
	const cache: PhotoCache = options.cache ?? new Map();
	let missingPhotos = 0;
	let rejectedPhotos = 0;
	for (const hash of photoHashes(source)) {
		let entry = cache.get(hash);
		if (entry === undefined) {
			entry = await importPhoto(hash, parsed.photos.get(hash), options);
			cache.set(hash, entry);
		}
		if (entry === 'missing') missingPhotos++;
		else if (entry === 'rejected') {
			missingPhotos++;
			rejectedPhotos++;
		}
	}
	const { deleted: _deleted, ...rest } = source;
	const rooms = rest.rooms.map((room) => ({
		...room,
		photos: room.photos.map((photo) => {
			const entry = cache.get(photo.hash);
			return entry && typeof entry === 'object'
				? { ...photo, hash: entry.hash, w: entry.w, h: entry.h }
				: photo;
		})
	}));
	const now = (options.now ?? new Date()).toISOString();
	const copied = options.mode === 'copy' || (await projectIdTaken(source.id));
	const project: Project = copied
		? {
				...rest,
				rooms,
				id: (options.newId ?? newId)(),
				name: `${source.name} (${options.copySuffix ?? 'copy'})`,
				rev: 0,
				createdAt: now,
				updatedAt: now
			}
		: { ...rest, rooms, updatedAt: now };
	await saveProject(project);
	return { project, missingPhotos, rejectedPhotos, copied };
}

export interface RestoreAllResult {
	restored: number;
	copies: number;
	missingPhotos: number;
	rejectedPhotos: number;
	skipped: number;
	skippedNames: string[];
}

export async function restoreBackupSet(
	set: ParsedBackupSet,
	options: Omit<RestoreOptions, 'mode' | 'cache'> & {
		onProgress?: (done: number, total: number) => void;
	}
): Promise<RestoreAllResult> {
	const cache: PhotoCache = new Map();
	const result: RestoreAllResult = {
		restored: 0,
		copies: 0,
		missingPhotos: 0,
		rejectedPhotos: 0,
		skipped: set.skipped,
		skippedNames: set.skippedNames
	};
	for (const [index, project] of set.projects.entries()) {
		options.onProgress?.(index, set.projects.length);
		const one = await restoreBackup(
			{ project, photos: set.photos },
			{ ...options, mode: 'keep', cache }
		);
		result.restored++;
		if (one.copied) result.copies++;
		result.missingPhotos += one.missingPhotos;
		result.rejectedPhotos += one.rejectedPhotos;
	}
	options.onProgress?.(set.projects.length, set.projects.length);
	return result;
}
