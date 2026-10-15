import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleProject } from '#lib/core/fixtures.ts';
import { LIMITS } from '#lib/security/limits.ts';
import { store } from '#lib/state/project.svelte.ts';
import { PhotoError } from './image.ts';

const putPhoto = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('#lib/state/persistence.ts', async (original) => ({
	...(await original<Record<string, unknown>>()),
	putPhoto
}));

const { addPhotoFromFile } = await import('./process.ts');

const file = () => new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' });
const perspective = { kind: 'free' as const, caption: { de: 'x', en: 'x' } };

async function code(promise: Promise<unknown>): Promise<string | undefined> {
	try {
		await promise;
	} catch (error) {
		return error instanceof PhotoError ? error.code : String(error);
	}
	return undefined;
}

describe('addPhotoFromFile guards', () => {
	beforeEach(() => {
		putPhoto.mockClear();
		store.replace(sampleProject());
		store.readOnly = false;
	});

	it('stores nothing in a read-only tab', async () => {
		store.readOnly = true;
		expect(await code(addPhotoFromFile('room-rect', file(), perspective))).toBe('readOnly');
		expect(putPhoto).not.toHaveBeenCalled();
	});

	it('refuses photos beyond photosPerRoom', async () => {
		const project = sampleProject();
		project.rooms[0].photos = Array.from({ length: LIMITS.photosPerRoom }, (_, i) => ({
			id: `p${i}`,
			hash: 'h'.repeat(64),
			perspective,
			w: 1,
			h: 1,
			takenAt: '2026-01-01T00:00:00.000Z'
		}));
		store.replace(project);
		expect(await code(addPhotoFromFile('room-rect', file(), perspective))).toBe('limit');
		expect(putPhoto).not.toHaveBeenCalled();
	});
});
