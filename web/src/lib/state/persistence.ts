import { migrateProject } from '#lib/core/migrations.ts';
import { SCHEMA_VERSION, type Project } from '#lib/core/schema.ts';
import { sharedBus, tabId } from './channel.ts';
import { db, type StoredPhoto, type SyncRecord } from './db.ts';
import { reportStorageError, reportStorageRecovered } from './storageErrors.ts';

export const ORPHAN_MIN_AGE_MS = 10 * 60 * 1000;

export interface ProjectSummary {
	id: string;
	name: string;
	updatedAt: string;
	roomCount: number;
}

export function emptyProject(id: string, name: string, now = new Date().toISOString()): Project {
	return {
		id,
		name,
		schemaVersion: SCHEMA_VERSION,
		rev: 0,
		createdAt: now,
		updatedAt: now,
		rooms: [],
		variants: []
	};
}

async function trashedIds(): Promise<Set<string>> {
	return new Set(await db.trash.toCollection().primaryKeys());
}

export async function listProjects(): Promise<ProjectSummary[]> {
	const [all, trashed] = await Promise.all([db.projects.toArray(), trashedIds()]);
	return all
		.filter((project) => !project.deleted && !trashed.has(project.id))
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		.map((project) => ({
			id: project.id,
			name: project.name,
			updatedAt: project.updatedAt,
			roomCount: project.rooms.length
		}));
}

export async function loadProject(id: string): Promise<Project | undefined> {
	const [raw, trashed] = await Promise.all([db.projects.get(id), db.trash.get(id)]);
	if (!raw || raw.deleted || trashed) return undefined;
	return migrateProject(raw);
}

export async function loadAllProjects(): Promise<Project[]> {
	return (await db.projects.toArray()).map(migrateProject);
}

export async function loadActiveProjects(): Promise<Project[]> {
	const [all, trashed] = await Promise.all([db.projects.toArray(), trashedIds()]);
	return all
		.filter((project) => !project.deleted && !trashed.has(project.id))
		.map(migrateProject)
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface ProjectTimes {
	count: number;
	earliestCreatedAt: string | null;
	latestChangeAt: string | null;
}

export async function readProjectTimes(): Promise<ProjectTimes> {
	const [all, trashed] = await Promise.all([db.projects.toArray(), trashedIds()]);
	const active = all.filter((project) => !project.deleted && !trashed.has(project.id));
	return {
		count: active.length,
		earliestCreatedAt: active.map((project) => project.createdAt).sort()[0] ?? null,
		latestChangeAt:
			active
				.map((project) => project.updatedAt)
				.sort()
				.at(-1) ?? null
	};
}

export async function probeStorage(): Promise<boolean> {
	try {
		await db.open();
		await db.kv.get('probe');
		return true;
	} catch (error) {
		reportStorageError(error);
		return false;
	}
}

export async function projectIdTaken(id: string): Promise<boolean> {
	return (await db.projects.get(id)) !== undefined;
}

async function markDirty(projectId: string): Promise<void> {
	const record = await db.sync.get(projectId);
	await db.sync.put({
		projectId,
		baseRev: record?.baseRev ?? 0,
		dirty: true,
		syncedAt: record?.syncedAt
	});
}

export async function saveProject(project: Project): Promise<void> {
	try {
		await db.transaction('rw', db.projects, db.sync, async () => {
			await db.projects.put(project);
			await markDirty(project.id);
		});
	} catch (error) {
		reportStorageError(error);
		throw error;
	}
	reportStorageRecovered();
	notifyChange(project.id);
}

// Used by sync and restore: stores a server or backup state without marking it as a local change.
export async function storeSyncedProject(project: Project, record: SyncRecord): Promise<void> {
	try {
		await db.transaction('rw', db.projects, db.sync, async () => {
			await db.projects.put(project);
			await db.sync.put(record);
		});
	} catch (error) {
		reportStorageError(error);
		throw error;
	}
}

export async function deleteProject(id: string): Promise<void> {
	const project = await db.projects.get(id);
	if (project) {
		await saveProject({
			...project,
			deleted: true,
			rooms: [],
			variants: [],
			updatedAt: new Date().toISOString()
		});
		await db.previews.delete(id);
	}
	await db.trash.delete(id);
}

export async function putPhoto(photo: StoredPhoto): Promise<void> {
	try {
		const stored = { ...photo, storedAt: Date.now() };
		if (await db.photos.get(photo.hash))
			await db.photos.update(photo.hash, { storedAt: stored.storedAt });
		else await db.photos.put(stored);
	} catch (error) {
		reportStorageError(error);
		throw error;
	}
}

export function getPhoto(hash: string): Promise<StoredPhoto | undefined> {
	return db.photos.get(hash);
}

export async function putPreview(projectId: string, blob: Blob): Promise<void> {
	await db.previews.put({ projectId, blob, updatedAt: new Date().toISOString() });
}

export async function getPreview(projectId: string): Promise<Blob | undefined> {
	return (await db.previews.get(projectId))?.blob;
}

type ChangeListener = (projectId: string) => void;
const listeners = new Set<ChangeListener>();
const remoteListeners = new Set<ChangeListener>();
let listeningToBus = false;

export function onLocalChange(listener: ChangeListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function onRemoteChange(listener: ChangeListener): () => void {
	if (!listeningToBus) {
		listeningToBus = true;
		sharedBus()?.subscribe((message) => {
			if (message.type !== 'saved') return;
			for (const remote of remoteListeners) remote(message.projectId);
		});
	}
	remoteListeners.add(listener);
	return () => remoteListeners.delete(listener);
}

export function notifyChange(projectId: string): void {
	for (const listener of listeners) listener(projectId);
	sharedBus()?.post({ type: 'saved', projectId, from: tabId });
}

export async function renameProject(id: string, name: string): Promise<void> {
	const project = await loadProject(id);
	if (project) await saveProject({ ...project, name, updatedAt: new Date().toISOString() });
}

export function photoHashesOf(project: Project): string[] {
	const hashes: string[] = [];
	for (const room of project.rooms) for (const photo of room.photos) hashes.push(photo.hash);
	return hashes;
}

export interface PruneOptions {
	keep?: ReadonlySet<string>;
	minAgeMs?: number;
	now?: number;
}

export async function pruneOrphanPhotos(options: PruneOptions = {}): Promise<number> {
	const used = new Set(options.keep);
	for (const project of await db.projects.toArray()) {
		for (const hash of photoHashesOf(project)) used.add(hash);
	}
	const candidates = (await db.photos.toCollection().primaryKeys()).filter(
		(hash) => !used.has(hash)
	);
	if (candidates.length === 0) return 0;
	const cutoff = (options.now ?? Date.now()) - (options.minAgeMs ?? ORPHAN_MIN_AGE_MS);
	const records = await db.photos.bulkGet(candidates);
	const orphans = records
		.filter((record): record is StoredPhoto => record !== undefined)
		.filter((record) => (record.storedAt ?? 0) <= cutoff)
		.map((record) => record.hash);
	await db.photos.bulkDelete(orphans);
	return orphans.length;
}
