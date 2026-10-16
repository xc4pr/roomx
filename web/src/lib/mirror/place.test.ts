import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleProject } from '#lib/core/fixtures.ts';
import { PhotoError } from '#lib/features/photos/image.ts';
import { sha256Hex } from '#lib/features/photos/hash.ts';
import type { Reencode } from '#lib/features/photos/reencode.ts';
import { minimalJpeg, svgImage } from '#lib/features/photos/testImages.ts';
import { LIMITS } from '#lib/security/limits.ts';
import { db } from '#lib/state/db.ts';
import { loadProject } from '#lib/state/persistence.ts';
import { store } from '#lib/state/project.svelte.ts';
import { currentStorageProblem, reportStorageRecovered } from '#lib/state/storageErrors.ts';

const putPhoto = vi.hoisted(() => vi.fn(async () => undefined));
const saveProject = vi.hoisted(() => vi.fn());
vi.mock('#lib/state/persistence.ts', async (original) => {
	const real = await original<typeof import('#lib/state/persistence.ts')>();
	saveProject.mockImplementation(real.saveProject);
	return {
		...real,
		putPhoto,
		saveProject: (...args: Parameters<typeof real.saveProject>) => saveProject(...args)
	};
});

const markFails = vi.hoisted(() => ({ on: false }));
vi.mock('./jobs.ts', async (original) => {
	const real = await original<typeof import('./jobs.ts')>();
	return {
		...real,
		markReceived: async (jobId: string, hash: string) => {
			if (markFails.on) throw new Error('db closed');
			return real.markReceived(jobId, hash);
		}
	};
});

const { placeShot } = await import('./place.ts');
const { createHostJob } = await import('./job.ts');
const { getJob, saveHostJob } = await import('./jobs.ts');

const reencode: Reencode = async (bytes) => ({
	hash: await sha256Hex(new Uint8Array(bytes).reverse()),
	blob: new Blob([bytes as BlobPart]),
	thumbnail: new Blob([new Uint8Array(1)]),
	w: 64,
	h: 48
});

function jpeg(tag = ''): Uint8Array<ArrayBuffer> {
	return new Uint8Array(minimalJpeg(64, 48, tag));
}

async function newJob() {
	const project = store.project;
	if (!project) throw new Error('no project');
	const job = await createHostJob(project, ['room-rect'], 'https://app.test/');
	await saveHostJob(job);
	return job;
}

const roomPhotos = () => store.room('room-rect')?.photos ?? [];

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
	markFails.on = false;
	putPhoto.mockClear();
	putPhoto.mockImplementation(async () => undefined);
	store.replace(sampleProject());
	store.readOnly = false;
});

describe('placeShot', () => {
	it('adds the photo, stores the blob and remembers the transfer hash', async () => {
		const job = await newJob();
		const bytes = jpeg('a');
		const before = roomPhotos().length;
		const hash = await sha256Hex(bytes);
		const result = await placeShot(job, { room: 0, stepKey: 'corner:A', hash }, bytes, reencode);
		expect(result).toEqual({ ok: true, duplicate: false });
		expect(roomPhotos()).toHaveLength(before + 1);
		expect(putPhoto).toHaveBeenCalledTimes(1);
		expect(job.received).toEqual([hash]);
		const stored = await getJob(job.id);
		expect(stored?.role === 'host' && stored.received).toEqual([hash]);
	});

	it('reports a repeated transfer as duplicate without adding it twice', async () => {
		const job = await newJob();
		const bytes = jpeg('a');
		await placeShot(job, { room: 0, stepKey: 'corner:A' }, bytes, reencode);
		const count = roomPhotos().length;
		const again = await placeShot(job, { room: 0, stepKey: 'corner:A' }, bytes, reencode);
		expect(again).toEqual({ ok: true, duplicate: true });
		expect(roomPhotos()).toHaveLength(count);
	});

	it('refuses another project, a read-only tab and a wrong hash', async () => {
		const job = await newJob();
		expect(
			await placeShot({ ...job, projectId: 'other' }, { room: 0, stepKey: 'x' }, jpeg(), reencode)
		).toEqual({
			ok: false,
			reason: 'unknownJob'
		});
		const bytes = jpeg('b');
		const wrong = await placeShot(
			job,
			{ room: 0, stepKey: 'x', hash: 'f'.repeat(64) },
			bytes,
			reencode
		);
		expect(wrong).toEqual({ ok: false, reason: 'invalid' });
		store.readOnly = true;
		expect(await placeShot(job, { room: 0, stepKey: 'x' }, bytes, reencode)).toEqual({
			ok: false,
			reason: 'readOnly'
		});
		expect(putPhoto).not.toHaveBeenCalled();
	});

	it('refuses unknown rooms and element steps that no longer exist', async () => {
		const job = await newJob();
		expect(await placeShot(job, { room: 7, stepKey: 'corner:A' }, jpeg(), reencode)).toEqual({
			ok: false,
			reason: 'unknownRoom'
		});
		expect(await placeShot(job, { room: 0, stepKey: 'element:e99' }, jpeg(), reencode)).toEqual({
			ok: false,
			reason: 'unknownRoom'
		});
	});

	// Corner letters follow the polygon, so after a corner was added they may name another corner.
	it('places corner photos without a step once the room has more corners', async () => {
		const job = await newJob();
		await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('c1'), reencode);
		expect(roomPhotos().at(-1)?.perspective).toMatchObject({ kind: 'corner', stepKey: 'corner:A' });
		const polygon = store.room('room-rect')?.polygon ?? [];
		const [a, b] = polygon;
		store.setPolygon('room-rect', [a, { x: (a.x + b.x) / 2, y: a.y }, ...polygon.slice(1)]);
		await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('c2'), reencode);
		expect(roomPhotos().at(-1)?.perspective).toEqual({
			kind: 'free',
			caption: { de: 'Foto vom Handy', en: 'Photo from phone' }
		});
		await placeShot(job, { room: 0, stepKey: 'ceiling' }, jpeg('c3'), reencode);
		expect(roomPhotos().at(-1)?.perspective).toMatchObject({ kind: 'ceiling', stepKey: 'ceiling' });
	});

	it('refuses markup, non-images and images that cannot be re-encoded', async () => {
		const job = await newJob();
		const svg = new Uint8Array(svgImage());
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, svg, reencode)).toEqual({
			ok: false,
			reason: 'invalid'
		});
		const failing: Reencode = async () => {
			throw new PhotoError('decode');
		};
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('c'), failing)).toEqual({
			ok: false,
			reason: 'invalid'
		});
		expect(job.received).toEqual([]);
	});

	it('stops at photosPerRoom', async () => {
		const job = await newJob();
		const project = sampleProject();
		const perspective = { kind: 'free' as const, caption: { de: 'x', en: 'x' } };
		project.rooms[0].photos = Array.from({ length: LIMITS.photosPerRoom }, (_, i) => ({
			id: `p${i}`,
			hash: 'a'.repeat(64),
			perspective,
			w: 1,
			h: 1,
			takenAt: '2026-01-01T00:00:00.000Z'
		}));
		store.replace(project);
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg(), reencode)).toEqual({
			ok: false,
			reason: 'limit'
		});
	});

	it('reports storage failures and does not remember the transfer', async () => {
		const job = await newJob();
		putPhoto.mockRejectedValueOnce(new Error('quota'));
		const before = roomPhotos().length;
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('d'), reencode)).toEqual({
			ok: false,
			reason: 'storage'
		});
		expect(roomPhotos()).toHaveLength(before);
		expect(job.received).toEqual([]);
	});

	it('does not report ok while the project could not be saved, and takes the photo back', async () => {
		const job = await newJob();
		const before = roomPhotos().length;
		saveProject.mockRejectedValue(new Error('quota'));
		const result = await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('g'), reencode);
		expect(result).toEqual({ ok: false, reason: 'storage' });
		expect(roomPhotos()).toHaveLength(before);
		expect(job.received).toEqual([]);
		const real = await vi.importActual<typeof import('#lib/state/persistence.ts')>(
			'#lib/state/persistence.ts'
		);
		saveProject.mockImplementation(real.saveProject);
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('g'), reencode)).toEqual({
			ok: true,
			duplicate: false
		});
	});

	it('keeps a valid takenAt and replaces an invalid one', async () => {
		const job = await newJob();
		await placeShot(
			job,
			{ room: 0, stepKey: 'corner:A', takenAt: '2026-03-04T05:06:07.000Z' },
			jpeg('e'),
			reencode
		);
		await placeShot(
			job,
			{ room: 0, stepKey: 'corner:B', takenAt: 'yesterday' },
			jpeg('f'),
			reencode
		);
		const photos = roomPhotos();
		expect(photos.at(-2)?.takenAt).toBe('2026-03-04T05:06:07.000Z');
		expect(Number.isNaN(Date.parse(photos.at(-1)?.takenAt ?? ''))).toBe(false);
		expect(photos.at(-1)?.takenAt).not.toBe('yesterday');
	});
});

describe('placeShot while the world changes', () => {
	it('drops the photo when the tab becomes read-only during re-encoding', async () => {
		const job = await newJob();
		const before = roomPhotos().length;
		const slow: Reencode = async (bytes, kind) => {
			store.readOnly = true;
			return reencode(bytes, kind);
		};
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('ro1'), slow)).toEqual({
			ok: false,
			reason: 'readOnly'
		});
		expect(putPhoto).not.toHaveBeenCalled();
		expect(roomPhotos()).toHaveLength(before);
		expect(job.received).toEqual([]);
	});

	it('drops the photo when another project is opened during re-encoding', async () => {
		const job = await newJob();
		const slow: Reencode = async (bytes, kind) => {
			const other = sampleProject();
			other.id = 'other-project';
			store.replace(other);
			return reencode(bytes, kind);
		};
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('sw'), slow)).toEqual({
			ok: false,
			reason: 'unknownJob'
		});
		expect(putPhoto).not.toHaveBeenCalled();
		expect(job.received).toEqual([]);
	});

	it('reports the room as unknown when it vanished during re-encoding', async () => {
		const job = await newJob();
		const slow: Reencode = async (bytes, kind) => {
			const smaller = sampleProject();
			smaller.rooms = smaller.rooms.filter((room) => room.id !== 'room-rect');
			store.replace(smaller);
			return reencode(bytes, kind);
		};
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('gone'), slow)).toEqual({
			ok: false,
			reason: 'unknownRoom'
		});
		expect(putPhoto).not.toHaveBeenCalled();
	});

	it('stops at the limit when the room filled up during re-encoding', async () => {
		const job = await newJob();
		const slow: Reencode = async (bytes, kind) => {
			const full = sampleProject();
			const perspective = { kind: 'free' as const, caption: { de: 'x', en: 'x' } };
			full.rooms[0].photos = Array.from({ length: LIMITS.photosPerRoom }, (_, i) => ({
				id: `q${i}`,
				hash: 'b'.repeat(64),
				perspective,
				w: 1,
				h: 1,
				takenAt: '2026-01-01T00:00:00.000Z'
			}));
			store.replace(full);
			return reencode(bytes, kind);
		};
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('lim'), slow)).toEqual({
			ok: false,
			reason: 'limit'
		});
		expect(putPhoto).not.toHaveBeenCalled();
	});
});

describe('placeShot re-encoding errors', () => {
	it('passes storage and readOnly errors on so the sender retries', async () => {
		const job = await newJob();
		for (const code of ['storage', 'readOnly'] as const) {
			const failing: Reencode = async () => {
				throw new PhotoError(code);
			};
			expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg(code), failing)).toEqual({
				ok: false,
				reason: code
			});
		}
		expect(job.received).toEqual([]);
	});

	it('treats other photo errors and unknown exceptions as invalid, not as retryable', async () => {
		const job = await newJob();
		for (const error of [new PhotoError('tooLarge'), new PhotoError('decode'), new Error('boom')]) {
			const failing: Reencode = async () => {
				throw error;
			};
			expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('e'), failing)).toEqual({
				ok: false,
				reason: 'invalid'
			});
		}
		expect(putPhoto).not.toHaveBeenCalled();
	});

	it('never calls the re-encoder for bytes that are not an image', async () => {
		const job = await newJob();
		const spy = vi.fn(reencode);
		for (const bytes of [new Uint8Array(0), new Uint8Array(200).fill(1)]) {
			expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, bytes, spy)).toEqual({
				ok: false,
				reason: 'invalid'
			});
		}
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('placeShot transfer hash', () => {
	it('accepts a matching hash and rejects it before any other work when it differs', async () => {
		const job = await newJob();
		const bytes = jpeg('h1');
		const spy = vi.fn(reencode);
		expect(
			await placeShot(job, { room: 9, stepKey: 'x', hash: 'f'.repeat(64) }, bytes, spy)
		).toEqual({ ok: false, reason: 'invalid' });
		expect(spy).not.toHaveBeenCalled();
		const hash = await sha256Hex(bytes);
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A', hash }, bytes, spy)).toEqual({
			ok: true,
			duplicate: false
		});
	});

	it('a corrupted copy of a received photo is invalid, not a duplicate', async () => {
		const job = await newJob();
		const bytes = jpeg('h2');
		const hash = await sha256Hex(bytes);
		await placeShot(job, { room: 0, stepKey: 'corner:A', hash }, bytes, reencode);
		const damaged = new Uint8Array(bytes);
		damaged[damaged.length - 1] ^= 0xff;
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A', hash }, damaged, reencode)).toEqual(
			{
				ok: false,
				reason: 'invalid'
			}
		);
	});

	it('a known photo is a duplicate even if its room is gone, so the sender can delete it', async () => {
		const job = await newJob();
		const bytes = jpeg('h3');
		await placeShot(job, { room: 0, stepKey: 'corner:A' }, bytes, reencode);
		expect(await placeShot(job, { room: 5, stepKey: 'zzz' }, bytes, reencode)).toEqual({
			ok: true,
			duplicate: true
		});
	});

	it('but a read-only tab does not confirm even a known photo', async () => {
		const job = await newJob();
		const bytes = jpeg('h4');
		await placeShot(job, { room: 0, stepKey: 'corner:A' }, bytes, reencode);
		store.readOnly = true;
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, bytes, reencode)).toEqual({
			ok: false,
			reason: 'readOnly'
		});
	});

	it('two different files get two photos', async () => {
		const job = await newJob();
		const before = roomPhotos().length;
		await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('d1'), reencode);
		await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('d2'), reencode);
		expect(roomPhotos()).toHaveLength(before + 2);
		expect(job.received).toHaveLength(2);
	});
});

describe('placeShot bookkeeping', () => {
	it('still says ok when the job record cannot be updated, and remembers the hash in memory', async () => {
		const job = await newJob();
		markFails.on = true;
		const bytes = jpeg('mem');
		const before = roomPhotos().length;
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, bytes, reencode)).toEqual({
			ok: true,
			duplicate: false
		});
		expect(job.received).toHaveLength(1);
		expect(currentStorageProblem()).toBe('failed');
		reportStorageRecovered();
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, bytes, reencode)).toEqual({
			ok: true,
			duplicate: true
		});
		expect(roomPhotos()).toHaveLength(before + 1);
	});

	it('does not remember the transfer when the flush before saving fails', async () => {
		const job = await newJob();
		const flush = vi.spyOn(store, 'flush').mockRejectedValueOnce(new Error('locked'));
		const before = roomPhotos().length;
		expect(await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('fl'), reencode)).toEqual({
			ok: false,
			reason: 'storage'
		});
		flush.mockRestore();
		expect(roomPhotos()).toHaveLength(before);
		expect(job.received).toEqual([]);
	});

	it('takes the photo back when the saved project lacks it', async () => {
		const job = await newJob();
		saveProject.mockImplementation(async () => undefined);
		const before = roomPhotos().length;
		expect(
			await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('nosave'), reencode)
		).toEqual({
			ok: false,
			reason: 'storage'
		});
		expect(roomPhotos()).toHaveLength(before);
		expect(store.canUndo).toBe(false);
		const real = await vi.importActual<typeof import('#lib/state/persistence.ts')>(
			'#lib/state/persistence.ts'
		);
		saveProject.mockImplementation(real.saveProject);
	});

	// The phone deletes its copy after the ok, so undoing an earlier edit must not drop the photo.
	it('keeps a received photo through undo and redo, without an undo step of its own', async () => {
		const job = await newJob();
		const height = store.room('room-rect')?.height;
		store.updateRoom('room-rect', { height: 2600 });
		store.updateRoom('room-rect', { height: 2700 });
		store.undo();
		const result = await placeShot(job, { room: 0, stepKey: 'corner:A' }, jpeg('u'), reencode);
		expect(result).toEqual({ ok: true, duplicate: false });
		const placed = roomPhotos().at(-1)?.id;
		const hasPhoto = () => roomPhotos().some((photo) => photo.id === placed);
		expect(store.canRedo).toBe(true);
		store.undo();
		expect(store.room('room-rect')?.height).toBe(height);
		expect(hasPhoto()).toBe(true);
		expect(store.canUndo).toBe(false);
		store.redo();
		store.redo();
		expect(store.room('room-rect')?.height).toBe(2700);
		expect(hasPhoto()).toBe(true);
		await store.flush();
		const saved = await loadProject(store.project?.id ?? '');
		expect(
			saved?.rooms.find((room) => room.id === 'room-rect')?.photos.some((p) => p.id === placed)
		).toBe(true);
	});
});

describe('placeShot takenAt', () => {
	it('rejects dates without a time, overlong strings and impossible dates', async () => {
		const job = await newJob();
		const values = ['2026-03-04', `2026-03-04T05:06${'0'.repeat(80)}`, '2026-13-45T25:61:00Z', ''];
		const started = Date.now();
		for (const [i, takenAt] of values.entries()) {
			await placeShot(job, { room: 0, stepKey: 'corner:A', takenAt }, jpeg(`t${i}`), reencode);
		}
		for (const photo of roomPhotos().slice(-values.length)) {
			expect(Date.parse(photo.takenAt)).toBeGreaterThanOrEqual(started - 1000);
		}
	});

	it('normalises a valid time with an offset to UTC', async () => {
		const job = await newJob();
		await placeShot(
			job,
			{ room: 0, stepKey: 'corner:A', takenAt: '2026-03-04T05:06:07+02:00' },
			jpeg('tz'),
			reencode
		);
		expect(roomPhotos().at(-1)?.takenAt).toBe('2026-03-04T03:06:07.000Z');
	});
});
