import { describe, expect, it } from 'vitest';
import { readShotTag, shotFileName, withoutShotComment, withShotComment } from './files.ts';
import type { ShotTag } from './types.ts';

const jpeg = (): Uint8Array<ArrayBuffer> =>
	new Uint8Array([
		0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xda, 0x00, 0x02, 1, 2, 0xff, 0xd9
	]);

const tag: ShotTag = { jobId: '_ab-CD_ef-1_', room: 3, stepKey: 'corner:A:1' };

describe('file names', () => {
	it('round trips, also with _ and - in the job id', () => {
		const name = shotFileName(tag);
		expect(name).toBe('roomx__ab-CD_ef-1__3_corner~A~1.jpg');
		expect(readShotTag(name, jpeg())).toEqual(tag);
		const other: ShotTag = { jobId: '------------', room: 12, stepKey: 'electric:e4' };
		expect(readShotTag(shotFileName(other), jpeg())).toEqual(other);
	});

	it('tolerates renamed copies', () => {
		const base = 'roomx__ab-CD_ef-1__3_wall~2';
		for (const name of [`${base} (1).jpg`, `${base}-1.JPG`, `${base}.jpeg`, `dir/${base}.jpg`]) {
			expect(readShotTag(name, jpeg())).toEqual({ ...tag, stepKey: 'wall:2' });
		}
	});

	it('returns null for unrelated names', () => {
		for (const name of [
			'IMG_0001.jpg',
			'roomx_short_1_wall~1.jpg',
			'roomx__ab-CD_ef-1__99_wall~1.jpg'
		]) {
			expect(readShotTag(name, jpeg())).toBeNull();
		}
	});
});

describe('JPEG comment', () => {
	it('is inserted after SOI and read back', () => {
		const tagged = withShotComment(jpeg(), tag);
		expect([...tagged.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xfe]);
		expect(tagged.length).toBeGreaterThan(jpeg().length);
		expect([...tagged.subarray(tagged.length - 14)]).toEqual([...jpeg().subarray(2)]);
		expect(readShotTag('IMG.jpg', tagged)).toEqual(tag);
	});

	it('wins over the file name', () => {
		const tagged = withShotComment(jpeg(), tag);
		expect(readShotTag(shotFileName({ ...tag, room: 5 }), tagged)).toEqual(tag);
	});

	it('does not read past a truncated segment', () => {
		const tagged = withShotComment(jpeg(), tag);
		const cut = tagged.slice(0, 20);
		expect(readShotTag('IMG.jpg', cut)).toBeNull();
		expect(readShotTag(shotFileName(tag), cut)).toEqual(tag);
	});

	it('ignores foreign comments and bad tags', () => {
		const foreign = withShotComment(jpeg(), { ...tag, jobId: 'short' });
		expect(readShotTag('x.jpg', foreign)).toBeNull();
		expect(readShotTag('x.jpg', new Uint8Array([1, 2, 3]))).toBeNull();
	});

	it('ignores step keys longer than a label', () => {
		const long = withShotComment(jpeg(), { ...tag, stepKey: `wall:${'1'.repeat(300)}` });
		expect(readShotTag('x.jpg', long)).toBeNull();
	});

	// A shared file must hash like the photo sent directly, or both paths would place it.
	it('comes off again, giving back the original bytes', () => {
		expect(withoutShotComment(withShotComment(jpeg(), tag))).toEqual(jpeg());
		expect(withoutShotComment(jpeg())).toEqual(jpeg());
		const foreign = withShotComment(jpeg(), { ...tag, jobId: 'short' });
		expect(withoutShotComment(foreign)).toEqual(foreign);
		const cut = withShotComment(jpeg(), tag).slice(0, 20);
		expect(withoutShotComment(cut)).toEqual(cut);
	});
});
