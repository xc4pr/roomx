import type { HostJob, ShotTag } from '#lib/mirror/types.ts';

export const MAX_IMPORT_FILES = 200;

export type ImportState = 'ready' | 'duplicate' | 'otherJob' | 'untagged' | 'tooLarge';

export interface ImportClass {
	state: ImportState;
	job?: HostJob;
	roomId?: string;
	elementIds?: string[];
	corners?: number;
}

export function classifyShot(
	tag: ShotTag | null,
	hash: string,
	size: number,
	maxBytes: number,
	jobs: readonly HostJob[]
): ImportClass {
	if (size > maxBytes) return { state: 'tooLarge' };
	if (!tag) return { state: 'untagged' };
	const job = jobs.find((candidate) => candidate.id === tag.jobId);
	if (!job || job.revokedAt !== undefined) return { state: 'otherJob' };
	const room = job.rooms.find((candidate) => candidate.index === tag.room);
	if (!room) return { state: 'otherJob' };
	const found = { job, roomId: room.roomId, elementIds: room.elementIds, corners: room.corners };
	if (job.received.includes(hash)) return { state: 'duplicate', ...found };
	return { state: 'ready', ...found };
}

export function limitFiles<T>(
	files: readonly T[],
	already: number
): { accepted: T[]; cut: boolean } {
	const room = Math.max(0, MAX_IMPORT_FILES - already);
	return { accepted: files.slice(0, room), cut: files.length > room };
}
