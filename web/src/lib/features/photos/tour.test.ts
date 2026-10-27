import { describe, expect, it } from 'vitest';
import { cornerLabel, dot, length, pointInPolygon, sub, walls } from '#lib/core/geometry.ts';
import { lRoom, rectangleRoom } from '#lib/core/fixtures.ts';
import { createElement } from '#lib/core/defaults.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import type { Photo, Room } from '#lib/core/schema.ts';
import { generateTour, tourProgress } from './tour.ts';

function photo(stepKey: string | undefined, id = stepKey ?? 'free'): Photo {
	return {
		id,
		hash: 'a'.repeat(64),
		perspective: { kind: 'free', stepKey, caption: { de: 'x', en: 'x' } },
		w: 10,
		h: 10,
		takenAt: '2026-01-01T00:00:00.000Z'
	};
}

const required = (room: Room) => generateTour(room).filter((step) => !step.optional);

describe('generateTour rectangle', () => {
	const room = rectangleRoom();
	const steps = generateTour(room);

	it('has 10 required steps', () => {
		expect(required(room).map((s) => s.key)).toEqual([
			'corner:A',
			'corner:B',
			'corner:C',
			'corner:D',
			'wall:1',
			'wall:2',
			'wall:3',
			'wall:4',
			'ceiling',
			'floor'
		]);
	});

	it('uses unique keys equal to the stepKey', () => {
		expect(new Set(steps.map((s) => s.key)).size).toBe(steps.length);
		for (const step of steps) expect(step.perspective.stepKey).toBe(step.key);
	});

	it('keeps all positions inside with unit directions', () => {
		for (const step of steps) {
			expect(pointInPolygon(step.position, room.polygon, 1)).toBe(true);
			expect(length(step.direction)).toBeCloseTo(1, 6);
		}
	});

	it('looks along the bisector from corners and names the far corner', () => {
		const b = steps.find((s) => s.key === 'corner:B');
		expect(b?.direction.x).toBeCloseTo(-Math.SQRT1_2, 6);
		expect(b?.direction.y).toBeCloseTo(Math.SQRT1_2, 6);
		expect(b?.perspective.caption).toEqual({
			de: 'Ecke B, Blick Richtung D',
			en: 'Corner B, looking towards D'
		});
		expect(steps.find((s) => s.key === 'corner:A')?.perspective.caption.de).toBe(
			'Ecke A, Blick Richtung C'
		);
	});

	it('faces walls against the inward normal from the far side', () => {
		const wallList = walls(room.polygon);
		for (const wall of wallList) {
			const step = steps.find((s) => s.key === `wall:${wall.number}`);
			expect(step).toBeDefined();
			if (!step) continue;
			expect(dot(step.direction, wall.inward)).toBeCloseTo(-1, 6);
			const back = sub(step.position, wall.start);
			const depth = dot(back, wall.inward);
			const space = wall.number % 2 === 1 ? 3000 : 4000;
			expect(depth).toBeCloseTo(space - 300, 3);
			expect(step.perspective.caption.de).toBe(`Wand ${wall.number} frontal`);
		}
	});

	it('adds optional detail steps for elements', () => {
		const optional = steps.filter((s) => s.optional).map((s) => s.key);
		expect(optional).toEqual(['element:door-1', 'electric:socket-1', 'element:window-1']);
		const window = steps.find((s) => s.key === 'element:window-1');
		expect(window?.perspective).toMatchObject({ kind: 'element', ref: 'window-1' });
		expect(window?.perspective.caption).toEqual({ de: 'Fenster, Wand 3', en: 'Window, wall 3' });
		expect(steps.find((s) => s.key === 'electric:socket-1')?.perspective.caption.en).toBe(
			'Electrical, wall 2'
		);
	});

	it('does not change keys when only dimensions change', () => {
		const wide = rectangleRoom('room-rect', 5200, 3300);
		expect(generateTour(wide).map((s) => s.key)).toEqual(steps.map((s) => s.key));
	});
});

describe('generateTour L room', () => {
	const room = lRoom();
	const steps = generateTour(room);

	it('has 5 convex corners, one reflex corner with 2 photos, 6 walls, ceiling and floor', () => {
		const keys = required(room).map((s) => s.key);
		const corners = keys.filter((k) => k.startsWith('corner:'));
		expect(corners).toHaveLength(7);
		expect(keys.filter((k) => /^corner:[A-Z]:[12]$/.test(k))).toHaveLength(2);
		expect(keys.filter((k) => k.startsWith('wall:'))).toHaveLength(6);
		expect(keys).toHaveLength(15);
	});

	it('keeps every camera position inside the room', () => {
		for (const step of steps) {
			expect(pointInPolygon(step.position, room.polygon, 1)).toBe(true);
			expect(length(step.direction)).toBeCloseTo(1, 6);
		}
	});

	it('shoots the reflex corner along both adjacent walls', () => {
		const wallList = walls(room.polygon);
		const reflex = steps.filter((s) => /^corner:[A-Z]:[12]$/.test(s.key));
		const index = reflex[0].perspective.ref ? reflex[0].perspective.ref.charCodeAt(0) - 65 : -1;
		const incoming = wallList[(index - 1 + wallList.length) % wallList.length];
		const outgoing = wallList[index];
		expect(dot(reflex[0].direction, incoming.direction)).toBeCloseTo(-1, 6);
		expect(dot(reflex[1].direction, outgoing.direction)).toBeCloseTo(1, 6);
		expect(reflex[0].perspective.caption.en).toContain(`wall ${incoming.number}`);
		expect(cornerLabel(index)).toBe(reflex[0].perspective.ref);
	});
});

describe('optional electric groups', () => {
	it('groups nearby electrical elements on the same wall', () => {
		const room = rectangleRoom();
		const base = {
			status: 'existing' as const,
			wall: 2,
			width: 160,
			height: 80,
			elevation: 260,
			gang: 1,
			usb: false
		};
		room.elements = [
			{ ...base, id: 's1', kind: 'socket', offset: 300 },
			{ ...base, id: 's2', kind: 'socket', offset: 700 },
			{ ...base, id: 's3', kind: 'socket', offset: 2400 }
		];
		const electric = generateTour(room).filter((s) => s.key.startsWith('electric:'));
		expect(electric.map((s) => s.key)).toEqual(['electric:s1', 'electric:s3']);
		expect(electric.every((s) => s.optional)).toBe(true);
		for (const step of electric) expect(pointInPolygon(step.position, room.polygon, 1)).toBe(true);
	});
});

describe('tourProgress', () => {
	it('counts required steps that have a photo', () => {
		const room = rectangleRoom();
		expect(tourProgress(room)).toEqual({ done: 0, total: 10 });
		room.photos = [
			photo('corner:A'),
			photo('wall:1'),
			photo('wall:1', 'again'),
			photo('element:window-1'),
			photo(undefined)
		];
		expect(tourProgress(room)).toEqual({ done: 2, total: 10 });
	});
});

describe('generateTour with fixtures', () => {
	it('adds optional steps for bathroom fixtures and a stove that look at them from the front', () => {
		const room = { ...rectangleRoom(), elements: [] as Room['elements'] };
		const ids = sequentialIds('x');
		room.elements = [
			createElement('toilet', room, 1, 1000, ids),
			createElement('stove', room, 3, 2000, ids),
			createElement('socket', room, 2, 1500, ids)
		];
		const steps = generateTour(room);
		const toilet = steps.find((step) => step.key === `element:${room.elements[0].id}`)!;
		const stove = steps.find((step) => step.key === `element:${room.elements[1].id}`)!;
		expect(toilet.optional).toBe(true);
		expect(stove.perspective.caption.de).toBe('Kaminofen');
		expect(stove.direction.y).toBeCloseTo(1, 6);
		expect(pointInPolygon(stove.position, room.polygon)).toBe(true);
		expect(steps.some((step) => step.key === `element:${room.elements[2].id}`)).toBe(false);
	});

	it('adds optional steps for a roof window, a floor air conditioner and a free obstacle', () => {
		const room: Room = {
			...rectangleRoom(),
			elements: [],
			slopes: [{ id: 's1', wall: 1, kneeHeight: 1000, angle: 45 }]
		};
		const ids = sequentialIds('y');
		room.elements = [
			createElement('roofWindow', room, 1, 1000, ids),
			createElement('acFloor', room, 3, 2000, ids),
			createElement('freeObstacle', room, 2, 1500, ids)
		];
		const steps = generateTour(room);
		for (const element of room.elements) {
			const step = steps.find((candidate) => candidate.key === `element:${element.id}`);
			expect(step?.optional, element.kind).toBe(true);
			expect(pointInPolygon(step!.position, room.polygon), element.kind).toBe(true);
		}
		expect(
			steps.find((step) => step.key === `element:${room.elements[0].id}`)!.perspective.caption.en
		).toBe('Roof window, wall 1');
	});
});

describe('generateTour outdoors', () => {
	const base = rectangleRoom('out', 4000, 3000);

	it('has only a floor overview for open-air areas, without wall or corner steps', () => {
		for (const type of ['balcony', 'terrace', 'garden'] as const) {
			const room: Room = { ...base, type };
			expect(generateTour(room).map((s) => s.key)).toEqual(['floor']);
			expect(required(room).map((s) => s.key)).toEqual(['floor']);
		}
	});

	it('keeps free elements but skips wall elements outdoors', () => {
		const ids = sequentialIds('o');
		const room: Room = {
			...base,
			type: 'terrace',
			elements: [
				createElement('window', base, 1, 1000, ids),
				createElement('fireplace', base, 1, 1000, ids)
			]
		};
		expect(generateTour(room).map((s) => s.perspective.kind)).toEqual(['floor', 'element']);
	});

	it('treats a conservatory like a room', () => {
		const room: Room = { ...base, type: 'winterGarden' };
		expect(required(room).map((s) => s.key)).toEqual(required(base).map((s) => s.key));
	});
});
