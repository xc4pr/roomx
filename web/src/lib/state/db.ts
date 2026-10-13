import Dexie, { type Table } from 'dexie';
import type { Project } from '#lib/core/schema.ts';

export interface StoredPhoto {
	hash: string;
	blob: Blob;
	thumbnail: Blob;
	w: number;
	h: number;
	uploaded: boolean;
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

	constructor(name = 'roomx') {
		super(name);
		this.version(1).stores({
			projects: 'id, updatedAt',
			photos: 'hash',
			sync: 'projectId',
			previews: 'projectId',
			kv: 'key'
		});
	}
}

export const db = new RoomxDatabase();
