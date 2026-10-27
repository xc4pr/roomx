import {
	Box3,
	Color,
	DoubleSide,
	Mesh,
	Raycaster,
	Vector3,
	type Material,
	type Object3D
} from 'three';
import { describe, expect, it } from 'vitest';
import { createElement, createRoom } from '#lib/core/defaults.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import type { Project, Room } from '#lib/core/schema.ts';
import { buildScene } from '../scene.ts';
import { DEFAULT_SCENE_OPTIONS } from '../types.ts';
import { buildWalkMap, standable, walkInputs } from '../viewer/walk.ts';
import { roomFrames } from '../viewer/layout.ts';
import { PALETTE } from './materials.ts';

const lookup = () => undefined;

function project(rooms: Room[]): Project {
	return {
		id: 'p',
		name: 'p',
		schemaVersion: 2,
		rev: 0,
		createdAt: '',
		updatedAt: '',
		rooms,
		variants: []
	};
}

function pair(gap: number, withDoor = true, bY = 0) {
	const a = createRoom('a', 'A', 'living', { x: 0, y: 0, rot: 0 });
	const b = createRoom('b', 'B', 'office', { x: 4000 + gap, y: bY, rot: 0 });
	if (withDoor) a.elements.push(createElement('door', a, 2, 1500, sequentialIds('d')));
	return project([a, b]);
}

function build(content: Project, ids: string[]) {
	const scene = buildScene({ project: content, roomIds: ids }, DEFAULT_SCENE_OPTIONS, lookup);
	scene.root.updateMatrixWorld(true);
	return scene;
}

function bodies(root: Object3D, roomId: string, wall: number): Mesh[] {
	const found: Mesh[] = [];
	root.traverse((object) => {
		if (!(object instanceof Mesh) || object.userData.part !== 'wallBody') return;
		const group = object.parent;
		let room: Object3D | null = group;
		while (room && !room.name.startsWith('room-')) room = room.parent;
		if (group?.userData.wall === wall && room?.name === `room-${roomId}`) found.push(object);
	});
	return found;
}

function xRange(meshes: Mesh[], y: number, z: number): { min: number; max: number } {
	for (const mesh of meshes) {
		for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
			(material as Material).side = DoubleSide;
		}
	}
	const raycaster = new Raycaster(new Vector3(3, y, z), new Vector3(1, 0, 0), 0, 3);
	const xs = raycaster.intersectObjects(meshes, false).map((hit) => hit.point.x);
	return { min: Math.min(...xs), max: Math.max(...xs) };
}

function hits(meshes: Mesh[], origin: Vector3): number {
	for (const mesh of meshes) {
		for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
			(material as Material).side = DoubleSide;
		}
	}
	const raycaster = new Raycaster(origin, new Vector3(1, 0, 0), 0, 1);
	return raycaster.intersectObjects(meshes, false).length;
}

describe('shared wall thickness', () => {
	for (const gap of [100, 150, 300]) {
		it(`fills exactly the gap of ${gap} mm between the interior faces`, () => {
			const scene = build(pair(gap, false), ['a', 'b']);
			const left = bodies(scene.root, 'a', 2);
			const right = bodies(scene.root, 'b', 4);
			for (const z of [-0.5, -1.5, -2.5]) {
				const l = xRange(left, 1.2, z);
				const r = xRange(right, 1.2, z);
				expect(l.min).toBeCloseTo(4, 3);
				expect(r.max).toBeCloseTo(4 + gap / 1000, 3);
				expect(l.max).toBeCloseTo(4 + gap / 2000, 3);
				expect(r.min).toBeCloseTo(4 + gap / 2000, 3);
			}
		});
	}

	it('keeps 150 mm beyond a partly shared section', () => {
		const scene = build(pair(100, false, 2000), ['a', 'b']);
		const left = bodies(scene.root, 'a', 2);
		const shared = xRange(left, 1.2, -2.5);
		const alone = xRange(left, 1.2, -0.5);
		expect(shared.max).toBeCloseTo(4.05, 3);
		expect(alone.max).toBeCloseTo(4.15, 3);
	});

	it('keeps unconnected rooms and single rooms at 150 mm', () => {
		const far = build(pair(1000, false), ['a', 'b']);
		expect(xRange(bodies(far.root, 'a', 2), 1.2, -1.5).max).toBeCloseTo(4.15, 3);
		const single = build(pair(100, false), ['a']);
		expect(xRange(bodies(single.root, 'a', 2), 1.2, -1.5).max).toBeCloseTo(4.15, 3);
	});

	for (const gap of [80, 100, 300, 350]) {
		it(`cuts a door through the whole wall of ${gap} mm and builds one leaf`, () => {
			const scene = build(pair(gap), ['a', 'b']);
			const all = [...bodies(scene.root, 'a', 2), ...bodies(scene.root, 'b', 4)];
			expect(hits(all, new Vector3(3.9, 1, -1.5))).toBe(0);
			expect(hits(all, new Vector3(3.9, 1, -0.4))).toBeGreaterThan(0);
			expect(hits(all, new Vector3(3.9, 2.4, -1.5))).toBeGreaterThan(0);
			let leaves = 0;
			const door = new Color(PALETTE.door);
			scene.root.traverse((object) => {
				if (!(object instanceof Mesh) || object.userData.part !== 'fixture') return;
				if ((object.material as { color?: Color }).color?.equals(door)) leaves++;
			});
			expect(leaves).toBe(1);
			const box = new Box3();
			scene.root.traverse((object) => {
				if (object instanceof Mesh && object.userData.part === 'fixture') {
					box.expandByObject(object);
				}
			});
			expect(box.max.x).toBeLessThan(4 + gap / 1000 + 0.05);
		});

		it(`walks through the door of a ${gap} mm wall`, () => {
			const frames = roomFrames({ project: pair(gap), roomIds: ['a', 'b'] });
			const map = buildWalkMap(walkInputs(frames), 0.22);
			expect(map.portals).toHaveLength(1);
			const middle = 4 + gap / 2000;
			expect(standable(map, { x: middle, y: -1.5 }, 0.22)).toBe(true);
			expect(standable(map, { x: 3.5, y: -1.5 }, 0.22)).toBe(true);
			expect(standable(map, { x: 4.5 + gap / 1000, y: -1.5 }, 0.22)).toBe(true);
			expect(standable(map, { x: middle, y: -0.4 }, 0.22)).toBe(false);
		});
	}
});
