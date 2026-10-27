import { Box3, DoubleSide, Mesh, Raycaster, Vector3, type Material, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { createElement, createRoom } from '#lib/core/defaults.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import type { Project, Room, RoomType } from '#lib/core/schema.ts';
import { buildScene } from '../scene.ts';
import { DEFAULT_SCENE_OPTIONS } from '../types.ts';
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

function pair(type: RoomType, gap: number, withDoor = false) {
	const house = createRoom('a', 'A', 'living', { x: 0, y: 0, rot: 0 });
	const outdoor = createRoom('b', 'B', type, { x: 4000 + gap, y: 0, rot: 0 });
	outdoor.railing = { height: 1000 };
	if (withDoor) house.elements.push(createElement('door', house, 2, 1500, sequentialIds('d')));
	return project([house, outdoor]);
}

function build(content: Project, ids: string[]) {
	const scene = buildScene({ project: content, roomIds: ids }, DEFAULT_SCENE_OPTIONS, lookup);
	scene.root.updateMatrixWorld(true);
	return scene;
}

function roomObject(root: Object3D, roomId: string): Object3D {
	const found = root.getObjectByName(`room-${roomId}`);
	if (!found) throw new Error(`no room ${roomId}`);
	return found;
}

function meshes(root: Object3D, part: string): Mesh[] {
	const found: Mesh[] = [];
	root.traverse((object) => {
		if (object instanceof Mesh && object.userData.part === part) found.push(object);
	});
	return found;
}

function solid(list: Mesh[]): Mesh[] {
	for (const mesh of list) {
		for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
			(material as Material).side = DoubleSide;
		}
	}
	return list;
}

function hits(list: Mesh[], origin: Vector3, direction: Vector3, far = 1): number {
	return new Raycaster(origin, direction, 0, far).intersectObjects(solid(list), false).length;
}

function wallBodies(root: Object3D, roomId: string, wall: number): Mesh[] {
	return meshes(roomObject(root, roomId), 'wallBody').filter(
		(mesh) => mesh.parent?.userData.wall === wall
	);
}

describe('open-air areas', () => {
	for (const type of ['balcony', 'terrace', 'garden'] as const) {
		it(`builds only a floor slab for a ${type}`, () => {
			const scene = build(pair(type, 150), ['b']);
			const room = roomObject(scene.root, 'b');
			expect(meshes(room, 'wallBody')).toHaveLength(0);
			expect(meshes(room, 'ceiling')).toHaveLength(0);
			expect(meshes(room, 'floor')).toHaveLength(1);
			expect(room.getObjectByName('base')).toBeDefined();
			const box = new Box3().setFromObject(room.getObjectByName('base') as Object3D);
			expect(box.max.y).toBeLessThan(0);
			expect(box.min.y).toBeLessThan(-0.04);
		});
	}

	it('paves a terrace with joints and keeps the garden plain', () => {
		const terrace = roomObject(build(pair('terrace', 150), ['b']).root, 'b');
		expect(terrace.children.some((child) => child.userData.part === 'paving')).toBe(true);
		const garden = roomObject(build(pair('garden', 150), ['b']).root, 'b');
		expect(garden.children.some((child) => child.userData.part === 'paving')).toBe(false);
	});

	it('puts the railing on free edges only and at railing.height', () => {
		const scene = build(pair('balcony', 150), ['a', 'b']);
		const railing = meshes(roomObject(scene.root, 'b'), 'railing');
		expect(railing.length).toBeGreaterThan(0);
		const box = new Box3();
		for (const mesh of railing) box.expandByObject(mesh);
		expect(box.max.y).toBeCloseTo(1, 3);
		const left = 4.15;
		const docked = hits(railing, new Vector3(left - 0.3, 0.5, -1.5), new Vector3(1, 0, 0), 0.6);
		const free = hits(railing, new Vector3(left + 4.3, 0.5, -1.5), new Vector3(-1, 0, 0), 0.6);
		expect(docked).toBe(0);
		expect(free).toBeGreaterThan(0);
	});

	it('has no railing when the room has none', () => {
		const content = pair('terrace', 150);
		delete content.rooms[1].railing;
		const room = roomObject(build(content, ['b']).root, 'b');
		expect(meshes(room, 'railing')).toHaveLength(0);
	});

	it('places the cover as a thin slab at cover.height', () => {
		const content = pair('terrace', 150);
		content.rooms[1].cover = {
			height: 2600,
			polygon: [
				{ x: 0, y: 0 },
				{ x: 2000, y: 0 },
				{ x: 2000, y: 1500 },
				{ x: 0, y: 1500 }
			]
		};
		const room = roomObject(build(content, ['b']).root, 'b');
		const slab = meshes(room, 'slope');
		expect(slab).toHaveLength(1);
		const box = new Box3().setFromObject(slab[0]);
		expect(box.min.y).toBeCloseTo(2.6, 3);
		expect(box.max.y - box.min.y).toBeLessThan(0.1);
		// 2 mm inside the outline on each side.
		expect(box.max.x - box.min.x).toBeCloseTo(1.996, 3);
		expect(meshes(room, 'slopeGhost')[0].visible).toBe(true);
	});

	for (const gap of [100, 200, 350]) {
		it(`lets the house build the whole ${gap} mm wall next to a balcony`, () => {
			const scene = build(pair('balcony', gap), ['a', 'b']);
			const bodies = wallBodies(scene.root, 'a', 2);
			solid(bodies);
			for (const z of [-0.5, -2.5]) {
				const xs = new Raycaster(new Vector3(3, 1.2, z), new Vector3(1, 0, 0), 0, 3)
					.intersectObjects(bodies, false)
					.map((hit) => hit.point.x);
				expect(Math.max(...xs)).toBeCloseTo(4 + gap / 1000, 3);
			}
		});
	}

	it('cuts a door through the whole wall and builds one leaf', () => {
		const scene = build(pair('balcony', 200, true), ['a', 'b']);
		const bodies = wallBodies(scene.root, 'a', 2);
		expect(hits(bodies, new Vector3(3.9, 1, -1.5), new Vector3(1, 0, 0), 1)).toBe(0);
		expect(hits(bodies, new Vector3(3.9, 1, -0.4), new Vector3(1, 0, 0), 1)).toBeGreaterThan(0);
		const leaves = meshes(scene.root, 'fixture').filter(
			(mesh) =>
				(mesh.material as { color?: { getHexString(): string } }).color?.getHexString() ===
				PALETTE.door.slice(1)
		);
		expect(leaves).toHaveLength(1);
	});

	it('keeps 150 mm walls when the balcony is not in the scene', () => {
		const scene = build(pair('balcony', 200), ['a']);
		const xs = new Raycaster(new Vector3(3, 1.2, -1.5), new Vector3(1, 0, 0), 0, 3)
			.intersectObjects(solid(wallBodies(scene.root, 'a', 2)), false)
			.map((hit) => hit.point.x);
		expect(Math.max(...xs)).toBeCloseTo(4.15, 3);
	});
});

describe('conservatory', () => {
	function glassRoom() {
		const content = pair('winterGarden', 200);
		return content;
	}

	it('builds thin transparent walls and a glass roof', () => {
		const room = roomObject(build(glassRoom(), ['b']).root, 'b');
		const bodies = meshes(room, 'wallBody');
		expect(bodies).toHaveLength(4);
		for (const body of bodies) {
			for (const material of body.material as Material[]) {
				expect(material.transparent).toBe(true);
				expect(material.opacity).toBeLessThan(0.5);
			}
			const box = new Box3().setFromObject(body);
			expect(Math.min(box.max.x - box.min.x, box.max.z - box.min.z)).toBeLessThan(0.1);
		}
		expect(meshes(room, 'glassRoof').length).toBeGreaterThan(0);
		expect(meshes(room, 'ceiling')).toHaveLength(0);
		expect(meshes(room, 'glassFrame').length).toBeGreaterThan(0);
	});

	it('follows a mono-pitch roof', () => {
		const content = glassRoom();
		content.rooms[1].slopes = [{ id: 's1', wall: 1, kneeHeight: 1200, angle: 30 }];
		const room = roomObject(build(content, ['b']).root, 'b');
		const roof = meshes(room, 'glassRoof');
		expect(roof.length).toBeGreaterThan(0);
		const box = new Box3();
		for (const mesh of roof) box.expandByObject(mesh);
		expect(box.min.y).toBeLessThan(box.max.y - 0.5);
	});

	it('leaves the wall to the house where they touch', () => {
		const scene = build(glassRoom(), ['a', 'b']);
		const bodies = wallBodies(scene.root, 'b', 4);
		expect(hits(bodies, new Vector3(4.1, 1, -1.5), new Vector3(1, 0, 0), 0.5)).toBe(0);
		const house = wallBodies(scene.root, 'a', 2);
		expect(hits(house, new Vector3(3.9, 1.2, -1.5), new Vector3(1, 0, 0), 0.5)).toBeGreaterThan(0);
	});
});
