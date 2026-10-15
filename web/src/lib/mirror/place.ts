import type { HostJob, PlaceResult } from './types.ts';

// Puts a received photo into the open project: checks hash and magic bytes, re-encodes, stores the blob, adds the photo at the right room and perspective, remembers the transfer hash. Duplicates (by transfer hash) are reported, not added twice.
export async function placeShot(
	job: HostJob,
	shot: { room: number; stepKey: string; takenAt?: string; hash?: string },
	bytes: Uint8Array<ArrayBuffer>
): Promise<PlaceResult> {
	void job;
	void shot;
	void bytes;
	throw new Error('not implemented');
}
