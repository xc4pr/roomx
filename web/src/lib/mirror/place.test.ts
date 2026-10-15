import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleProject } from '#lib/core/fixtures.ts';
import { PhotoError } from '#lib/features/photos/image.ts';
import { sha256Hex } from '#lib/features/photos/hash.ts';
import type { Reencode } from '#lib/features/photos/reencode.ts';
import { minimalJpeg, svgImage } from '#lib/features/photos/testImages.ts';
import { LIMITS } from '#lib/security/limits.ts';
import { db } from '#lib/state/db.ts';
import { store } from '#lib/state/project.svelte.ts';

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
