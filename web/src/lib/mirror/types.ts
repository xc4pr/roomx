import type { ElementKind, Point } from '#lib/core/schema.ts';
import type { Language } from '#lib/core/units.ts';

export const JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const QR_MAX_VERSION = 25;
export const FALLBACK_AFTER_MS = 30_000;
export const MAX_SHOT_BYTES = 16 * 1024 * 1024;
export const MAX_SHOTS_PER_JOB = 500;
export const MAX_ROOMS_PER_JOB = 50;
export const MAX_ELEMENTS_PER_MIRROR_ROOM = 200;

// What the phone needs to run the photo tour of one room. On the phone, element ids are `e<index>`.
export interface MirrorElement {
	kind: ElementKind;
	wall: number;
	offset: number;
	width: number;
}

export interface MirrorRoom {
	// Position in the job; stable across QR parts and used in every message and file name.
	index: number;
	name: string;
	polygon: Point[];
	height: number;
	elements: MirrorElement[];
	// Step keys (phone form) that already have a photo on the computer.
	done: string[];
}

// Content of one QR code / link. A job with many rooms is split into several parts with the same token.
export interface JobPayload {
	v: 1;
	project: string;
	lang: Language;
	expiresAt: number;
	// Self-hosted edition: the phone may also upload to the encrypted mailbox on the same origin.
	server?: boolean;
	part: number;
	parts: number;
	rooms: MirrorRoom[];
}

export interface HostJobRoom {
	index: number;
	roomId: string;
	// Real element ids in the order sent to the phone, so `e3` maps back to elementIds[3].
	elementIds: string[];
	// Corner count when the job was made; the phone numbers corner and wall steps by it.
	corners?: number;
}

// Kept on the computer that created the job. Never synced, never exported.
export interface HostJob {
	id: string;
	role: 'host';
	projectId: string;
	token: string;
	createdAt: number;
	expiresAt: number;
	rooms: HostJobRoom[];
	links: string[];
	// Transfer hashes (SHA-256 of the received JPEG bytes) already placed in the project.
	received: string[];
	revokedAt?: number;
	server?: boolean;
}

// Kept on the phone that scanned the job.
export interface CameraJob {
	id: string;
	role: 'camera';
	token: string;
	project: string;
	lang: Language;
	createdAt: number;
	expiresAt: number;
	parts: number;
	partsSeen: number[];
	rooms: MirrorRoom[];
	revokedAt?: number;
	server?: boolean;
}

export type MirrorJob = HostJob | CameraJob;

// A photo taken on the phone and not yet confirmed by the computer.
export interface Shot {
	id: string;
	jobId: string;
	room: number;
	stepKey: string;
	hash: string;
	blob: Blob;
	thumbnail: Blob;
	w: number;
	h: number;
	takenAt: string;
	// Mailbox id (SHA-256 of the sealed upload) once the server has stored it.
	uploaded?: string;
}

export interface ShotInfo {
	hash: string;
	room: number;
	stepKey: string;
	takenAt: string;
	size: number;
}

export type RejectReason =
	'invalid' | 'limit' | 'storage' | 'readOnly' | 'unknownRoom' | 'unknownJob';

export type PlaceResult = { ok: true; duplicate: boolean } | { ok: false; reason: RejectReason };

// Assignment of a photo that arrives as a file (share sheet fallback), read from its name or JPEG comment.
export interface ShotTag {
	jobId: string;
	room: number;
	stepKey: string;
}

export type LinkStatus = 'idle' | 'searching' | 'connected' | 'ended';

export interface HostJobStatus {
	status: LinkStatus;
	peers: number;
	// Photos placed during this job (all sessions) and photos the phone still reports as pending.
	received: number;
	expected: number;
}

export interface CameraStatus {
	status: LinkStatus;
	// Counted per connection: "7 of 14 transferred".
	sent: number;
	total: number;
	pending: number;
	failed: string[];
	fallbackSuggested: boolean;
	revoked: boolean;
	expired: boolean;
	// The job or its photos could not be read from storage; they may still be there.
	storageError: boolean;
	// Mailbox path: photos stored on the server and not yet fetched by the computer.
	uploaded: number;
	server: 'off' | 'ok' | 'unreachable';
}

export interface Transport {
	send(data: Uint8Array<ArrayBuffer>, peer: string): Promise<void>;
	onPeerJoin(listener: (peer: string) => void): void;
	onPeerLeave(listener: (peer: string) => void): void;
	onData(listener: (data: Uint8Array<ArrayBuffer>, peer: string) => void): void;
	leave(): Promise<void>;
}

export type OpenTransport = (room: { topic: string; password: string }) => Promise<Transport>;
