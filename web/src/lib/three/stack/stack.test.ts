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
import type { Project, Room, Stair, StairShape } from '#lib/core/schema.ts';
import { MM } from '../coords.ts';
import { buildScene } from '../scene.ts';
import { DEFAULT_SCENE_OPTIONS } from '../types.ts';
import { loweredWalls } from '../viewer/cutaway.ts';
import { shapeOfFootprints } from '../viewer/fit.ts';
import { roomFrames } from '../viewer/layout.ts';
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
