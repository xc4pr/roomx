import { Box3, Mesh, Raycaster, Vector3, type BufferGeometry, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { WALL_THICKNESS } from '#lib/core/defaults.ts';
import { rectangleRoom, lRoom } from '#lib/core/fixtures.ts';
import { perimeter } from '#lib/core/geometry.ts';
import { ROOM_TEMPLATES } from '#lib/core/templates.ts';
import type { Room } from '#lib/core/schema.ts';
import { DEFAULT_SCENE_OPTIONS, type RoomBuildOptions } from '../types.ts';
import { applyWallHeight, buildRoom, setCeilingShown, wallGroups } from './index.ts';

const OPTIONS: RoomBuildOptions = { ...DEFAULT_SCENE_OPTIONS, wallHeightFactor: 1 };
const T = WALL_THICKNESS / 1000;

function meshes(root: Object3D, part: string): Mesh[] {
	const found: Mesh[] = [];
	root.traverse((object) => {
		if (object instanceof Mesh && object.userData.part === part) found.push(object);
	});
	return found;
}

function boundsOf(root: Object3D, part: string): Box3 {
	root.updateMatrixWorld(true);
	const box = new Box3();
	for (const mesh of meshes(root, part)) box.expandByObject(mesh);
	return box;
}

function capArea(geometry: BufferGeometry): number {
	const position = geometry.getAttribute('position');
	const cap = geometry.groups.find((group) => group.materialIndex === 2);
	if (!cap) return 0;
	let area = 0;
	for (let i = cap.start; i < cap.start + cap.count; i += 3) {
		const [a, b, c] = [i, i + 1, i + 2].map(
			(index) => new Vector3(position.getX(index), position.getY(index), position.getZ(index))
		);
		area += new Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).length() / 2;
	}
	return area;
}

function totalCapArea(root: Object3D): number {
	return meshes(root, 'wallBody').reduce((sum, mesh) => {
		const local = capArea(mesh.geometry);
		return sum + local * mesh.scale.x * mesh.scale.z;
	}, 0);
}

function expectedWallArea(polygon: Room['polygon']): number {
	const n = polygon.length;
	let tangents = 0;
	for (let i = 0; i < n; i++) {
		const prev = polygon[(i - 1 + n) % n];
		const current = polygon[i];
		const next = polygon[(i + 1) % n];
		const ax = current.x - prev.x;
		const ay = current.y - prev.y;
		const bx = next.x - current.x;
		const by = next.y - current.y;
		const turn = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
		tangents += Math.tan(turn / 2);
	}
	return (perimeter(polygon) / 1000) * T + T * T * tangents;
}

describe('buildRoom', () => {
	it('keeps the inner dimensions exact and puts the wall thickness outside', () => {
		const room: Room = { ...rectangleRoom(), elements: [] };
		const root = buildRoom(room, OPTIONS);
		const walls = boundsOf(root, 'wallBody');
		expect(walls.min.x).toBeCloseTo(-T, 5);
		expect(walls.max.x).toBeCloseTo(4 + T, 5);
		expect(walls.min.z).toBeCloseTo(-(3 + T), 5);
		expect(walls.max.z).toBeCloseTo(T, 5);
		expect(walls.min.y).toBeCloseTo(0, 5);
		expect(walls.max.y).toBeCloseTo(2.5, 5);
		const floor = boundsOf(root, 'floor');
		expect(floor.min.x).toBeCloseTo(0, 5);
		expect(floor.max.x).toBeCloseTo(4, 5);
		expect(floor.min.z).toBeCloseTo(-3, 5);
		expect(floor.max.z).toBeCloseTo(0, 5);
	});

	it('creates one group per wall carrying its number', () => {
		const root = buildRoom(lRoom(), OPTIONS);
		expect(wallGroups(root).map((group) => group.userData.wall)).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it('leaves the opening of a door empty and the rest of the wall solid', () => {
		const room = rectangleRoom();
		const root = buildRoom(room, { ...OPTIONS, electrical: false });
		root.updateMatrixWorld(true);
		const bodies = meshes(root, 'wallBody');
		const shoot = (x: number, y: number) => {
			const raycaster = new Raycaster(new Vector3(x, y, -0.5), new Vector3(0, 0, 1));
			return raycaster.intersectObjects(bodies, false);
		};
		expect(shoot(0.6, 1.0)).toHaveLength(0);
		expect(shoot(0.6, 1.9)).toHaveLength(0);
		expect(shoot(0.6, 2.2).length).toBeGreaterThan(0);
		expect(shoot(2.0, 1.0).length).toBeGreaterThan(0);
		expect(shoot(0.1, 1.0).length).toBeGreaterThan(0);
	});

	it('cuts a window with a sill above the floor', () => {
		const room = rectangleRoom();
		const root = buildRoom(room, { ...OPTIONS, electrical: false });
		root.updateMatrixWorld(true);
		const bodies = meshes(root, 'wallBody');
		const shoot = (x: number, y: number) =>
			new Raycaster(new Vector3(x, y, -2.5), new Vector3(0, 0, -1)).intersectObjects(bodies, false);
		expect(shoot(2.0, 1.5)).toHaveLength(0);
		expect(shoot(2.0, 0.5).length).toBeGreaterThan(0);
		expect(shoot(2.0, 2.4).length).toBeGreaterThan(0);
		expect(shoot(0.8, 1.5).length).toBeGreaterThan(0);
	});

	it.each([
		['rectangle', rectangleRoom().polygon],
		['L room with reflex corner', ROOM_TEMPLATES.l.build(ROOM_TEMPLATES.l.defaults)],
		['U room', ROOM_TEMPLATES.u.build(ROOM_TEMPLATES.u.defaults)],
		['chamfered corner', ROOM_TEMPLATES.chamfer.build(ROOM_TEMPLATES.chamfer.defaults)]
	])('mitres the corners cleanly: %s', (_name, polygon) => {
		const room: Room = { ...rectangleRoom(), polygon, elements: [] };
		const root = buildRoom(room, OPTIONS);
		root.updateMatrixWorld(true);
		expect(totalCapArea(root)).toBeCloseTo(expectedWallArea(polygon), 4);
	});

	it('keeps an L room inside the inner outline plus thickness', () => {
		const polygon = ROOM_TEMPLATES.l.build(ROOM_TEMPLATES.l.defaults);
		const root = buildRoom({ ...lRoom(), polygon }, OPTIONS);
		const box = boundsOf(root, 'wallBody');
		expect(box.min.x).toBeCloseTo(-T, 5);
		expect(box.max.x).toBeCloseTo(5 + T, 5);
		expect(box.max.z).toBeCloseTo(T, 5);
		expect(box.min.z).toBeCloseTo(-(4 + T), 5);
	});

	it('shows electrical symbols only on request', () => {
		const room = rectangleRoom();
		const count = (root: Object3D) =>
			meshes(root, 'fixture').reduce(
				(sum, mesh) => sum + mesh.geometry.getAttribute('position').count,
				0
			);
		const withElectric = buildRoom(room, { ...OPTIONS, electrical: true });
		const without = buildRoom(room, { ...OPTIONS, electrical: false });
		expect(count(withElectric)).toBeGreaterThan(count(without));
	});

	it('adds ceiling and ceiling lamps only when asked', () => {
		const room: Room = {
			...rectangleRoom(),
			elements: [{ id: 'lamp', kind: 'ceilingLamp', status: 'existing', x: 2000, y: 1500 }]
		};
		const find = (root: Object3D, part: string) => meshes(root, part).length;
		const plain = buildRoom(room, { ...OPTIONS, ceiling: false, electrical: false });
		const shown = (root: Object3D) => meshes(root, 'ceiling').filter((mesh) => mesh.visible).length;
		expect(find(plain, 'ceiling')).toBe(1);
		expect(shown(plain)).toBe(0);
		expect(find(plain, 'ceilingLamp')).toBe(0);
		const full = buildRoom(room, { ...OPTIONS, ceiling: true, electrical: true });
		expect(shown(full)).toBe(1);
		setCeilingShown(plain, true);
		expect(shown(plain)).toBe(1);
		expect(find(full, 'ceilingLamp')).toBeGreaterThan(0);
	});

	it('scales the wall height for the build-up animation', () => {
		const room = rectangleRoom();
		const root = buildRoom(room, { ...OPTIONS, wallHeightFactor: 0.5 });
		const [first] = wallGroups(root);
		expect(first.scale.y).toBeCloseTo(0.5);
		applyWallHeight(first, 0);
		expect(first.visible).toBe(false);
		applyWallHeight(first, 1);
		expect(first.visible).toBe(true);
		expect(boundsOf(root, 'wallBody').max.y).toBeCloseTo(2.5, 5);
	});

	it('records lamp positions in room coordinates', () => {
		const room: Room = {
			...rectangleRoom(),
			elements: [
				{ id: 'lamp', kind: 'ceilingLamp', status: 'existing', x: 2000, y: 1500 },
				{
					id: 'wl',
					kind: 'wallLamp',
					status: 'existing',
					wall: 1,
					offset: 1000,
					width: 200,
					height: 200,
					elevation: 1700
				}
			]
		};
		const root = buildRoom(room, { ...OPTIONS, electrical: true });
		const lamps = root.userData.lamps as { x: number; y: number; z: number }[];
		expect(lamps).toHaveLength(2);
		const ceiling = lamps.find((lamp) => lamp.y > 2);
		expect(ceiling?.x).toBeCloseTo(2, 5);
		expect(ceiling?.z).toBeCloseTo(-1.5, 5);
		const wall = lamps.find((lamp) => lamp.y < 2);
		expect(wall?.x).toBeCloseTo(1.1, 5);
		expect(wall?.z).toBeLessThan(0);
		expect(wall?.z).toBeGreaterThan(-0.3);
	});
});

describe('shared openings', () => {
	function fixtureMeshes(room: Room, shared?: RoomBuildOptions['shared']): number {
		const root = buildRoom(room, { ...OPTIONS, shared });
		let count = 0;
		root.traverse((object) => {
			if (object instanceof Mesh && object.parent?.name === 'fixtures') count++;
		});
		return count;
	}

	function withDoor(swing: 'in' | 'out'): Room {
		const room = rectangleRoom('r', 4000, 3000);
		room.elements = [
			{
				id: 'door@r',
				kind: 'door',
				status: 'existing',
				wall: 2,
				offset: 1000,
				width: 900,
				height: 2050,
				elevation: 0,
				hinge: 'start',
				swing
			}
		];
		return room;
	}

	it('cuts the hole but builds no leaf for a silent opening', () => {
		const room = withDoor('in');
		const full = fixtureMeshes(room);
		const silent = fixtureMeshes(room, {
			silent: new Set(['door@r']),
			covered: new Set(['door@r'])
		});
		expect(full).toBeGreaterThan(0);
		expect(silent).toBe(0);
		const body = meshes(buildRoom(room, OPTIONS), 'wallBody');
		const silentBody = meshes(
			buildRoom(room, { ...OPTIONS, shared: { silent: new Set(['door@r']), covered: new Set() } }),
			'wallBody'
		);
		const positions = (list: Mesh[]) =>
			list.reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0);
		expect(positions(silentBody)).toBe(positions(body));
	});

	it('moves the reveals of a covered opening behind the neighbour', () => {
		const room = withDoor('out');
		const groups = (covered: string[]) =>
			meshes(
				buildRoom(room, { ...OPTIONS, shared: { silent: new Set(), covered: new Set(covered) } }),
				'wallBody'
			)
				.flatMap((mesh) => mesh.geometry.groups.map((group) => group.materialIndex))
				.filter((index) => index === 3 || index === 4);
		expect(new Set(groups([]))).toEqual(new Set([3]));
		expect(new Set(groups(['door@r']))).toEqual(new Set([4]));
	});
});
