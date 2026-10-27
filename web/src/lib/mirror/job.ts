import { deflateSync, Inflate } from 'fflate';
import { encode } from 'uqr';
import { z } from 'zod';
import {
	ELEMENT_KINDS,
	isElectrical,
	isOpenAir,
	isWallElement,
	type Project,
	type Room
} from '#lib/core/schema.ts';
import { elementFitsRoom } from '#lib/core/elements.ts';
import { generateTour } from '#lib/features/photos/tour.ts';
import { locale } from '#lib/i18n/index.svelte.ts';
import { LIMITS } from '#lib/security/limits.ts';
import { toPhoneStepKey } from './room.ts';
import { fromBase64Url, isToken, newToken, toBase64Url, deriveKeys } from './token.ts';
import {
	JOB_TTL_MS,
	MAX_ELEMENTS_PER_MIRROR_ROOM,
	MAX_ROOMS_PER_JOB,
	QR_MAX_VERSION,
	type HostJob,
	type JobPayload,
	type MirrorElement,
	type MirrorRoom
} from './types.ts';

export type JobErrorCode = 'noRooms' | 'tooManyRooms' | 'roomTooLarge';

export class JobError extends Error {
	readonly code: JobErrorCode;
	constructor(code: JobErrorCode) {
		super(code);
		this.code = code;
	}
}

const MAX_FRAGMENT = 4000;
const MAX_INFLATED = 64 * 1024;
const MAX_COORDINATE = 1_000_000;
const MAX_PARTS = 50;
const MAX_DONE = 2000;
const PREFIX = 'pair=';
const OPEN_AIR_MARK = '~openAir';
const PAIR_CLOCK_SLACK_MS = 24 * 60 * 60 * 1000;

type WireElement = [kind: number, wall: number, offset: number, width: number];
type WireRoom = [
	index: number,
	name: string,
	polygon: number[],
	height: number,
	elements: WireElement[],
	done: string[]
];
interface Wire {
	v: 1;
	p: string;
	l: 'd' | 'e';
	s?: 1;
	x: number;
	n: number;
	m: number;
	r: WireRoom[];
}

function clamp(value: number): number {
	return Math.max(-MAX_COORDINATE, Math.min(MAX_COORDINATE, Math.round(value)));
}

function toWire(payload: JobPayload): Wire {
	return {
		v: 1,
		p: payload.project,
		l: payload.lang === 'de' ? 'd' : 'e',
		...(payload.server ? { s: 1 as const } : {}),
		x: payload.expiresAt,
		n: payload.part,
		m: payload.parts,
		r: payload.rooms.map((room) => [
			room.index,
			room.name,
			room.polygon.flatMap((point) => [point.x, point.y]),
			room.height,
			room.elements.map((element): WireElement => [
				ELEMENT_KINDS.indexOf(element.kind),
				element.wall,
				element.offset,
				element.width
			]),
			room.openAir ? [...room.done, OPEN_AIR_MARK] : room.done
		])
	};
}

const coordinate = z.number().int().min(-MAX_COORDINATE).max(MAX_COORDINATE);

const WireRoomSchema = z
	.tuple([
		z.number().int().min(0).lt(MAX_ROOMS_PER_JOB),
		z.string().max(LIMITS.name),
		z
			.array(coordinate)
			.min(6)
			.max(LIMITS.polygonPoints * 2),
		z.number().int().min(1).max(MAX_COORDINATE),
		z
			.array(
				z.tuple([
					z.number().int().min(0).lt(ELEMENT_KINDS.length),
					z.number().int().min(1).max(LIMITS.polygonPoints),
					coordinate,
					z.number().int().min(1).max(MAX_COORDINATE)
				])
			)
			.max(MAX_ELEMENTS_PER_MIRROR_ROOM),
		z.array(z.string().max(LIMITS.label)).max(MAX_DONE)
	])
	.refine(([, , polygon, , elements]) => elements.every(([, wall]) => wall <= polygon.length / 2))
	.refine(([, , polygon]) => polygon.length % 2 === 0);

const WireSchema = z
	.strictObject({
		v: z.literal(1),
		p: z.string().max(LIMITS.name),
		l: z.enum(['d', 'e']),
		s: z.literal(1).optional(),
		x: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
		n: z.number().int().min(1),
		m: z.number().int().min(1).max(MAX_PARTS),
		r: z.array(WireRoomSchema).max(MAX_ROOMS_PER_JOB)
	})
	.refine((wire) => wire.n <= wire.m);

function fromWire(wire: z.infer<typeof WireSchema>): JobPayload {
	return {
		v: 1,
		project: wire.p,
		lang: wire.l === 'd' ? 'de' : 'en',
		expiresAt: wire.x,
		...(wire.s ? { server: true } : {}),
		part: wire.n,
		parts: wire.m,
		rooms: wire.r.map(([index, name, polygon, height, elements, done]) => ({
			index,
			name,
			polygon: Array.from({ length: polygon.length / 2 }, (_, i) => ({
				x: polygon[i * 2],
				y: polygon[i * 2 + 1]
			})),
			height,
			elements: elements.map(([kind, wall, offset, width]): MirrorElement => ({
				kind: ELEMENT_KINDS[kind],
				wall,
				offset,
				width
			})),
			done: done.filter((key) => key !== OPEN_AIR_MARK),
			...(done.includes(OPEN_AIR_MARK) ? { openAir: true } : {})
		}))
	};
}

export function encodeLink(appUrl: string, token: string, payload: JobPayload): string {
	const json = new TextEncoder().encode(JSON.stringify(toWire(payload)));
	return `${appUrl}#${PREFIX}${token}.${toBase64Url(deflateSync(json, { level: 9 }))}`;
}

function qrVersion(link: string): number {
	try {
		return encode(link, { ecc: 'L' }).version;
	} catch {
		return Infinity;
	}
}

function mirrorRoom(room: Room, index: number): { mirror: MirrorRoom; elementIds: string[] } {
	const wallCount = room.polygon.length;
	const kept = room.elements
		.filter(isWallElement)
		.filter((element) => elementFitsRoom(room, element))
		.filter(
			(element) =>
				(element.kind === 'door' ||
					element.kind === 'window' ||
					element.kind === 'builtin' ||
					isElectrical(element)) &&
				element.wall >= 1 &&
				element.wall <= wallCount &&
				element.width >= 1
		)
		.slice(0, MAX_ELEMENTS_PER_MIRROR_ROOM);
	const elementIds = kept.map((element) => element.id);
	const tourKeys = new Set(generateTour(room).map((step) => step.key));
	const done = new Set<string>();
	for (const photo of room.photos) {
		const key = photo.perspective.stepKey;
		if (key !== undefined && tourKeys.has(key)) done.add(toPhoneStepKey(key, elementIds));
	}
	return {
		elementIds,
		mirror: {
			index,
			name: room.name,
			polygon: room.polygon.map((point) => ({ x: clamp(point.x), y: clamp(point.y) })),
			height: Math.max(1, clamp(room.height)),
			elements: kept.map((element) => ({
				kind: element.kind,
				wall: element.wall,
				offset: clamp(element.offset),
				width: Math.max(1, clamp(element.width))
			})),
			done: [...done],
			...(isOpenAir(room) ? { openAir: true } : {})
		}
	};
}

export async function createHostJob(
	project: Project,
	roomIds: string[],
	appUrl: string,
	now: number = Date.now(),
	options: { server?: boolean } = {}
): Promise<HostJob> {
	if (roomIds.length === 0) throw new JobError('noRooms');
	if (roomIds.length > MAX_ROOMS_PER_JOB) throw new JobError('tooManyRooms');
	const chosen = roomIds
		.map((id) => project.rooms.find((room) => room.id === id))
		.filter((room): room is Room => room !== undefined);
	if (chosen.length === 0) throw new JobError('noRooms');
	const token = newToken();
	const keys = await deriveKeys(token);
	const built = chosen.map((room, index) => mirrorRoom(room, index));
	const expiresAt = now + JOB_TTL_MS;
	const lang = locale.language;
	const draft = (rooms: MirrorRoom[]): JobPayload => ({
		v: 1,
		project: project.name,
		lang,
		expiresAt,
		...(options.server ? { server: true } : {}),
		part: MAX_PARTS,
		parts: MAX_PARTS,
		rooms
	});
	const fits = (rooms: MirrorRoom[]) =>
		qrVersion(encodeLink(appUrl, token, draft(rooms))) <= QR_MAX_VERSION;

	const groups: MirrorRoom[][] = [];
	let current: MirrorRoom[] = [];
	for (const { mirror } of built) {
		if (fits([...current, mirror])) {
			current.push(mirror);
			continue;
		}
		if (current.length === 0) throw new JobError('roomTooLarge');
		groups.push(current);
		current = [mirror];
		if (!fits(current)) throw new JobError('roomTooLarge');
	}
	groups.push(current);

	const links = groups.map((rooms, i) =>
		encodeLink(appUrl, token, {
			...draft(rooms),
			part: i + 1,
			parts: groups.length
		})
	);
	return {
		id: keys.jobId,
		role: 'host',
		projectId: project.id,
		token,
		createdAt: now,
		expiresAt,
		rooms: built.map(({ elementIds }, index) => ({
			index,
			roomId: chosen[index].id,
			elementIds,
			corners: chosen[index].polygon.length
		})),
		links,
		received: [],
		...(options.server ? { server: true } : {})
	};
}

export type PairError = 'format' | 'tooLarge' | 'invalid' | 'expired';

export type PairResult =
	{ ok: true; token: string; payload: JobPayload } | { ok: false; error: PairError };

class TooLarge extends Error {}

function inflateLimited(data: Uint8Array): Uint8Array {
	const chunks: Uint8Array[] = [];
	let total = 0;
	const inflate = new Inflate((chunk) => {
		total += chunk.length;
		if (total > MAX_INFLATED) throw new TooLarge();
		chunks.push(chunk);
	});
	for (let i = 0; i < data.length; i++) {
		inflate.push(data.subarray(i, i + 1), i === data.length - 1);
	}
	const out = new Uint8Array(total);
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
}

export function parsePair(fragment: string, now: number = Date.now()): PairResult {
	const text = fragment.startsWith('#') ? fragment.slice(1) : fragment;
	if (text.length > MAX_FRAGMENT) return { ok: false, error: 'tooLarge' };
	if (!text.startsWith(PREFIX)) return { ok: false, error: 'format' };
	const [token, body, ...rest] = text.slice(PREFIX.length).split('.');
	if (rest.length > 0 || body === undefined || !isToken(token)) {
		return { ok: false, error: 'format' };
	}
	const compressed = fromBase64Url(body);
	if (!compressed || compressed.length === 0) return { ok: false, error: 'format' };
	let json: string;
	try {
		json = new TextDecoder('utf-8', { fatal: true }).decode(inflateLimited(compressed));
	} catch (error) {
		return { ok: false, error: error instanceof TooLarge ? 'tooLarge' : 'format' };
	}
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		return { ok: false, error: 'format' };
	}
	const parsed = WireSchema.safeParse(raw);
	if (!parsed.success) return { ok: false, error: 'invalid' };
	const payload = fromWire(parsed.data);
	if (payload.expiresAt <= now) return { ok: false, error: 'expired' };
	// A job never runs longer than JOB_TTL_MS; a day of slack covers clocks that differ.
	if (payload.expiresAt > now + JOB_TTL_MS + PAIR_CLOCK_SLACK_MS)
		return { ok: false, error: 'invalid' };
	return { ok: true, token, payload };
}
