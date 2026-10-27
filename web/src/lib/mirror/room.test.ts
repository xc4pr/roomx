import { describe, expect, it } from 'vitest';
import { createElement, createRoom, rectanglePolygon } from '#lib/core/defaults.ts';
import { RoomSchema, type Project, type Room, type RoomElement } from '#lib/core/schema.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import { generateTour } from '#lib/features/photos/tour.ts';
import { createHostJob, parsePair } from './job.ts';
import type { MirrorRoom } from './types.ts';
import { perspectiveFor, roomFromMirror, toHostStepKey, toPhoneStepKey } from './room.ts';

function furnished(): Room {
	const room = createRoom('r1', 'Wohnzimmer');
	const ids = sequentialIds('el');
	room.elements = [
		createElement('socket', room, 1, 700, ids),
		createElement('door', room, 1, 2500, ids),
		createElement('socket', room, 1, 1000, ids),
		createElement('ceilingLamp', room, 1, 0, ids),
		createElement('window', room, 2, 1500, ids),
		createElement('radiator', room, 2, 500, ids),
		createElement('builtin', room, 3, 1500, ids),
		createElement('switch', room, 1, 3300, ids)
	];
	return room;
}

async function mirrorRoomOf(
	room: Room = furnished()
): Promise<{ room: Room; mirror: MirrorRoom; elementIds: string[] }> {
	const project = {
		id: 'p',
		name: 'P',
		schemaVersion: 2,
		rev: 0,
		createdAt: '',
		updatedAt: '',
		rooms: [room],
		variants: []
	} as Project;
	const job = await createHostJob(project, [room.id], 'https://example.test/');
	const parsed = parsePair(job.links[0].slice(job.links[0].indexOf('#')));
	if (!parsed.ok) throw new Error(parsed.error);
	return { room, mirror: parsed.payload.rooms[0], elementIds: job.rooms[0].elementIds };
}

describe('roomFromMirror', () => {
	it('open-air room: phone tour asks for no walls, corners or ceiling and sends no wall elements', async () => {
		const terrace = furnished();
		terrace.type = 'terrace';
		const { mirror } = await mirrorRoomOf(terrace);
		expect(mirror.openAir).toBe(true);
		expect(mirror.elements).toEqual([]);
		expect(mirror.done).not.toContain('~openAir');
		const keys = generateTour(roomFromMirror(mirror)).map((step) => step.key);
		expect(keys.length).toBeGreaterThan(0);
		expect(keys.some((key) => /^(corner|wall|ceiling)/.test(key))).toBe(false);
		expect((await mirrorRoomOf()).mirror.openAir).toBeUndefined();
	});

	it('is schema valid with phone ids', async () => {
		const { mirror, elementIds } = await mirrorRoomOf();
		const phone = roomFromMirror(mirror);
		expect(RoomSchema.safeParse(phone).success).toBe(true);
		expect(phone.elements.map((element) => element.id)).toEqual(
			elementIds.map((_, index) => `e${index}`)
		);
	});

	it('gives the same tour as the original with phone keys', async () => {
		const { room, mirror, elementIds } = await mirrorRoomOf();
		const phone = generateTour(roomFromMirror(mirror)).map((step) => step.key);
		const original = generateTour(room).map((step) => toPhoneStepKey(step.key, elementIds));
		expect(phone).toEqual(original);
		expect(phone.some((key) => key.startsWith('electric:e'))).toBe(true);
		expect(phone.some((key) => key.startsWith('element:e'))).toBe(true);
	});

	it('handles an L-shaped room', async () => {
		const l = createRoom('r', 'L');
		l.polygon = [
			{ x: 0, y: 0 },
			{ x: 4000, y: 0 },
			{ x: 4000, y: 2000 },
			{ x: 2000, y: 2000 },
			{ x: 2000, y: 4000 },
			{ x: 0, y: 4000 }
		];
		const m = await mirrorRoomOf(l);
		expect(generateTour(roomFromMirror(m.mirror)).map((s) => s.key)).toEqual(
			generateTour(l).map((s) => s.key)
		);
	});
});

describe('step keys', () => {
	const ids = ['a', 'b', 'c'];

	it('translates element and electric keys both ways', () => {
		expect(toPhoneStepKey('element:c', ids)).toBe('element:e2');
		expect(toPhoneStepKey('electric:a', ids)).toBe('electric:e0');
		expect(toHostStepKey('element:e2', ids)).toBe('element:c');
		expect(toHostStepKey('electric:e0', ids)).toBe('electric:a');
	});

	it('leaves other keys alone and rejects unknown indexes', () => {
		expect(toPhoneStepKey('corner:A', ids)).toBe('corner:A');
		expect(toHostStepKey('wall:2', ids)).toBe('wall:2');
		expect(toHostStepKey('element:e3', ids)).toBeNull();
		expect(toHostStepKey('element:x', ids)).toBeNull();
	});
});

describe('perspectiveFor', () => {
	const room: Room = createRoom('r', 'R');
	room.polygon = rectanglePolygon(4000, 3000);
	const ids = sequentialIds('e');
	const door: RoomElement = createElement('door', room, 1, 2000, ids);
	room.elements = [door];

	it('uses the tour perspective when the step exists', () => {
		const perspective = perspectiveFor(room, `element:${door.id}`);
		expect(perspective.kind).toBe('element');
		expect(perspective.caption.de).not.toBe('Foto vom Handy');
		expect(perspectiveFor(room, 'ceiling').kind).toBe('ceiling');
	});

	it('falls back to a generic perspective', () => {
		expect(perspectiveFor(room, 'element:gone')).toEqual({
			kind: 'element',
			stepKey: 'element:gone',
			caption: { de: 'Foto vom Handy', en: 'Photo from phone' }
		});
		expect(perspectiveFor(room, 'electric:gone').kind).toBe('element');
		expect(perspectiveFor(room, 'corner:Z').kind).toBe('corner');
		expect(perspectiveFor(room, 'wall:99').kind).toBe('wall');
		expect(perspectiveFor(room, 'whatever').kind).toBe('free');
	});
});
