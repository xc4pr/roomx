import { describe, expect, it } from 'vitest';
import type { HostJob } from '#lib/mirror/types.ts';
import { classifyShot, limitFiles, MAX_IMPORT_FILES } from './importPlan.ts';

const job = (patch: Partial<HostJob> = {}): HostJob => ({
	id: 'job1',
	role: 'host',
	projectId: 'p',
	token: 't',
	createdAt: 0,
	expiresAt: 1,
	rooms: [{ index: 0, roomId: 'r0', elementIds: ['a'] }],
	links: [],
	received: ['known'],
	...patch
});
const tag = { jobId: 'job1', room: 0, stepKey: 'wall:0' };
const LIMIT = 1000;

describe('classifyShot', () => {
	it('is ready for a new shot of an open job', () => {
		const result = classifyShot(tag, 'new', 10, LIMIT, [job()]);
		expect(result).toMatchObject({ state: 'ready', roomId: 'r0', elementIds: ['a'] });
	});

	it('recognises a known transfer hash', () => {
		expect(classifyShot(tag, 'known', 10, LIMIT, [job()]).state).toBe('duplicate');
	});

	it('rejects unknown, ended and room-less jobs', () => {
		expect(classifyShot({ ...tag, jobId: 'x' }, 'new', 10, LIMIT, [job()]).state).toBe('otherJob');
		expect(classifyShot(tag, 'new', 10, LIMIT, [job({ revokedAt: 5 })]).state).toBe('otherJob');
		expect(classifyShot({ ...tag, room: 3 }, 'new', 10, LIMIT, [job()]).state).toBe('otherJob');
	});

	it('handles missing tags and oversized files', () => {
		expect(classifyShot(null, 'new', 10, LIMIT, [job()]).state).toBe('untagged');
		expect(classifyShot(tag, 'new', LIMIT + 1, LIMIT, [job()]).state).toBe('tooLarge');
	});
});

describe('limitFiles', () => {
	it('cuts at the file limit', () => {
		const files = Array.from({ length: 5 }, (_, i) => i);
		expect(limitFiles(files, MAX_IMPORT_FILES - 2)).toEqual({ accepted: [0, 1], cut: true });
		expect(limitFiles(files, 0)).toEqual({ accepted: files, cut: false });
	});
});
