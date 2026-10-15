import { db } from './db.ts';
import { deleteProject, notifyChange } from './persistence.ts';
import { scheduleCleanup } from './cleanup.ts';

export const TRASH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface TrashEntry {
	id: string;
	name: string;
	roomCount: number;
	trashedAt: string;
	daysLeft: number;
}

export function daysLeft(trashedAt: string, now: Date = new Date()): number {
	const trashed = Date.parse(trashedAt);
	if (Number.isNaN(trashed)) return TRASH_DAYS;
	const remaining = trashed + TRASH_DAYS * DAY_MS - now.getTime();
	return Math.max(0, Math.ceil(remaining / DAY_MS));
}

export function isExpired(trashedAt: string, now: Date = new Date()): boolean {
	const trashed = Date.parse(trashedAt);
	return !Number.isNaN(trashed) && now.getTime() - trashed >= TRASH_DAYS * DAY_MS;
}

export async function trashProject(id: string, now: Date = new Date()): Promise<boolean> {
	const project = await db.projects.get(id);
	if (!project || project.deleted) return false;
	await db.trash.put({ projectId: id, trashedAt: now.toISOString() });
	notifyChange(id);
	return true;
}

export async function restoreFromTrash(id: string): Promise<boolean> {
	if (!(await db.trash.get(id))) return false;
	await db.trash.delete(id);
	notifyChange(id);
	return true;
}

export async function listTrash(now: Date = new Date()): Promise<TrashEntry[]> {
	const rows = await db.trash.toArray();
	const projects = await db.projects.bulkGet(rows.map((row) => row.projectId));
	const entries: TrashEntry[] = [];
	const stale: string[] = [];
	rows.forEach((row, index) => {
		const project = projects[index];
		if (!project || project.deleted) {
			stale.push(row.projectId);
			return;
		}
		entries.push({
			id: project.id,
			name: project.name,
			roomCount: project.rooms.length,
			trashedAt: row.trashedAt,
			daysLeft: daysLeft(row.trashedAt, now)
		});
	});
	if (stale.length > 0) await db.trash.bulkDelete(stale);
	return entries.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
}

export async function purgeFromTrash(id: string): Promise<void> {
	await deleteProject(id);
	scheduleCleanup();
}

export async function purgeExpiredTrash(now: Date = new Date()): Promise<number> {
	const rows = await db.trash.toArray();
	const expired = rows.filter((row) => isExpired(row.trashedAt, now));
	for (const row of expired) await purgeFromTrash(row.projectId);
	return expired.length;
}
