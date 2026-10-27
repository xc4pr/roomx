import {
	Box3,
	DoubleSide,
	Mesh,
	MeshStandardMaterial,
	Raycaster,
	Vector3,
	type BufferGeometry,
	type Object3D
} from 'three';
import { describe, expect, it } from 'vitest';
import { createRoom } from '#lib/core/defaults.ts';
import { floorLevels, stairContext } from '#lib/core/floors.ts';
import { pointInPolygon } from '#lib/core/geometry.ts';
import type { Project, Room, Stair, StairShape } from '#lib/core/schema.ts';
import { MM } from '../coords.ts';
import { buildScene } from '../scene.ts';
import { DEFAULT_SCENE_OPTIONS } from '../types.ts';
import { loweredWalls } from '../viewer/cutaway.ts';
import { shapeOfFootprints } from '../viewer/fit.ts';
import { roomFrames } from '../viewer/layout.ts';
import { buildWalkMap, standable, walkInputs } from '../viewer/walk.ts';
import { roomHoles } from './openings.ts';
import { outlineLoops } from './slab.ts';
import { Soup } from './soup.ts';
import { stairTriangles } from './stairs.ts';

const lookup = () => undefined;

function big(id: string, floorId: string | undefined): Room {
	const room = createRoom(id, id, 'living');
	room.polygon = [
		{ x: 0, y: 0 },
		{ x: 7000, y: 0 },
		{ x: 7000, y: 5000 },
		{ x: 0, y: 5000 }
	];
	return { ...room, floorId };
}

function stair(shape: StairShape = 'straight', patch: Partial<Stair> = {}): Stair {
	return {
		id: 'st',
		fromFloorId: 'eg',
		shape,
		x: 600,
		y: 600,
		rotation: 0,
		width: 900,
		turn: 'left',
		...patch
	};
}

function project(stairs: Stair[] = [stair()]): Project {
	return {
		id: 'p',
		name: 'Haus',
		schemaVersion: 2,
		rev: 0,
		createdAt: '',
		updatedAt: '',
		floors: [
			{ id: 'eg', name: 'EG', slabThickness: 300 },
			{ id: 'og', name: 'OG', slabThickness: 250 }
		],
		rooms: [big('a', 'eg'), big('b', 'og')],
		stairs,
		variants: []
	};
}

function build(p: Project, ids = ['a', 'b']) {
	const scene = buildScene({ project: p, roomIds: ids }, DEFAULT_SCENE_OPTIONS, lookup);
	scene.root.updateMatrixWorld(true);
	return scene;
}

function parts(root: Object3D, part: string): Mesh[] {
	const found: Mesh[] = [];
	root.traverse((object) => {
		if (object instanceof Mesh && object.userData.part === part) found.push(object);
	});
	return found;
}

function triangles(geometry: BufferGeometry): number {
	return (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
}

function dropHits(meshes: Mesh[], x: number, y: number, z: number): number[] {
	const raycaster = new Raycaster(new Vector3(x, y, z), new Vector3(0, -1, 0));
	for (const mesh of meshes) (mesh.material as MeshStandardMaterial).side = DoubleSide;
	return raycaster.intersectObjects(meshes, false).map((hit) => hit.point.y);
}

describe('floor stack in 3D', () => {
	it('raises the rooms of the upper floor by the floor-to-floor height', () => {
		const p = project();
		const frames = roomFrames({ project: p, roomIds: ['a', 'b'] });
		const levels = floorLevels(p);
		expect(frames.map((frame) => frame.level)).toEqual([0, levels.get('og')]);
		expect(levels.get('og')).toBe(2800);
		const scene = build(p);
		expect(scene.roomGroups.get('b')?.position.y).toBeCloseTo(2.8, 6);
		expect(scene.roomGroups.get('a')?.position.y).toBe(0);
	});

	it('adds nothing without floors and nothing for a single room', () => {
		const flat = { ...project(), floors: undefined, stairs: undefined };
		expect(build(flat).root.getObjectByName('stack')).toBeUndefined();
		expect(build(project(), ['b']).root.getObjectByName('stack')).toBeUndefined();
		expect(build(project(), ['b']).roomGroups.get('b')?.position.y).toBe(0);
	});

	it('puts a slab under the upper room and cuts the stairwell out of it', () => {
		const p = project();
		const scene = build(p);
		const slabs = parts(scene.root, 'slab');
		expect(slabs).toHaveLength(1);
		expect(slabs[0].userData.slab.holes).toBe(1);
		const box = new Box3().setFromObject(slabs[0]);
		expect(box.max.y).toBeCloseTo((2800 - 3) * MM, 4);
		expect(box.min.y).toBeCloseTo((2800 - 300 + 3) * MM, 4);
		const context = stairContext(p, p.stairs![0])!;
		const open = context.opening[context.opening.length - 1].polygon;
		const centre = {
			x: open.reduce((sum, v) => sum + v.x, 0) / open.length,
			y: open.reduce((sum, v) => sum + v.y, 0) / open.length
		};
		expect(dropHits(slabs, centre.x * MM, 5, -centre.y * MM)).toHaveLength(0);
		expect(dropHits(slabs, 6.5, 5, -4.5)).toHaveLength(2);
	});

	it('has no hole where no stair arrives and no slab under the lowest floor', () => {
		const scene = build(project([]));
		const slabs = parts(scene.root, 'slab');
		expect(slabs).toHaveLength(1);
		expect(slabs[0].userData.slab.holes).toBe(0);
		expect(slabs[0].userData.slab.floorId).toBe('og');
	});

	it('shows only the chosen floors', () => {
		const p = project();
		const lower = build(p, ['a']);
		expect(lower.root.getObjectByName('stack')).toBeUndefined();
		const upper = build(p, ['b']);
		expect(upper.roomGroups.has('a')).toBe(false);
		const both = build(p);
		expect(parts(both.root, 'slab')).toHaveLength(1);
		expect(parts(both.root, 'stair').length).toBeGreaterThan(0);
	});

	it('builds one tread per step with the top step at the floor height', () => {
		for (const shape of ['straight', 'l', 'u', 'spiral'] as const) {
			const p = project([stair(shape, { x: 3500, y: 2500 })]);
			const context = stairContext(p, p.stairs![0])!;
			const scene = build(p);
			const treads = parts(scene.root, 'stair').filter(
				(mesh) => (mesh.material as MeshStandardMaterial).color.getHexString() === 'd7b68c'
			);
			expect(treads.length).toBeGreaterThan(0);
			const top = new Box3();
			for (const mesh of treads) top.expandByObject(mesh);
			const heights = context.layout.treads;
			const last = heights[heights.length - 1];
			expect(top.max.y).toBeCloseTo(last.height * MM, 4);
			expect(context.layout.treads.length).toBeGreaterThanOrEqual(context.layout.risers.count - 1);
			const risersHeight = context.layout.risers.riser * context.layout.risers.count;
			expect(risersHeight).toBeCloseTo(context.height, 3);
			expect(last.height + context.layout.risers.riser).toBeCloseTo(context.height, 3);
		}
	});

	it('walks the straight stair tread by tread', () => {
		const p = project();
		const context = stairContext(p, p.stairs![0])!;
		const scene = build(p);
		const meshes = parts(scene.root, 'stair');
		for (const tread of context.layout.treads) {
			const x = tread.polygon.reduce((sum, v) => sum + v.x, 0) / 4;
			const y = tread.polygon.reduce((sum, v) => sum + v.y, 0) / 4;
			const hits = dropHits(meshes, x * MM, 9, -y * MM);
			expect(Math.max(...hits)).toBeCloseTo(tread.height * MM, 4);
		}
	});

	it('keeps every stair within the triangle budget', () => {
		for (const shape of ['straight', 'l', 'u', 'spiral'] as const) {
			const p = project([stair(shape)]);
			expect(stairTriangles(stairContext(p, p.stairs![0])!)).toBeLessThan(2500);
		}
	});

	it('guards the stairwell on the upper floor', () => {
		const scene = build(project());
		const rails = parts(scene.root, 'stairwellRailing');
		expect(rails.length).toBeGreaterThan(0);
		const box = new Box3();
		for (const rail of rails) box.expandByObject(rail);
		expect(box.min.y).toBeCloseTo(2.8, 4);
		expect(box.max.y).toBeCloseTo(3.8, 1);
	});

	it('reuses the stair geometry between builds', () => {
		const p = project();
		const first = parts(build(p).root, 'stair')[0].geometry;
		const second = parts(build(p).root, 'stair')[0].geometry;
		expect(second).toBe(first);
		expect(triangles(first)).toBeGreaterThan(0);
	});
});

function openingCentre(p: Project) {
	const context = stairContext(p, p.stairs![0])!;
	const open = context.opening[context.opening.length - 1].polygon;
	return {
		x: open.reduce((sum, v) => sum + v.x, 0) / open.length,
		y: open.reduce((sum, v) => sum + v.y, 0) / open.length
	};
}

describe('stairwell in the room meshes', () => {
	it('opens the floor of the upper room and the ceiling of the lower room', () => {
		const p = project();
		const scene = build(p);
		const c = openingCentre(p);
		const floors = parts(scene.root, 'floor').filter((mesh) => mesh.parent?.name === 'room-b');
		const ceilings = parts(scene.root, 'ceiling').filter(
			(mesh) => mesh.parent?.parent?.name === 'room-a'
		);
		expect(floors).toHaveLength(1);
		expect(ceilings).toHaveLength(1);
		expect(dropHits(floors, c.x * MM, 9, -c.y * MM)).toHaveLength(0);
		expect(dropHits(floors, 6.5, 9, -4.5)).toHaveLength(1);
		expect(dropHits(ceilings, c.x * MM, 9, -c.y * MM)).toHaveLength(0);
		expect(dropHits(ceilings, 6.5, 9, -4.5)).toHaveLength(1);
	});

	it('cuts every upper room the opening overlaps', () => {
		const p = project();
		const c = openingCentre(p);
		const split = Math.round(c.x);
		const rect = (id: string, x0: number, x1: number): Room => ({
			...big(id, 'og'),
			polygon: [
				{ x: x0, y: 0 },
				{ x: x1, y: 0 },
				{ x: x1, y: 5000 },
				{ x: x0, y: 5000 }
			]
		});
		const two: Project = {
			...p,
			rooms: [big('a', 'eg'), rect('b', 0, split), rect('c', split, 7000)]
		};
		const scene = build(two, ['a', 'b', 'c']);
		const slabs = parts(scene.root, 'slab');
		expect(slabs).toHaveLength(2);
		expect(slabs.every((mesh) => mesh.userData.slab.holes === 1)).toBe(true);
		const floors = parts(scene.root, 'floor').filter((mesh) =>
			['room-b', 'room-c'].includes(mesh.parent?.name ?? '')
		);
		expect(dropHits(floors, c.x * MM, 9, -c.y * MM)).toHaveLength(0);
	});

	it('cuts only the part of the opening that lies in an L-shaped room', () => {
		const p = project();
		const [whole] = roomHoles(p, p.rooms[1]).floor;
		const xs = whole.map((q) => q.x);
		const ys = whole.map((q) => q.y);
		const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
		const nx = (x0 + x1) / 2 - (x1 - x0) / 4;
		const ny = (y0 + y1) / 2 - (y1 - y0) / 4;
		const l: Room = {
			...big('b', 'og'),
			polygon: [
				{ x: nx, y: 0 },
				{ x: 7000, y: 0 },
				{ x: 7000, y: 5000 },
				{ x: 0, y: 5000 },
				{ x: 0, y: ny },
				{ x: nx, y: ny }
			]
		};
		const holes = roomHoles({ ...p, rooms: [p.rooms[0], l] }, l).floor;
		expect(holes).toHaveLength(1);
		const area = (poly: readonly { x: number; y: number }[]) =>
			Math.abs(
				poly.reduce((sum, q, i) => {
					const r = poly[(i + 1) % poly.length];
					return sum + q.x * r.y - r.x * q.y;
				}, 0) / 2
			);
		expect(area(holes[0])).toBeCloseTo(area(whole) - (nx - x0) * (ny - y0), -1);
		expect(holes[0].every((q) => q.x >= nx - 1 || q.y >= ny - 1)).toBe(true);
	});

	it('opens exactly the treads that lie in an L-shaped room, also around its inner corner', () => {
		const l = (id: string, floorId: string): Room => ({
			...big(id, floorId),
			polygon: [
				{ x: 2450, y: 0 },
				{ x: 7000, y: 0 },
				{ x: 7000, y: 5000 },
				{ x: 0, y: 5000 },
				{ x: 0, y: 2360 },
				{ x: 2450, y: 2360 }
			]
		});
		const cases: Partial<Stair>[] = [
			{ shape: 'l', x: 3000, y: 500 },
			{ shape: 'u', x: 3000, y: 600 },
			{ shape: 'spiral', x: 1500, y: 1500, width: 1200, rotation: 180, turn: 'right' },
			{ shape: 'spiral', x: 2450, y: 2360, rotation: 90 }
		];
		for (const patch of cases) {
			const upper = l('b', 'og');
			const p: Project = {
				...project([stair(patch.shape, patch)]),
				rooms: [big('a', 'eg'), upper]
			};
			const treads = stairContext(p, p.stairs![0])!.opening.map((tread) => tread.polygon);
			const holes = roomHoles(p, upper).floor;
			const label = JSON.stringify(patch);
			let wrong = 0;
			for (let x = 25; x < 7000; x += 50) {
				for (let y = 25; y < 5000; y += 50) {
					const point = { x, y };
					if (!pointInPolygon(point, upper.polygon)) continue;
					const open = holes.filter((hole) => pointInPolygon(point, hole)).length % 2 === 1;
					const tread = treads.some((polygon) => pointInPolygon(point, polygon));
					if (tread && !open) wrong++;
					if (!tread && open && patch.shape !== 'spiral') wrong++;
				}
			}
			expect(wrong, label).toBe(0);
		}
	});

	it('cuts L, U and spiral openings to an L-shaped room', () => {
		const l: Room = {
			...big('b', 'og'),
			polygon: [
				{ x: 2450, y: 0 },
				{ x: 7000, y: 0 },
				{ x: 7000, y: 5000 },
				{ x: 0, y: 5000 },
				{ x: 0, y: 2360 },
				{ x: 2450, y: 2360 }
			]
		};
		const area = (poly: readonly { x: number; y: number }[]) =>
			Math.abs(
				poly.reduce((sum, q, i) => {
					const r = poly[(i + 1) % poly.length];
					return sum + q.x * r.y - r.x * q.y;
				}, 0) / 2
			);
		let checked = 0;
		for (const shape of ['l', 'u', 'spiral'] as const) {
			const p: Project = {
				...project([stair(shape, { x: 3000, y: 500 })]),
				rooms: [big('a', 'eg'), l]
			};
			const opening = stairContext(p, p.stairs![0])!.opening.map((tread) => tread.polygon);
			const inside = opening
				.flatMap((polygon) => polygon)
				.filter((point) => pointInPolygon(point, l.polygon, 1));
			const holes = roomHoles(p, l).floor;
			const cut = holes.reduce((sum, hole) => sum + area(hole), 0);
			const whole = opening.reduce((sum, polygon) => sum + area(polygon), 0);
			if (inside.length === 0) continue;
			checked++;
			expect(holes.length, shape).toBeGreaterThan(0);
			expect(cut, shape).toBeLessThanOrEqual(whole + 1);
			for (const hole of holes) {
				expect(
					hole.every((point) => pointInPolygon(point, l.polygon, 1)),
					shape
				).toBe(true);
			}
		}
		expect(checked).toBeGreaterThanOrEqual(2);
	});

	it('opens a sloped ceiling of the lower room', () => {
		const base = project();
		const slopedRoom: Room = {
			...big('a', 'eg'),
			slopes: [{ id: 's1', wall: 1, kneeHeight: 1000, angle: 30 }]
		};
		const p: Project = { ...base, rooms: [slopedRoom, base.rooms[1]] };
		const c = openingCentre(p);
		const overhead = [...parts(build(p).root, 'ceiling'), ...parts(build(p).root, 'slope')].filter(
			(mesh) => mesh.parent?.parent?.name === 'room-a'
		);
		expect(overhead.length).toBeGreaterThan(0);
		expect(roomHoles(p, slopedRoom).ceilingParts.length).toBeGreaterThan(0);
		expect(dropHits(overhead, c.x * MM, 9, -c.y * MM)).toHaveLength(0);
		expect(dropHits(overhead, 6.5, 9, -4.5)).toHaveLength(1);
		expect(dropHits(overhead, 6.5, 9, -0.3)).toHaveLength(1);
	});

	it('blocks the walk map over the stairwell', () => {
		const p = project();
		const c = openingCentre(p);
		const frames = roomFrames({ project: p, roomIds: ['a', 'b'] }).filter(
			(frame) => frame.floorId === 'og'
		);
		const at = { x: c.x * MM, y: c.y * MM };
		const frame = frames[0];
		const world = { x: frame.origin.x + at.x, y: frame.origin.z - at.y };
		const open = buildWalkMap(walkInputs(frames), 0.22);
		const closed = buildWalkMap(walkInputs(frames, p), 0.22);
		expect(standable(open, world, 0.22)).toBe(true);
		expect(standable(closed, world, 0.22)).toBe(false);
	});
});

describe('stack helpers', () => {
	it('outlines the union of adjacent pieces', () => {
		const rect = (x0: number, x1: number) => [
			{ x: x0, y: 0 },
			{ x: x1, y: 0 },
			{ x: x1, y: 10 },
			{ x: x0, y: 10 }
		];
		const loops = outlineLoops([rect(0, 10), rect(10, 20), rect(20, 30)]);
		expect(loops).toHaveLength(1);
		expect(loops[0]).toHaveLength(4);
	});

	it('makes prisms and bars with outward normals', () => {
		const soup = new Soup();
		const spec = { color: '#ffffff' };
		soup.prism(
			spec,
			[
				{ x: 0, z: 0 },
				{ x: 1, z: 0 },
				{ x: 1, z: -1 },
				{ x: 0, z: -1 }
			],
			0,
			1
		);
		soup.bar(spec, [3, 0, 0], [5, 1, 0], 0.1);
		const [part] = soup.bake();
		const position = part.geometry.getAttribute('position');
		const normal = part.geometry.getAttribute('normal');
		const centres = [new Vector3(0.5, 0.5, -0.5), new Vector3(4, 0.5, 0)];
		for (let i = 0; i < position.count; i += 3) {
			const middle = new Vector3(
				(position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3,
				(position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3,
				(position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3
			);
			const centre = middle.x < 2 ? centres[0] : centres[1];
			const n = new Vector3(normal.getX(i), normal.getY(i), normal.getZ(i));
			expect(n.dot(middle.clone().sub(centre))).toBeGreaterThan(0);
		}
	});

	it('lowers walls of an upper floor only when the sight line passes them', () => {
		const wall = {
			key: 'w',
			center: { x: 0, z: 0 },
			outward: { x: 0, z: 1 },
			half: 1,
			height: 2.5,
			base: 2.8
		};
		const camera = { x: 0, y: 4, z: -3 };
		expect(loweredWalls([{ ...wall, base: 0 }], camera, 0.05, { x: 0, y: 0.35, z: 3 })).toContain(
			'w'
		);
		expect(loweredWalls([wall], camera, 0.05, { x: 0, y: 0.35, z: 3 })).not.toContain('w');
		expect(loweredWalls([wall], camera, 0.05, { x: 0, y: 3.2, z: 3 })).toContain('w');
	});

	it('fits the whole stack of storeys', () => {
		const flat = shapeOfFootprints([[{ x: 0, z: 0 }]], 2.5);
		const stacked = shapeOfFootprints([[{ x: 0, y: 0, z: 0 }], [{ x: 0, y: 2.8, z: 0 }]], 2.5);
		expect(stacked.height).toBeCloseTo(2.8 + 1.4, 6);
		expect(flat.height).toBeCloseTo(1.4, 6);
	});
});
