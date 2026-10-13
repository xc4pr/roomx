import { migrateProject } from '#lib/core/migrations.ts';
import { SCHEMA_VERSION, type Project } from '#lib/core/schema.ts';
import { db, type StoredPhoto, type SyncRecord } from './db.ts';

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

export async function listProjects(): Promise<ProjectSummary[]> {
	const all = await db.projects.toArray();
	return all
		.filter((project) => !project.deleted)
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
		.map((project) => ({
			id: project.id,
			name: project.name,
			updatedAt: project.updatedAt,
			roomCount: project.rooms.length
		}));
}

export async function loadProject(id: string): Promise<Project | undefined> {
	const raw = await db.projects.get(id);
	if (!raw || raw.deleted) return undefined;
	return migrateProject(raw);
}

export async function loadAllProjects(): Promise<Project[]> {
	return (await db.projects.toArray()).map(migrateProject);
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
	await db.transaction('rw', db.projects, db.sync, async () => {
		await db.projects.put(project);
		await markDirty(project.id);
	});
	notifyChange(project.id);
}

// Used by sync and restore: stores a server or backup state without marking it as a local change.
export async function storeSyncedProject(project: Project, record: SyncRecord): Promise<void> {
	await db.transaction('rw', db.projects, db.sync, async () => {
		await db.projects.put(project);
		await db.sync.put(record);
	});
}

export async function deleteProject(id: string): Promise<void> {
	const project = await db.projects.get(id);
	if (!project) return;
	await saveProject({
		...project,
		deleted: true,
		rooms: [],
		variants: [],
		updatedAt: new Date().toISOString()
	});
	await db.previews.delete(id);
}

export async function putPhoto(photo: StoredPhoto): Promise<void> {
	if (!(await db.photos.get(photo.hash))) await db.photos.put(photo);
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

export function onLocalChange(listener: ChangeListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function notifyChange(projectId: string): void {
	for (const listener of listeners) listener(projectId);
}

export async function renameProject(id: string, name: string): Promise<void> {
	const project = await loadProject(id);
	if (project) await saveProject({ ...project, name, updatedAt: new Date().toISOString() });
}

export async function pruneOrphanPhotos(): Promise<number> {
	const used = new Set<string>();
	for (const project of await db.projects.toArray()) {
		for (const room of project.rooms) for (const photo of room.photos) used.add(photo.hash);
	}
	const orphans = (await db.photos.toCollection().primaryKeys()).filter((hash) => !used.has(hash));
	await db.photos.bulkDelete(orphans);
	return orphans.length;
}
