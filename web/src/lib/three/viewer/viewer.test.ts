import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { rectangleRoom } from '#lib/core/fixtures.ts';
import { ROOM_TEMPLATES } from '#lib/core/templates.ts';
import { createElement, createRoom } from '#lib/core/defaults.ts';
import { walls as roomWalls } from '#lib/core/geometry.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import { floorSamples, loweredWalls, type CutawayWall } from './cutaway.ts';
import { bestFitPose, fitPose, shapeOfFootprints } from './fit.ts';
import {
	clampedFloorAt,
	floorAt,
	nearestBoundaryPoint,
	roomFrames,
	sceneRooms,
	sharedOpenings,
	worldToRoom
} from './layout.ts';
import {
	approach,
	bestStandPoint,
	buildWalkMap,
	canStandAt,
	moveInside,
	moveOnMap,
	standable,
	stickCurve,
	walkInputs,
	walkStep
} from './walk.ts';

const rectWalls: CutawayWall[] = [
	{ key: '1', center: { x: 2, z: 0 }, outward: { x: 0, z: 1 } },
	{ key: '2', center: { x: 4, z: -1.5 }, outward: { x: 1, z: 0 } },
	{ key: '3', center: { x: 2, z: -3 }, outward: { x: 0, z: -1 } },
	{ key: '4', center: { x: 0, z: -1.5 }, outward: { x: -1, z: 0 } }
];

describe('loweredWalls', () => {
	it('lowers only the wall between camera and room', () => {
		expect([...loweredWalls(rectWalls, { x: 2, z: 6 })]).toEqual(['1']);
		expect([...loweredWalls(rectWalls, { x: 2, z: -9 })]).toEqual(['3']);
		expect([...loweredWalls(rectWalls, { x: 9, z: -1.5 })]).toEqual(['2']);
	});

	it('lowers two walls when the camera looks at a corner', () => {
		expect([...loweredWalls(rectWalls, { x: 7, z: 5 })].sort()).toEqual(['1', '2']);
		expect([...loweredWalls(rectWalls, { x: -4, z: -8 })].sort()).toEqual(['3', '4']);
	});

	it('lowers nothing when the camera is above the room', () => {
		expect(loweredWalls(rectWalls, { x: 2, z: -1.5 }).size).toBe(0);
	});

	it('lowers a wall that crosses the line of sight below its top', () => {
		const walls: CutawayWall[] = [
			{ key: 'elbow', center: { x: 3, z: -2 }, outward: { x: -1, z: 0 }, half: 1, height: 2.5 }
		];
		const camera = { x: 5, y: 4, z: -2 };
		expect([...loweredWalls(walls, camera, 0.05, { x: 1, y: 0.6, z: -2 })]).toEqual(['elbow']);
		expect(loweredWalls(walls, camera, 0.05, { x: 4, y: 0.6, z: -2 }).size).toBe(0);
		expect(loweredWalls(walls, { x: 5, y: 40, z: -2 }, 0.05, { x: 1, y: 0.6, z: -2 }).size).toBe(0);
		expect(loweredWalls(walls, camera, 0.05, { x: 1, y: 0.6, z: -6 }).size).toBe(0);
	});

	it('ignores a camera on the plane of a wall', () => {
		expect(loweredWalls(rectWalls, { x: 2, z: 0.02 }).size).toBe(0);
	});
});

describe('walking', () => {
	const polygon = ROOM_TEMPLATES.l.build(ROOM_TEMPLATES.l.defaults);

	it('stands only inside the polygon with clearance to the walls', () => {
		expect(canStandAt(polygon, { x: 1000, y: 1000 }, 200)).toBe(true);
		expect(canStandAt(polygon, { x: 100, y: 1000 }, 200)).toBe(false);
		expect(canStandAt(polygon, { x: 4000, y: 3000 }, 200)).toBe(false);
	});

	it('slides along a wall instead of passing through it', () => {
		const from = { x: 1000, y: 300 };
		expect(moveInside(polygon, from, { x: 1200, y: 100 }, 200)).toEqual({ x: 1200, y: 300 });
		expect(moveInside(polygon, from, { x: 1000, y: -500 }, 200)).toEqual(from);
		expect(moveInside(polygon, from, { x: 1300, y: 500 }, 200)).toEqual({ x: 1300, y: 500 });
	});

	it('finds a start point with clearance, also in L rooms', () => {
		const point = bestStandPoint(polygon, 220);
		expect(point).toBeDefined();
		expect(canStandAt(polygon, point ?? { x: 0, y: 0 }, 220)).toBe(true);
	});

	it('converts joystick input into a step along the view direction', () => {
		const forward = walkStep(0, { forward: 1, strafe: 0 }, 2, 0.5);
		expect(forward.x).toBeCloseTo(0);
		expect(forward.z).toBeCloseTo(-1);
		const right = walkStep(0, { forward: 0, strafe: 1 }, 2, 0.5);
		expect(right.x).toBeCloseTo(1);
		const diagonal = walkStep(0, { forward: 1, strafe: 1 }, 2, 1);
		expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(2);
		const turned = walkStep(Math.PI / 2, { forward: 1, strafe: 0 }, 1, 1);
		expect(turned.x).toBeCloseTo(-1);
		expect(turned.z).toBeCloseTo(0);
	});
});

describe('layout', () => {
	const project = {
		id: 'p',
		name: 'p',
		schemaVersion: 2 as const,
		rev: 0,
		createdAt: '',
		updatedAt: '',
		rooms: [
			{ ...rectangleRoom('a'), boardPos: { x: 0, y: 0, rot: 0 } },
			{ ...rectangleRoom('b'), boardPos: { x: 6000, y: 0, rot: 0 } }
		],
		variants: []
	};

	it('picks the room under a world point and returns room coordinates in mm', () => {
		const frames = roomFrames({ project, roomIds: ['a', 'b'] });
		expect(floorAt(frames, 1, -1)).toEqual({ roomId: 'a', x: 1000, y: 1000 });
		expect(floorAt(frames, 7.5, -2)).toEqual({ roomId: 'b', x: 1500, y: 2000 });
		expect(floorAt(frames, 5, -1)).toBeNull();
	});

	it('maps world points back through the room origin', () => {
		const frames = roomFrames({ project, roomIds: ['a', 'b'] });
		const local = worldToRoom(frames[1], 7.5, -2);
		expect(local.x).toBeCloseTo(1500, 6);
		expect(local.y).toBeCloseTo(2000, 6);
	});
});

describe('fitPose', () => {
	it('keeps the box in view and looks at its centre', () => {
		const box = new Box3(new Vector3(0, 0, -3), new Vector3(4, 2.5, 0));
		const pose = fitPose(box, 40, 1.5);
		expect(pose.target.x).toBeCloseTo(2, 5);
		expect(pose.target.z).toBeCloseTo(-1.5, 5);
		expect(pose.position.y).toBeGreaterThan(pose.target.y);
		expect(pose.position.distanceTo(pose.target)).toBeGreaterThan(3);
	});

	it('handles an empty box', () => {
		const pose = fitPose(new Box3(), 40, 1);
		expect(Number.isFinite(pose.position.x)).toBe(true);
	});
});

function polygonWalls(polygon: { x: number; y: number }[], height = 2.5): CutawayWall[] {
	return roomWalls(polygon).map((wall) => {
		const center = {
			x: ((wall.start.x + wall.end.x) / 2) * 0.001,
			z: (-(wall.start.y + wall.end.y) / 2) * 0.001
		};
		return {
			key: String(wall.number),
			center,
			outward: { x: -wall.inward.x, z: wall.inward.y },
			half: (wall.length / 2) * 0.001,
			height
		};
	});
}

function cutaway(polygon: { x: number; y: number }[], camera: { x: number; y: number; z: number }) {
	const toWorld = (point: { x: number; y: number }) => ({
		x: point.x * 0.001,
		z: -point.y * 0.001
	});
	const samples = floorSamples(polygon, toWorld);
	const target = { x: 1.5, y: 0.6, z: -2 };
	const floors = [polygon.map(toWorld)];
	return [...loweredWalls(polygonWalls(polygon), camera, 0.05, target, samples, floors)].sort();
}

describe('cutaway for non-rectangular rooms', () => {
	const rect =
		ROOM_TEMPLATES.l.build({ a: 5000, b: 4000, c: 4999, d: 3999 }).length > 0
			? [
					{ x: 0, y: 0 },
					{ x: 5000, y: 0 },
					{ x: 5000, y: 4000 },
					{ x: 0, y: 4000 }
				]
			: [];
	const l = ROOM_TEMPLATES.l.build({ a: 5000, b: 4000, c: 2500, d: 2000 });
	const u = ROOM_TEMPLATES.u.build({ a: 6000, b: 4000, c: 2000, d: 2000, e: 1500 });

	it('lowers the walls between camera and room for a rectangle from every side', () => {
		expect(cutaway(rect, { x: 2.5, y: 8, z: 9 })).toEqual(['1']);
		expect(cutaway(rect, { x: 12, y: 8, z: -2 })).toEqual(['2']);
		expect(cutaway(rect, { x: 2.5, y: 8, z: -13 })).toEqual(['3']);
		expect(cutaway(rect, { x: -9, y: 8, z: -2 })).toEqual(['4']);
		expect(cutaway(rect, { x: 9, y: 8, z: 6 })).toEqual(['1', '2']);
		expect(cutaway(rect, { x: -6, y: 8, z: -10 })).toEqual(['3', '4']);
	});

	it('lowers the near walls of an L room, including the inner walls of the reentrant corner', () => {
		expect(cutaway(l, { x: 2.5, y: 8, z: 9 })).toEqual(['1']);
		expect(cutaway(l, { x: 9, y: 8, z: -9 })).toEqual(['2', '3', '4', '5']);
		expect(cutaway(l, { x: -9, y: 8, z: -9 })).toEqual(['3', '4', '5', '6']);
	});

	it('also lowers an inner wall that is only blocking the sight, not facing the camera', () => {
		const camera = { x: 1, y: 8, z: -9 };
		const blind = loweredWalls(polygonWalls(l), camera, 0.05, { x: 1.5, y: 0.6, z: -2 });
		expect(blind.has('4')).toBe(false);
		expect(cutaway(l, camera)).toEqual(['3', '4', '5']);
	});

	it('opens up a U room from the notch side and from the side', () => {
		expect(cutaway(u, { x: 3, y: 8, z: -9 })).toEqual(['3', '4', '5', '6', '7']);
		expect(cutaway(u, { x: -9, y: 8, z: -2 })).toEqual(['4', '6', '8']);
		expect(cutaway(u, { x: 5, y: 8, z: 9 })).toEqual(['1']);
		expect(cutaway(u, { x: 3, y: 8, z: 9 })).toEqual(['1']);
	});

	it('leaves a wall up that faces the camera but hides no floor', () => {
		const camera = { x: 3, y: 8, z: 9 };
		const walls = polygonWalls(u);
		expect(loweredWalls(walls, camera).has('4')).toBe(true);
		expect(cutaway(u, camera)).not.toContain('4');
		expect(cutaway(u, camera)).not.toContain('6');
	});

	it('keeps all walls up for a camera straight above', () => {
		expect(cutaway(l, { x: 2.5, y: 30, z: -2 })).toEqual([]);
	});

	it('samples only the inside of the room', () => {
		const samples = floorSamples(l, (point) => ({ x: point.x * 0.001, z: -point.y * 0.001 }));
		expect(samples.length).toBeGreaterThan(8);
		for (const sample of samples) {
			expect(
				floorAt(roomFrames({ project: lProject(), roomIds: ['l'] }), sample.x, sample.z)
			).not.toBeNull();
		}
	});
});

function lProject() {
	return {
		id: 'p',
		name: 'p',
		schemaVersion: 2 as const,
		rev: 0,
		createdAt: '',
		updatedAt: '',
		rooms: [
			{
				...rectangleRoom('l'),
				polygon: ROOM_TEMPLATES.l.build({ a: 5000, b: 4000, c: 2500, d: 2000 }),
				boardPos: { x: 0, y: 0, rot: 0 }
			}
		],
		variants: []
	};
}

describe('walking through doors', () => {
	const side = (x0: number, x1: number, doors: { a: number; b: number }[]) => ({
		polygon: [
			{ x: x0, y: 0 },
			{ x: x1, y: 0 },
			{ x: x1, y: -3 },
			{ x: x0, y: -3 }
		],
		doors: doors.map((door) => ({ a: { x: x0 + 0, y: -door.a }, b: { x: x0 + 0, y: -door.b } }))
	});

	const left = {
		polygon: [
			{ x: -4, y: 0 },
			{ x: 0, y: 0 },
			{ x: 0, y: -3 },
			{ x: -4, y: -3 }
		],
		doors: [{ a: { x: 0, y: -1 }, b: { x: 0, y: -1.9 }, id: 'd', roomId: 'left' }]
	};
	const right = {
		polygon: [
			{ x: 0.3, y: 0 },
			{ x: 4, y: 0 },
			{ x: 4, y: -3 },
			{ x: 0.3, y: -3 }
		],
		doors: [{ a: { x: 0.3, y: -1 }, b: { x: 0.3, y: -1.9 }, id: 'd@right', roomId: 'right' }]
	};

	it('opens a passage between rooms with facing doors', () => {
		const map = buildWalkMap([left, right], 0.22);
		expect(map.portals).toHaveLength(1);
		expect(standable(map, { x: -1, y: -1.45 }, 0.22)).toBe(true);
		expect(standable(map, { x: 0.15, y: -1.45 }, 0.22)).toBe(true);
		expect(standable(map, { x: 1, y: -1.45 }, 0.22)).toBe(true);
		expect(standable(map, { x: 0.15, y: -0.4 }, 0.22)).toBe(false);
	});

	it('walks from one room into the next through the door but not through the wall', () => {
		const map = buildWalkMap([left, right], 0.22);
		let position = { x: -1, y: -1.45 };
		for (let i = 0; i < 60; i++) {
			position = moveOnMap(map, position, { x: position.x + 0.05, y: position.y }, 0.22);
		}
		expect(position.x).toBeGreaterThan(1.5);
		let blocked = { x: -1, y: -0.5 };
		for (let i = 0; i < 60; i++) {
			blocked = moveOnMap(map, blocked, { x: blocked.x + 0.05, y: blocked.y }, 0.22);
		}
		expect(blocked.x).toBeLessThan(0);
	});

	it('keeps doors to the outside closed', () => {
		const map = buildWalkMap([left], 0.22);
		expect(map.portals).toHaveLength(0);
		let position = { x: -1, y: -1.45 };
		for (let i = 0; i < 60; i++) {
			position = moveOnMap(map, position, { x: position.x + 0.05, y: position.y }, 0.22);
		}
		expect(position.x).toBeLessThan(0);
	});

	it('does not connect doors that do not overlap enough', () => {
		const off = {
			...right,
			doors: [{ a: { x: 0.3, y: -2.5 }, b: { x: 0.3, y: -2.9 }, id: 'd@right', roomId: 'right' }]
		};
		expect(buildWalkMap([left, off], 0.22).portals).toHaveLength(0);
	});

	it('ignores doors of rooms that are far apart', () => {
		const far = {
			...right,
			polygon: right.polygon.map((p) => ({ x: p.x + 3, y: p.y })),
			doors: []
		};
		expect(buildWalkMap([left, far], 0.22).portals).toHaveLength(0);
		expect(side(0, 1, []).doors).toHaveLength(0);
	});
});

describe('walking feel', () => {
	it('eases towards the target without overshooting and settles exactly', () => {
		let value = 0;
		for (let i = 0; i < 30; i++) value = approach(value, 1, 8, 0.016);
		expect(value).toBeGreaterThan(0.5);
		expect(value).toBeLessThan(1);
		for (let i = 0; i < 400; i++) value = approach(value, 1, 8, 0.016);
		expect(value).toBe(1);
	});

	it('makes small stick deflections gentle and keeps full deflection', () => {
		expect(stickCurve(0.3)).toBeLessThan(0.3);
		expect(stickCurve(1)).toBe(1);
		expect(stickCurve(-1)).toBe(-1);
		expect(stickCurve(0)).toBe(0);
	});
});

describe('clamped floor picking', () => {
	const project = {
		id: 'p',
		name: 'p',
		schemaVersion: 2 as const,
		rev: 0,
		createdAt: '',
		updatedAt: '',
		rooms: [
			{ ...rectangleRoom('a'), boardPos: { x: 0, y: 0, rot: 0 } },
			{ ...rectangleRoom('b'), boardPos: { x: 6000, y: 0, rot: 0 } }
		],
		variants: []
	};
	const frames = roomFrames({ project, roomIds: ['a', 'b'] });

	it('returns the room under the point when there is one', () => {
		expect(clampedFloorAt(frames, 1, -1)).toEqual({ roomId: 'a', x: 1000, y: 1000 });
	});

	it('clamps a point outside all rooms to the nearest room boundary', () => {
		const hit = clampedFloorAt(frames, -2, -1);
		expect(hit).toMatchObject({ roomId: 'a', x: 0, y: 1000, outside: true });
		expect(clampedFloorAt(frames, 5.6, -1)).toMatchObject({ roomId: 'b', outside: true });
	});

	it('favours the given room when two rooms are about equally close', () => {
		expect(clampedFloorAt(frames, 5, -1, 'a')).toMatchObject({
			roomId: 'a',
			x: 4000,
			outside: true
		});
		expect(clampedFloorAt(frames, 5, -1, 'b')).toMatchObject({ roomId: 'b', x: 0, outside: true });
		expect(clampedFloorAt(frames, 5.9, -1, 'a')).toMatchObject({ roomId: 'b', outside: true });
	});

	it('finds the closest boundary point of a polygon', () => {
		const square = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 }
		];
		expect(nearestBoundaryPoint(square, { x: 15, y: 4 })).toEqual({ x: 10, y: 4 });
		expect(nearestBoundaryPoint(square, { x: 4, y: -3 })).toEqual({ x: 4, y: 0 });
	});
});

describe('fitting the view', () => {
	const footprint = [
		[
			{ x: 0, z: 0 },
			{ x: 14, z: 0 },
			{ x: 14, z: -3 },
			{ x: 0, z: -3 }
		]
	];
	const shape = shapeOfFootprints(footprint, 2.5);

	it('keeps all corners in view for landscape and portrait screens', () => {
		for (const aspect of [1.7, 0.5]) {
			const pose = bestFitPose(shape, 40, aspect);
			expect(pose.position.distanceTo(pose.target)).toBeGreaterThan(5);
			expect(Number.isFinite(pose.position.x)).toBe(true);
		}
	});

	it('looks along the long side of a wide plan on a portrait screen', () => {
		const landscape = bestFitPose(shape, 40, 1.7);
		const portrait = bestFitPose(shape, 40, 0.4);
		expect(Math.abs(landscape.position.z - landscape.target.z)).toBeGreaterThan(
			Math.abs(landscape.position.x - landscape.target.x) * 0.5
		);
		expect(Math.abs(portrait.position.x - portrait.target.x)).toBeGreaterThan(
			Math.abs(portrait.position.z - portrait.target.z)
		);
	});

	it('falls back to a default shape without rooms', () => {
		const pose = bestFitPose(shapeOfFootprints([], 2.5), 40, 1);
		expect(Number.isFinite(pose.position.y)).toBe(true);
	});
});

describe('walk map from room frames', () => {
	function apartment(gap: number, withNeighbourDoor = false) {
		const ids = sequentialIds('d');
		const a = createRoom('a', 'A', 'living', { x: 0, y: 0, rot: 0 });
		const b = createRoom('b', 'B', 'office', { x: 4000 + gap, y: 0, rot: 0 });
		a.elements.push(createElement('door', a, 2, 1500, ids));
		if (withNeighbourDoor) b.elements.push(createElement('door', b, 4, 1500, ids));
		return {
			id: 'p',
			name: 'p',
			schemaVersion: 2 as const,
			rev: 0,
			createdAt: '',
			updatedAt: '',
			rooms: [a, b],
			variants: []
		};
	}

	it('opens a passage through a door in a shared wall', () => {
		const frames = roomFrames({ project: apartment(150), roomIds: ['a', 'b'] });
		const map = buildWalkMap(walkInputs(frames), 0.22);
		expect(map.portals).toHaveLength(1);
		expect(standable(map, { x: 4.075, y: -1.5 }, 0.22)).toBe(true);
		expect(standable(map, { x: 5, y: -1.5 }, 0.22)).toBe(true);
		expect(standable(map, { x: 4.075, y: -0.4 }, 0.22)).toBe(false);
	});

	it('does not link rooms that do not share a wall, even with doors facing each other', () => {
		for (const gap of [0, 450, 600]) {
			const frames = roomFrames({ project: apartment(gap, true), roomIds: ['a', 'b'] });
			expect(buildWalkMap(walkInputs(frames), 0.22).portals).toHaveLength(0);
		}
	});

	it('keeps a single room closed', () => {
		const frames = roomFrames({ project: apartment(150), roomIds: ['a'] });
		expect(buildWalkMap(walkInputs(frames), 0.22).portals).toHaveLength(0);
	});
});

describe('shared openings', () => {
	function neighbours(swing: 'in' | 'out' | 'sliding') {
		const a = createRoom('a', 'A', 'living', { x: 0, y: 0, rot: 0 });
		const b = createRoom('b', 'B', 'office', { x: 4150, y: 0, rot: 0 });
		const door = createElement('door', a, 2, 1500, sequentialIds('d'));
		if (door.kind === 'door') door.swing = swing;
		a.elements.push(door);
		return {
			id: 'p',
			name: 'p',
			schemaVersion: 2 as const,
			rev: 0,
			createdAt: '',
			updatedAt: '',
			rooms: [a, b],
			variants: []
		};
	}

	it('adds the neighbour opening to a room that is shown alone', () => {
		const rooms = sceneRooms({ project: neighbours('in'), roomIds: ['b'] });
		expect(rooms).toHaveLength(1);
		expect(rooms[0].elements.map((element) => element.id)).toEqual(['d-1@b']);
	});

	it('builds the door leaf in the room it opens into', () => {
		const inward = sharedOpenings({ project: neighbours('in'), roomIds: ['a', 'b'] });
		expect([...(inward.get('b')?.silent ?? [])]).toEqual(['d-1@b']);
		expect(inward.get('a')?.silent.size ?? 0).toBe(0);
		expect([...(inward.get('b')?.covered ?? [])]).toEqual(['d-1@b']);

		const outward = sharedOpenings({ project: neighbours('out'), roomIds: ['a', 'b'] });
		expect([...(outward.get('a')?.silent ?? [])]).toEqual(['d-1']);
		expect(outward.get('b')?.silent.size ?? 0).toBe(0);

		const sliding = sharedOpenings({ project: neighbours('sliding'), roomIds: ['a', 'b'] });
		expect([...(sliding.get('b')?.silent ?? [])]).toEqual(['d-1@b']);
	});

	it('keeps every leaf when the neighbour is not part of the scene', () => {
		expect(sharedOpenings({ project: neighbours('out'), roomIds: ['a'] }).size).toBe(0);
		expect(sharedOpenings({ project: neighbours('in'), roomIds: ['b'] }).size).toBe(0);
	});
});
