import Dexie, { type Table } from 'dexie';
import type { Project } from '#lib/core/schema.ts';
import { reportStorageError, StorageBlockedError } from './storageErrors.ts';

export const DB_NAME = 'roomx';

export interface StoredPhoto {
	hash: string;
	blob: Blob;
	thumbnail: Blob;
	w: number;
	h: number;
	uploaded: boolean;
	storedAt?: number;
}

export interface SyncRecord {
	projectId: string;
	baseRev: number;
	dirty: boolean;
	syncedAt?: string;
}

export interface StoredPreview {
	projectId: string;
	blob: Blob;
	updatedAt: string;
}

export interface TrashRecord {
	projectId: string;
	trashedAt: string;
}

export interface KeyValue {
	key: string;
	value: unknown;
}

export class RoomxDatabase extends Dexie {
	projects!: Table<Project, string>;
	photos!: Table<StoredPhoto, string>;
	sync!: Table<SyncRecord, string>;
	previews!: Table<StoredPreview, string>;
	kv!: Table<KeyValue, string>;
	trash!: Table<TrashRecord, string>;

	constructor(name = DB_NAME) {
		super(name);
		this.version(1).stores({
			projects: 'id, updatedAt',
			photos: 'hash',
			sync: 'projectId',
			previews: 'projectId',
			kv: 'key'
		});
		this.version(2).stores({
			trash: 'projectId'
		});
	}
}

export const db = new RoomxDatabase();

db.on('blocked', () => {
	reportStorageError(new StorageBlockedError());
});
