import { describe, expect, it } from 'vitest';
import { createRoom } from './defaults.ts';
import {
	canDisableFloors,
	checkStairs,
	floorClearHeight,
	floorLevels,
	floorToFloor,
	roomFloorId,
	stairContext,
	stairLayout,
	stairRisers,
	stairwellRailing,
	stairZonesForRoom,
	suggestFloorName
} from './floors.ts';
import { centroid, distance } from './geometry.ts';
import type { Project, Room, Stair } from './schema.ts';

function project(patch: Partial<Project> = {}): Project {
	return {
		id: 'p',
		name: 'Haus',
		schemaVersion: 2,
		rev: 0,
		createdAt: '2026-10-27T00:00:00.000Z',
		updatedAt: '2026-10-27T00:00:00.000Z',
		rooms: [],
		variants: [],
		...patch
	};
}

function room(id: string, floorId: string | undefined, patch: Partial<Room> = {}): Room {
	return { ...createRoom(id, id, 'living'), floorId, ...patch };
}

const stair = (patch: Partial<Stair> = {}): Stair => ({
	id: 'st',
	fromFloorId: 'eg',
	shape: 'straight',
	x: 1000,
	y: 300,
	rotation: 0,
	width: 900,
	turn: 'left',
	...patch
});

const floors = [
	{ id: 'eg', name: 'EG', slabThickness: 300 },
	{ id: 'og', name: '1. OG', slabThickness: 250 }
];

describe('floors', () => {
	it('puts rooms without a known floor on the first floor and stacks the levels', () => {
		const p = project({
			floors,
			rooms: [
				room('a', undefined, { height: 2500 }),
				room('b', 'og', { height: 2400 }),
				room('c', 'gone')
			]
		});
		expect(roomFloorId(p, p.rooms[0])).toBe('eg');
		expect(roomFloorId(p, p.rooms[2])).toBe('eg');
		expect(roomFloorId(project(), p.rooms[1])).toBeUndefined();
		expect(floorClearHeight(p, floors[0])).toBe(2500);
		expect(floorToFloor(p, floors[0])).toBe(2800);
		expect([...floorLevels(p)]).toEqual([
			['eg', 0],
			['og', 2800]
		]);
		expect(floorClearHeight(p, { ...floors[1], height: 2300 })).toBe(2300);
	});

	it('switches off only while at most one floor holds rooms and no stair exists', () => {
		expect(canDisableFloors(project({ floors, rooms: [room('a', 'eg'), room('b', 'eg')] }))).toBe(
			true
		);
		expect(canDisableFloors(project({ floors, rooms: [room('a', 'eg'), room('b', 'og')] }))).toBe(
			false
		);
		expect(canDisableFloors(project({ floors, rooms: [room('a', 'eg')], stairs: [stair()] }))).toBe(
			false
		);
		expect(suggestFloorName(project({ floors }))).toBe('UG');
	});
});

describe('stairs', () => {
	it('derives risers and treads from the floor-to-floor height', () => {
		expect(stairRisers(2800)).toEqual({ count: 16, riser: 175, tread: 280 });
		expect(stairRisers(2700)).toMatchObject({ count: 15, riser: 180, tread: 270 });
		const low = stairRisers(2550);
		expect(low.riser).toBeGreaterThanOrEqual(170);
		expect(low.riser).toBeLessThanOrEqual(180);
		expect(2 * low.riser + low.tread).toBeCloseTo(630, 0);
		expect(stairRisers(2e9).count).toBe(60);
		expect(stairLayout(stair(), 2e9).treads).toHaveLength(59);
	});

	it('lays out a straight flight in board coordinates', () => {
		const layout = stairLayout(stair(), 2800);
		expect(layout.treads).toHaveLength(15);
		expect(layout.treads[0].polygon[0]).toEqual({ x: 550, y: 300 });
		expect(layout.treads.at(-1)!.height).toBe(2625);
		expect(layout.arrival.from.y).toBeCloseTo(300 + 15 * 280, 6);
		const turned = stairLayout(stair({ rotation: 90 }), 2800);
		expect(turned.arrival.from.x).toBeCloseTo(1000 - 15 * 280, 6);
	});

	it('turns an L stair at a landing and a U stair back beside the eye', () => {
		const l = stairLayout(stair({ shape: 'l', turn: 'right' }), 2800);
		expect(l.treads.filter((tread) => tread.landing)).toHaveLength(1);
		expect(l.arrival.from.x).toBeGreaterThan(1450);
		const u = stairLayout(stair({ shape: 'u', turn: 'left' }), 2800);
		expect(u.treads.filter((tread) => tread.landing)).toHaveLength(3);
		expect(
			new Set(u.treads.filter((tread) => tread.landing).map((tread) => tread.height)).size
		).toBe(1);
		expect(u.treads.at(-1)!.height).toBe(2625);
		const arrival = centroid([u.arrival.from, u.arrival.to]);
		expect(arrival.x).toBeCloseTo(1000 - 1000, 6);
		expect(arrival.y).toBeLessThan(300 + 7 * 280);
	});

	it('winds a spiral stair around its centre at the tread on the walking line', () => {
		const layout = stairLayout(stair({ shape: 'spiral', x: 0, y: 0 }), 2800);
		expect(layout.treads).toHaveLength(15);
		for (const tread of layout.treads) {
			for (const p of tread.polygon) expect(distance(p, { x: 0, y: 0 })).toBeLessThanOrEqual(1001);
		}
	});

	it('opens the slab above treads without 2 m headroom and rails it except at the arrival', () => {
		const p = project({
			floors,
			rooms: [
				room('a', 'eg', {
					polygon: [
						{ x: 0, y: 0 },
						{ x: 6000, y: 0 },
						{ x: 6000, y: 6000 },
						{ x: 0, y: 6000 }
					]
				})
			],
			stairs: [stair()]
		});
		const context = stairContext(p, p.stairs![0])!;
		expect(context.opening.every((tread) => tread.height > 500)).toBe(true);
		expect(context.opening).toHaveLength(13);
		const railing = stairwellRailing(context);
		expect(railing).toHaveLength(2 * 13 + 1);
		expect(checkStairs(p)).toEqual([]);
	});

	it('finds too little headroom under a slope of the upper floor', () => {
		const square = [
			{ x: 0, y: 0 },
			{ x: 6000, y: 0 },
			{ x: 6000, y: 6000 },
			{ x: 0, y: 6000 }
		];
		const attic = room('dg', 'og', {
			polygon: square,
			height: 2400,
			slopes: [{ id: 's', wall: 3, kneeHeight: 300, angle: 30 }]
		});
		const p = project({
			floors,
			rooms: [room('a', 'eg', { polygon: square }), attic],
			stairs: [stair()]
		});
		const issues = checkStairs(p);
		expect(issues.map((issue) => issue.code)).toEqual(['stairHeadroom']);
		expect(issues[0].headroom).toBeLessThan(2000);
		const flat = project({ ...p, rooms: [p.rooms[0], { ...attic, slopes: undefined }] });
		expect(checkStairs(flat)).toEqual([]);
	});

	it('reports a stair on the top floor and treads outside every room', () => {
		const p = project({
			floors,
			rooms: [room('a', 'eg')],
			stairs: [stair({ fromFloorId: 'og' }), stair({ id: 'x', x: 9000 })]
		});
		expect(checkStairs(p).map((issue) => [issue.code, issue.stairId])).toEqual([
			['stairNoUpperFloor', 'st'],
			['stairOutsideRooms', 'x']
		]);
	});

	it('gives the stair to the lower room and the stairwell to the upper room as zones', () => {
		const square = [
			{ x: 0, y: 0 },
			{ x: 6000, y: 0 },
			{ x: 6000, y: 6000 },
			{ x: 0, y: 6000 }
		];
		const lower = room('a', 'eg', { polygon: square, boardPos: { x: 0, y: 0, rot: 0 } });
		const upper = room('b', 'og', { polygon: square, boardPos: { x: 500, y: 0, rot: 0 } });
		const p = project({ floors, rooms: [lower, upper], stairs: [stair()] });
		const below = stairZonesForRoom(p, lower);
		const above = stairZonesForRoom(p, upper);
		expect(below).toHaveLength(15);
		expect(below.every((zone) => zone.kind === 'stair')).toBe(true);
		expect(above).toHaveLength(13);
		expect(above[0].shape[0]).toEqual({ x: 550 - 500, y: 300 + 2 * 280 });
	});
});
