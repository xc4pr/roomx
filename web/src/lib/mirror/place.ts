import type { Photo } from '#lib/core/schema.ts';
import { PhotoError } from '#lib/features/photos/image.ts';
import { sha256Hex } from '#lib/features/photos/hash.ts';
import { newPhotoId } from '#lib/features/photos/process.ts';
import { reencodeImage, type Reencode } from '#lib/features/photos/reencode.ts';
import { checkImageBytes } from '#lib/features/photos/sniff.ts';
import { LIMITS } from '#lib/security/limits.ts';
import { loadProject, putPhoto } from '#lib/state/persistence.ts';
import { store } from '#lib/state/project.svelte.ts';
import { markReceived } from './jobs.ts';
import { perspectiveFor, toHostStepKey } from './room.ts';
import type { HostJob, PlaceResult } from './types.ts';

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function validTakenAt(value: string | undefined): string | undefined {
	if (!value || value.length > 64 || !ISO_TIME.test(value)) return undefined;
	const time = Date.parse(value);
	return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

// The sender deletes its copy after an ok, so the photo must be in the saved project, not only in memory.
async function isSaved(projectId: string, roomId: string, photoId: string): Promise<boolean> {
	try {
		await store.flush();
		const saved = await loadProject(projectId);
		return (
			saved?.rooms.find((room) => room.id === roomId)?.photos.some((p) => p.id === photoId) ?? false
		);
	} catch {
		return false;
	}
}

// Puts a received photo into the open project: checks hash and magic bytes, re-encodes, stores the blob, adds the photo at the right room and perspective, remembers the transfer hash. Duplicates (by transfer hash) are reported, not added twice.
export async function placeShot(
	job: HostJob,
	shot: { room: number; stepKey: string; takenAt?: string; hash?: string },
	bytes: Uint8Array<ArrayBuffer>,
	reencode: Reencode = reencodeImage
): Promise<PlaceResult> {
	if (store.project?.id !== job.projectId) return { ok: false, reason: 'unknownJob' };
	if (store.readOnly) return { ok: false, reason: 'readOnly' };
	const transferHash = await sha256Hex(bytes);
	if (shot.hash !== undefined && shot.hash !== transferHash)
		return { ok: false, reason: 'invalid' };
	if (job.received.includes(transferHash)) return { ok: true, duplicate: true };
	const mapping = job.rooms.find((room) => room.index === shot.room);
	const room = mapping ? store.room(mapping.roomId) : undefined;
	if (!mapping || !room) return { ok: false, reason: 'unknownRoom' };
	const stepKey = toHostStepKey(shot.stepKey, mapping.elementIds);
	if (stepKey === null) return { ok: false, reason: 'unknownRoom' };
	const verdict = checkImageBytes(bytes);
	if (!verdict.ok) return { ok: false, reason: 'invalid' };
	if (room.photos.length >= LIMITS.photosPerRoom) return { ok: false, reason: 'limit' };
	let processed;
	try {
		processed = await reencode(bytes, verdict.info.kind);
	} catch (error) {
		if (error instanceof PhotoError && (error.code === 'storage' || error.code === 'readOnly')) {
			return { ok: false, reason: error.code };
		}
		return { ok: false, reason: 'invalid' };
	}
	if (store.project?.id !== job.projectId) return { ok: false, reason: 'unknownJob' };
	if (store.readOnly) return { ok: false, reason: 'readOnly' };
	const current = store.room(mapping.roomId);
	if (!current) return { ok: false, reason: 'unknownRoom' };
	if (current.photos.length >= LIMITS.photosPerRoom) return { ok: false, reason: 'limit' };
	try {
		await putPhoto({
			hash: processed.hash,
			blob: processed.blob,
			thumbnail: processed.thumbnail,
			w: processed.w,
			h: processed.h,
			uploaded: false
		});
	} catch {
		return { ok: false, reason: 'storage' };
	}
	const photo: Photo = {
		id: newPhotoId(),
		hash: processed.hash,
		perspective: perspectiveFor(current, stepKey),
		w: processed.w,
		h: processed.h,
		takenAt: validTakenAt(shot.takenAt) ?? new Date().toISOString()
	};
	if (!store.addReceivedPhoto(mapping.roomId, photo)) return { ok: false, reason: 'readOnly' };
	if (!(await isSaved(job.projectId, mapping.roomId, photo.id))) {
		store.dropReceivedPhoto(mapping.roomId, photo.id);
		return { ok: false, reason: 'storage' };
	}
	if (!job.received.includes(transferHash)) job.received.push(transferHash);
	try {
		await markReceived(job.id, transferHash);
	} catch {
		// The photo is in the project; the in-memory hash still stops duplicates in this session.
	}
	return { ok: true, duplicate: false };
}
