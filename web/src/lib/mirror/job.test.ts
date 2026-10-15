import { deflateSync } from 'fflate';
import { encode } from 'uqr';
import { describe, expect, it } from 'vitest';
import { createElement, createRoom } from '#lib/core/defaults.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import type { Project, Room } from '#lib/core/schema.ts';
import { generateTour } from '#lib/features/photos/tour.ts';
import { createHostJob, encodeLink, JobError, parsePair } from './job.ts';
import { deriveKeys, newToken, toBase64Url } from './token.ts';
import {
	JOB_TTL_MS,
	MAX_ROOMS_PER_JOB,
	QR_MAX_VERSION,
	type JobPayload,
	type MirrorRoom
} from './types.ts';

const APP = 'https://xc4pr.github.io/roomx/';
const NOW = 1_800_000_000_000;

function room(id: string, name = id, elementCount = 3): Room {
	const r = createRoom(id, name);
	const ids = sequentialIds(id);
	const kinds = ['door', 'window', 'socket', 'switch', 'builtin'] as const;
	let seed = id.length * 7919 + (id.codePointAt(id.length - 1) ?? 1);
	const next = (max: number) => {
		seed = (seed * 1103515245 + 12345) % 2147483648;
		return seed % max;
	};
	r.polygon = [
		{ x: 0, y: 0 },
		{ x: 3000 + next(3000), y: next(300) },
		{ x: 3000 + next(3000), y: 2000 + next(3000) },
		{ x: next(2000), y: 2500 + next(2500) }
	];
	r.elements = Array.from({ length: elementCount }, (_, i) => {
		const element = createElement(kinds[i % kinds.length], r, (i % 4) + 1, 400 + i * 300, ids);
		return element.kind === 'ceilingLamp' ? element : { ...element, offset: next(2500) };
	});
	return r;
}

function project(rooms: Room[]): Project {
	return {
		id: 'p1',
		name: 'Wohnung Müller',
		schemaVersion: 1,
		rev: 0,
		createdAt: '',
		updatedAt: '',
		rooms,
		variants: []
	} as Project;
}

function frag(link: string): string {
	return link.slice(link.indexOf('#'));
}

function version(link: string): number {
	return encode(link, { ecc: 'L' }).version;
}

function payload(over: Partial<JobPayload> = {}): JobPayload {
	return {
		v: 1,
		project: 'P',
		lang: 'en',
		expiresAt: NOW + 1000,
		part: 1,
		parts: 1,
		rooms: [],
		...over
	};
}

function mirror(index = 0): MirrorRoom {
	return {
		index,
		name: 'Küche',
		polygon: [
			{ x: 0, y: 0 },
			{ x: 4000, y: 0 },
			{ x: 4000, y: 3000 }
		],
		height: 2500,
		elements: [{ kind: 'door', wall: 1, offset: 100, width: 800 }],
		done: ['floor']
	};
}

function fragment(token: string, wire: unknown): string {
	const body = toBase64Url(deflateSync(new TextEncoder().encode(JSON.stringify(wire))));
	return `#pair=${token}.${body}`;
}

describe('createHostJob', () => {
	it('builds a job in the given order with ordered element ids', async () => {
		const a = room('a', 'Alpha');
		const b = room('b', 'Beta');
		const ceiling = createElement('ceilingLamp', b, 1, 0, sequentialIds('c'));
		b.elements.push(ceiling, createElement('radiator', b, 2, 800, sequentialIds('rad')));
		const job = await createHostJob(project([a, b]), ['b', 'a'], APP, NOW);
		const keys = await deriveKeys(job.token);
		expect(job.id).toBe(keys.jobId);
		expect(job.role).toBe('host');
		expect(job.projectId).toBe('p1');
		expect(job.createdAt).toBe(NOW);
		expect(job.expiresAt).toBe(NOW + JOB_TTL_MS);
		expect(job.received).toEqual([]);
		expect(job.rooms.map((r) => [r.index, r.roomId])).toEqual([
			[0, 'b'],
			[1, 'a']
		]);
		expect(job.rooms[0].elementIds).toEqual(['b-1', 'b-2', 'b-3']);
		expect(job.links).toHaveLength(1);
		const parsed = parsePair(frag(job.links[0]), NOW);
		if (!parsed.ok) throw new Error(parsed.error);
		expect(parsed.token).toBe(job.token);
		expect(parsed.payload.project).toBe('Wohnung Müller');
		expect(parsed.payload.lang).toBe('de');
		expect(parsed.payload.rooms.map((r) => r.name)).toEqual(['Beta', 'Alpha']);
		expect(parsed.payload.rooms[0].elements.map((e) => e.kind)).toEqual([
			'door',
			'window',
			'socket'
		]);
	});

	it('marks steps that already have photos, in phone form', async () => {
		const r = room('a');
		const steps = generateTour(r);
		const element = steps.find((s) => s.key.startsWith('element:'))!;
		r.photos = [
			{
				id: 'ph',
				hash: '0'.repeat(64),
				perspective: { kind: 'element', stepKey: element.key, caption: { de: '', en: '' } },
				w: 1,
				h: 1,
				takenAt: ''
			},
			{
				id: 'ph2',
				hash: '1'.repeat(64),
				perspective: { kind: 'floor', stepKey: 'floor', caption: { de: '', en: '' } },
				w: 1,
				h: 1,
				takenAt: ''
			},
			{
				id: 'ph3',
				hash: '2'.repeat(64),
				perspective: { kind: 'free', stepKey: 'element:gone', caption: { de: '', en: '' } },
				w: 1,
				h: 1,
				takenAt: ''
			}
		];
		const job = await createHostJob(project([r]), ['a'], APP, NOW);
		const parsed = parsePair(frag(job.links[0]), NOW);
		if (!parsed.ok) throw new Error(parsed.error);
		expect([...parsed.payload.rooms[0].done].sort()).toEqual(['element:e0', 'floor']);
	});

	it('carries the server flag in the link and omits it otherwise', async () => {
		const p = project([room('a')]);
		const plain = await createHostJob(p, ['a'], APP, NOW);
		const served = await createHostJob(p, ['a'], APP, NOW, { server: true });
		expect(plain.server).toBeUndefined();
		expect(served.server).toBe(true);
		const parsedPlain = parsePair(frag(plain.links[0]), NOW);
		const parsedServed = parsePair(frag(served.links[0]), NOW);
		if (!parsedPlain.ok || !parsedServed.ok) throw new Error('parse');
		expect(parsedPlain.payload.server).toBeUndefined();
		expect(parsedServed.payload.server).toBe(true);
	});

	it('uses a fresh token every time', async () => {
		const p = project([room('a')]);
		const [x, y] = await Promise.all([
			createHostJob(p, ['a'], APP, NOW),
			createHostJob(p, ['a'], APP, NOW)
		]);
		expect(x.token).not.toBe(y.token);
		expect(x.id).not.toBe(y.id);
	});

	it('splits many rooms into QR sized parts with the same token', async () => {
		const rooms = Array.from({ length: 30 }, (_, i) => room(`r${i}`, `Zimmer Nummer ${i}`, 12));
		const job = await createHostJob(
			project(rooms),
			rooms.map((r) => r.id),
			APP,
			NOW
		);
		expect(job.links.length).toBeGreaterThan(1);
		const indexes: number[] = [];
		job.links.forEach((link, i) => {
			expect(version(link)).toBeLessThanOrEqual(QR_MAX_VERSION);
			const parsed = parsePair(frag(link), NOW);
			if (!parsed.ok) throw new Error(parsed.error);
			expect(parsed.token).toBe(job.token);
			expect(parsed.payload.part).toBe(i + 1);
			expect(parsed.payload.parts).toBe(job.links.length);
			indexes.push(...parsed.payload.rooms.map((r) => r.index));
		});
		expect(indexes).toEqual(Array.from({ length: 30 }, (_, i) => i));
	});

	it('fits typical furnished rooms per code', async () => {
		const rooms = Array.from({ length: 12 }, (_, i) => room(`r${i}`, `Zimmer ${i}`, 6));
		const job = await createHostJob(
			project(rooms),
			rooms.map((r) => r.id),
			APP,
			NOW
		);
		const first = parsePair(frag(job.links[0]), NOW);
		if (!first.ok) throw new Error(first.error);
		expect(first.payload.rooms.length).toBeGreaterThanOrEqual(3);
	});

	it('reports errors', async () => {
		const p = project([room('a')]);
		await expect(createHostJob(p, [], APP, NOW)).rejects.toMatchObject({ code: 'noRooms' });
		await expect(createHostJob(p, ['zz'], APP, NOW)).rejects.toBeInstanceOf(JobError);
		const many = Array.from({ length: MAX_ROOMS_PER_JOB + 1 }, () => 'a');
		await expect(createHostJob(p, many, APP, NOW)).rejects.toMatchObject({
			code: 'tooManyRooms'
		});
		const huge = room('h', 'Riesig');
		huge.polygon = Array.from({ length: 400 }, (_, i) => ({
			x: Math.round(100000 * Math.cos(i) * (1 + (i % 7) / 3)),
			y: Math.round(100000 * Math.sin(i * 1.7) * (1 + (i % 5) / 3))
		}));
		huge.elements = [];
		await expect(createHostJob(project([huge]), ['h'], APP, NOW)).rejects.toMatchObject({
			code: 'roomTooLarge'
		});
	});
});

describe('parsePair', () => {
	const token = newToken();

	it('round trips a payload with or without #', () => {
		const original = payload({ rooms: [mirror(0), mirror(3)], part: 2, parts: 3 });
		const link = encodeLink(APP, token, original);
		const hash = link.slice(link.indexOf('#'));
		for (const text of [hash, hash.slice(1)]) {
			expect(parsePair(text, NOW)).toEqual({ ok: true, token, payload: original });
		}
	});

	it('reports expired', () => {
		const link = encodeLink(APP, token, payload({ expiresAt: NOW }));
		expect(parsePair(link.slice(link.indexOf('#')), NOW)).toEqual({
			ok: false,
			error: 'expired'
		});
	});

	it('reports format errors', () => {
		const good = encodeLink(APP, token, payload()).split('#')[1];
		expect(parsePair('', NOW)).toEqual({ ok: false, error: 'format' });
		expect(parsePair('pair=short.abc', NOW)).toEqual({ ok: false, error: 'format' });
		expect(parsePair(good.replace(token, token.slice(1) + '!'), NOW)).toEqual({
			ok: false,
			error: 'format'
		});
		expect(parsePair(`pair=${token}`, NOW)).toEqual({ ok: false, error: 'format' });
		expect(parsePair(`pair=${token}.%%%`, NOW)).toEqual({ ok: false, error: 'format' });
		expect(parsePair(`pair=${token}.AAAA`, NOW)).toEqual({ ok: false, error: 'format' });
		expect(parsePair(good + '.x', NOW)).toEqual({ ok: false, error: 'format' });
	});

	it('rejects a long fragment', () => {
		expect(parsePair(`pair=${token}.${'A'.repeat(4000)}`, NOW)).toEqual({
			ok: false,
			error: 'tooLarge'
		});
	});

	it('rejects a deflate bomb', () => {
		const bomb = deflateSync(new Uint8Array(2_500_000), { level: 9 });
		expect(bomb.length).toBeLessThan(3000);
		const result = parsePair(`#pair=${token}.${toBase64Url(bomb)}`, NOW);
		expect(result).toEqual({ ok: false, error: 'tooLarge' });
	});

	it('validates strictly', () => {
		const wire = (over: Record<string, unknown> = {}, room: unknown[] = []) => ({
			v: 1,
			p: 'P',
			l: 'd',
			x: NOW + 1,
			n: 1,
			m: 1,
			r: [[0, 'N', [0, 0, 10, 0, 10, 10], 2500, [], [], ...room].slice(0, 6)],
			...over
		});
		const ok = (w: unknown) => parsePair(fragment(token, w), NOW).ok;
		expect(ok(wire())).toBe(true);
		expect(ok(wire({ v: 2 }))).toBe(false);
		expect(ok(wire({ extra: 1 }))).toBe(false);
		expect(ok(wire({ l: 'x' }))).toBe(false);
		expect(ok(wire({ n: 2 }))).toBe(false);
		expect(ok(wire({ m: 51, n: 1 }))).toBe(false);
		expect(ok(wire({ p: 'x'.repeat(201) }))).toBe(false);
		const withRoom = (r: unknown[]) => wire({ r: [r] });
		const base = (): unknown[] => [0, 'N', [0, 0, 10, 0, 10, 10], 2500, [], []];
		const set = (i: number, v: unknown) => {
			const r = base();
			r[i] = v;
			return withRoom(r);
		};
		expect(ok(set(0, MAX_ROOMS_PER_JOB))).toBe(false);
		expect(ok(set(0, -1))).toBe(false);
		expect(ok(set(1, 'n'.repeat(201)))).toBe(false);
		expect(ok(set(2, [0, 0, 10, 0]))).toBe(false);
		expect(ok(set(2, [0, 0, 10, 0, 10, 10.5]))).toBe(false);
		expect(ok(set(2, [0, 0, 10, 0, 10, 1_000_001]))).toBe(false);
		expect(ok(set(2, [0, 0, 10, 0, 10, -1_000_000]))).toBe(true);
		expect(ok(set(2, new Array(1002).fill(1)))).toBe(false);
		expect(ok(set(2, [0, 0, 10, 0, 10]))).toBe(false);
		expect(ok(set(3, 0))).toBe(false);
		expect(ok(set(4, [[0, 3, 0, 100]]))).toBe(true);
		expect(ok(set(4, [[0, 4, 0, 100]]))).toBe(false);
		expect(ok(set(4, [[0, 0, 0, 100]]))).toBe(false);
		expect(ok(set(4, [[99, 1, 0, 100]]))).toBe(false);
		expect(ok(set(4, [[0, 1, 0, 0]]))).toBe(false);
		expect(
			ok(
				set(
					4,
					Array.from({ length: 201 }, () => [0, 1, 0, 100])
				)
			)
		).toBe(false);
		expect(ok(set(5, [1]))).toBe(false);
	});
});
