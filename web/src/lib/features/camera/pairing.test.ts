import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { goto } from '$app/navigation';
import { createRoom } from '#lib/core/defaults.ts';
import type { Project } from '#lib/core/schema.ts';
import { createHostJob, encodeLink, parsePair, type PairError } from '#lib/mirror/job.ts';
import { getJob } from '#lib/mirror/jobs.ts';
import type { CameraJob, JobPayload } from '#lib/mirror/types.ts';
import { db } from '#lib/state/db.ts';
import { consumePairFragment, pairErrorMessage } from './pairing.ts';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

const APP = 'https://xc4pr.github.io/roomx/';
const gotoMock = vi.mocked(goto);

function project(): Project {
	const r = createRoom('a', 'Küche');
	r.polygon = [
		{ x: 0, y: 0 },
		{ x: 4000, y: 0 },
		{ x: 4000, y: 3000 }
	];
	return {
		id: 'p1',
		name: 'Wohnung',
		schemaVersion: 2,
		rev: 0,
		createdAt: '',
		updatedAt: '',
		rooms: [r],
		variants: []
	} as Project;
}

function stubLocation(hash: string): { hash: string } {
	const loc = { pathname: '/roomx/camera', search: '?x=1', hash };
	vi.stubGlobal('location', loc);
	return loc;
}

function fragmentOf(link: string): string {
	return link.slice(link.indexOf('#'));
}

function part(n: number, index: number): JobPayload {
	return {
		v: 1,
		project: 'P',
		lang: 'de',
		expiresAt: Date.now() + 60_000,
		part: n,
		parts: 2,
		rooms: [
			{
				index,
				name: `R${index}`,
				polygon: [
					{ x: 0, y: 0 },
					{ x: 1000, y: 0 },
					{ x: 1000, y: 1000 }
				],
				height: 2500,
				elements: [],
				done: []
			}
		]
	};
}

beforeEach(async () => {
	await Promise.all(db.tables.map((table) => table.clear()));
	gotoMock.mockReset();
	gotoMock.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('consumePairFragment', () => {
	it('returns null without a pair marker and leaves the URL alone', async () => {
		stubLocation('#other');
		expect(await consumePairFragment()).toBeNull();
		expect(await consumePairFragment('')).toBeNull();
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('stores a valid part and strips the hash via goto', async () => {
		const job = await createHostJob(project(), ['a'], APP);
		const hash = fragmentOf(job.links[0]);
		stubLocation(hash);
		const outcome = await consumePairFragment();
		expect(outcome).toEqual({ jobId: job.id });
		const stored = await getJob(job.id);
		expect(stored?.role).toBe('camera');
		expect((stored as CameraJob).partsSeen).toEqual([1]);
		expect(gotoMock).toHaveBeenCalledTimes(1);
		expect(gotoMock).toHaveBeenCalledWith('/roomx/camera?x=1', {
			replace: true,
			reset: false
		});
	});

	it('reports a malformed fragment and still strips the hash', async () => {
		stubLocation('#pair=broken');
		const hash = '#pair=broken';
		const expected = parsePair(hash);
		expect(expected.ok).toBe(false);
		const outcome = await consumePairFragment(hash);
		expect(outcome).toEqual({ error: expected.ok ? 'format' : expected.error });
		expect(await db.mirrorJobs.count()).toBe(0);
		expect(gotoMock).toHaveBeenCalledTimes(1);
	});

	it('falls back to clearing location.hash when goto throws', async () => {
		const job = await createHostJob(project(), ['a'], APP);
		const hash = fragmentOf(job.links[0]);
		const loc = stubLocation(hash);
		gotoMock.mockRejectedValue(new Error('no router'));
		const outcome = await consumePairFragment();
		expect(outcome).toEqual({ jobId: job.id });
		expect(loc.hash).toBe('');
	});

	it('merges a second part of the same token into one job', async () => {
		const host = await createHostJob(project(), ['a'], APP);
		const first = fragmentOf(encodeLink(APP, host.token, part(1, 0)));
		const second = fragmentOf(encodeLink(APP, host.token, part(2, 1)));
		stubLocation(first);
		const a = await consumePairFragment();
		stubLocation(second);
		const b = await consumePairFragment();
		expect(a).toEqual({ jobId: host.id });
		expect(b).toEqual({ jobId: host.id });
		const stored = (await getJob(host.id)) as CameraJob;
		expect(stored.partsSeen).toEqual([1, 2]);
		expect(stored.rooms.map((r) => r.index)).toEqual([0, 1]);
		expect(await db.mirrorJobs.count()).toBe(1);
	});
});

describe('pairErrorMessage', () => {
	it('gives a distinct non-empty text per error', () => {
		const errors: PairError[] = ['format', 'tooLarge', 'invalid', 'expired'];
		const texts = errors.map((e) => pairErrorMessage(e));
		for (const text of texts) expect(text.length).toBeGreaterThan(0);
		expect(new Set(texts).size).toBe(errors.length);
	});
});
