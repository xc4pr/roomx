import { Box3, Mesh, Vector3, type BufferGeometry, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { createElement } from '#lib/core/defaults.ts';
import { rectangleRoom } from '#lib/core/fixtures.ts';
import type {
	ElementKind,
	FreeElement,
	KitchenRun,
	Room,
	RoomElement,
	WallElement
} from '#lib/core/schema.ts';
import { DEFAULT_SCENE_OPTIONS } from '../types.ts';
import { buildRoom } from './index.ts';

const OPTIONS = { ...DEFAULT_SCENE_OPTIONS, wallHeightFactor: 1 };
const TOLERANCE = 0.0015;
const ELEMENT_BUDGET = 400;
const KITCHEN_BUDGET = 2500;

let counter = 0;
const newId = () => `e-${++counter}`;

function roomWith(...elements: RoomElement[]): Room {
	return { ...rectangleRoom(), elements };
}

function triangles(geometry: BufferGeometry): number {
	return (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
}

function group(root: Object3D, name: string): Object3D {
	const found = root.getObjectByName(name);
	if (!found) throw new Error(`no ${name}`);
	return found;
}

function stats(object: Object3D) {
	object.updateMatrixWorld(true);
	let count = 0;
	let meshes = 0;
	object.traverse((node) => {
		if (!(node instanceof Mesh)) return;
		meshes++;
		count += triangles(node.geometry);
	});
	return { triangles: count, meshes, box: new Box3().setFromObject(object) };
}

function wallStats(room: Room, wall: number) {
	const root = buildRoom(room, OPTIONS);
	return stats(group(root, `wall-${wall}`).getObjectByName('fixtures') as Object3D);
}

function freeStats(room: Room) {
	return stats(group(buildRoom(room, OPTIONS), 'freeElements'));
}

function wallElement(kind: ElementKind, along = 2000): WallElement {
	return createElement(kind, rectangleRoom(), 1, along, newId) as WallElement;
}

function freeElement(kind: ElementKind): FreeElement {
	const element = createElement(kind, rectangleRoom(), 1, 2000, newId);
	return { ...element, x: 2000, y: 1500, rotation: 0 } as FreeElement;
}

describe('sanitary and climate elements in 3D', () => {
	const kinds = ['washbasin', 'toilet', 'shower', 'bathtub', 'acWall'] as const;
	for (const kind of kinds) {
		it(`${kind} stays inside its footprint and budget`, () => {
			const element = wallElement(kind) as WallElement & { depth: number };
			const { box, triangles: count, meshes } = wallStats(roomWith(element), 1);
			expect(meshes).toBeGreaterThan(0);
			expect(count).toBeLessThanOrEqual(ELEMENT_BUDGET);
			expect(box.min.x).toBeGreaterThanOrEqual(element.offset / 1000 - TOLERANCE);
			expect(box.max.x).toBeLessThanOrEqual((element.offset + element.width) / 1000 + TOLERANCE);
			expect(box.min.z).toBeGreaterThanOrEqual(-element.depth / 1000 - TOLERANCE);
			expect(box.max.z).toBeLessThanOrEqual(TOLERANCE);
			expect(box.min.y).toBeGreaterThanOrEqual(element.elevation / 1000 - TOLERANCE);
		});
	}

	it('glazes a shower only on the open sides', () => {
		const base = wallElement('shower', 2000);
		if (base.kind !== 'shower') throw new Error('shower');
		const plain = wallStats(roomWith({ ...base, screen: false }), 1);
		const open = wallStats(roomWith({ ...base, screen: true }), 1);
		const corner = wallStats(roomWith({ ...base, screen: true, offset: 0 }), 1);
		expect(open.triangles - plain.triangles).toBeGreaterThan(corner.triangles - plain.triangles);
		expect(corner.triangles).toBeGreaterThan(plain.triangles);
		const both = wallStats(roomWith({ ...base, screen: true, offset: 0, width: 4000 }), 1);
		expect(both.box.max.x).toBeLessThanOrEqual(4.001);
	});

	it('keeps the glass of a shower transparent', () => {
		const base = wallElement('shower');
		if (base.kind !== 'shower') throw new Error('shower');
		const root = buildRoom(roomWith({ ...base, screen: true }), OPTIONS);
		const materials: number[] = [];
		group(root, 'wall-1')
			.getObjectByName('fixtures')
			?.traverse((node) => {
				if (node instanceof Mesh && !Array.isArray(node.material)) {
					materials.push(node.material.opacity);
				}
			});
		expect(materials.some((opacity) => opacity < 1)).toBe(true);
	});
});

describe('kitchen run in 3D', () => {
	function run(modules: KitchenRun['modules'], upper = true): KitchenRun {
		const base = wallElement('kitchenRun') as KitchenRun;
		return {
			...base,
			offset: 0,
			width: 3600,
			modules,
			...(upper ? { upper: { depth: 350, height: 700, elevation: 1450 } } : {})
		};
	}
	const all: KitchenRun['modules'] = [
		{ id: 'm1', kind: 'tall', width: 600, appliances: ['fridge'] },
		{ id: 'm2', kind: 'sink', width: 800 },
		{ id: 'm3', kind: 'dishwasher', width: 600 },
		{ id: 'm4', kind: 'hob', width: 600, appliances: ['oven'] },
		{ id: 'm5', kind: 'tall', width: 600, appliances: ['oven', 'microwave'] },
		{ id: 'm6', kind: 'table', width: 400 }
	];

	it('stays within the footprint and budget with every module kind', () => {
		const element = run(all);
		const { box, triangles: count } = wallStats(roomWith(element), 1);
		expect(count).toBeLessThanOrEqual(KITCHEN_BUDGET);
		expect(box.min.x).toBeGreaterThanOrEqual(-TOLERANCE);
		expect(box.max.x).toBeLessThanOrEqual(3.6 + TOLERANCE);
		expect(box.min.z).toBeGreaterThanOrEqual(-0.6 - TOLERANCE);
		expect(box.max.y).toBeLessThanOrEqual(2.15 + TOLERANCE);
	});

	it('leaves the worktop out above tall modules and tables', () => {
		const withTall = wallStats(roomWith(run(all, false)), 1);
		const plain = wallStats(roomWith(run([{ id: 'm1', kind: 'base', width: 3600 }], false)), 1);
		expect(withTall.box.max.y).toBeCloseTo(2.1, 3);
		expect(plain.box.max.y).toBeLessThan(1.0);
	});

	it('adds a hood only when there are upper cabinets', () => {
		const modules: KitchenRun['modules'] = [{ id: 'm1', kind: 'hob', width: 600 }];
		const without = wallStats(roomWith(run(modules, false)), 1);
		const withUpper = wallStats(roomWith(run(modules, true)), 1);
		expect(without.box.max.y).toBeLessThan(1);
		expect(withUpper.box.max.y).toBeCloseTo(2.15, 3);
	});

	it('draws a bare run as base cabinets', () => {
		const { triangles: count, box } = wallStats(roomWith(run([], false)), 1);
		expect(count).toBeGreaterThan(0);
		expect(box.max.y).toBeCloseTo(0.9, 3);
	});

	it('stays small for the default run', () => {
		const { triangles: count } = wallStats(roomWith(wallElement('kitchenRun')), 1);
		expect(count).toBeLessThanOrEqual(KITCHEN_BUDGET);
	});
});

describe('free elements in 3D', () => {
	const sized = ['column', 'freeObstacle', 'fireplace', 'tiledStove', 'acFloor'] as const;
	for (const kind of sized) {
		it(`${kind} fills its footprint within budget`, () => {
			const element = freeElement(kind);
			const { box, triangles: count } = freeStats(roomWith(element));
			expect(count).toBeGreaterThan(0);
			expect(count).toBeLessThanOrEqual(ELEMENT_BUDGET);
			const size = box.getSize(new Vector3());
			expect(size.x).toBeLessThanOrEqual(element.width / 1000 + TOLERANCE);
			expect(size.z).toBeLessThanOrEqual(element.depth / 1000 + TOLERANCE);
			expect(size.x).toBeGreaterThan(element.width / 1000 - 0.05);
			expect(box.min.y).toBeCloseTo(element.elevation / 1000, 3);
		});
	}

	it('turns with the rotation and puts the front towards +y at 0', () => {
		const element = { ...freeElement('fireplace'), x: 2000, y: 1500 };
		const front = freeStats(roomWith(element)).box;
		expect(front.min.z).toBeLessThan(-1.5);
		expect(front.getCenter(new Vector3()).x).toBeCloseTo(2, 2);
		const turned = freeStats(roomWith({ ...element, rotation: 90 })).box;
		expect(turned.getSize(new Vector3()).x).toBeCloseTo(element.depth / 1000, 2);
		expect(turned.getSize(new Vector3()).z).toBeCloseTo(element.width / 1000, 2);
	});

	it('lets a column reach the ceiling', () => {
		const { box } = freeStats(roomWith(freeElement('column')));
		expect(box.max.y).toBeCloseTo(2.5, 3);
		const square = freeElement('column');
		if (square.kind !== 'column') throw new Error('column');
		const squared = freeStats(
			roomWith({ ...square, shape: 'square', toCeiling: false, height: 1200 })
		);
		expect(squared.box.max.y).toBeCloseTo(1.2, 3);
	});

	it('runs the flue of a stove up to the ceiling', () => {
		const element = freeElement('stove');
		const { box, triangles: count } = freeStats(roomWith(element));
		expect(box.max.y).toBeCloseTo(2.5, 3);
		expect(count).toBeLessThanOrEqual(ELEMENT_BUDGET);
	});

	it('adds a bench to a wide tiled stove only', () => {
		const stove = freeElement('tiledStove');
		const narrow = freeStats(roomWith({ ...stove, width: 1200 }));
		const wide = freeStats(roomWith({ ...stove, width: 2000 }));
		expect(wide.triangles).toBeGreaterThan(narrow.triangles);
		expect(wide.triangles).toBeLessThanOrEqual(ELEMENT_BUDGET);
	});

	it('keeps a room without new elements unchanged', () => {
		const root = buildRoom({ ...rectangleRoom(), elements: [] }, OPTIONS);
		expect(group(root, 'freeElements').children).toHaveLength(0);
	});
});
