import { describe, expect, it } from 'vitest';
import { roomOrigin, toWorld } from './coords.ts';
import { lRoom, sampleLookup, sampleProject } from '#lib/core/fixtures.ts';
import type { Item, Project } from '#lib/core/schema.ts';
import { buildScene } from './scene.ts';
import { DEFAULT_SCENE_OPTIONS } from './types.ts';
import { collectResources } from './viewer/dispose.ts';

function item(partial: Partial<Item> & Pick<Item, 'id' | 'roomId'>): Item {
	return {
		name: partial.id,
		category: 'other',
		dims: { w: 600, d: 400, h: 800 },
		x: 1000,
		y: 1000,
		rotation: 0,
		elevation: 0,
		...partial
	};
}

function projectWithItems(): Project {
	const base = sampleProject();
	return {
		...base,
		activeVariantId: 'v1',
		variants: [
			{
				id: 'v1',
				name: 'A',
				source: 'user',
				items: [
					item({
						id: 'bed',
						roomId: 'room-rect',
						catalogId: 'ikea-malm-bed-160x200',
						x: 1200,
						y: 1800,
						rotation: 90
					}),
					item({
						id: 'lamp',
						roomId: 'room-rect',
						model: 'floorLamp',
						x: 300,
						y: 300,
						rotation: 0,
						elevation: 100
					}),
					item({ id: 'sofa', roomId: 'room-l', x: 2000, y: 1000, rotation: 180 })
				],
				suggestions: [
					{
						roomId: 'room-rect',
						element: {
							id: 'sugg',
							kind: 'socket',
							status: 'suggested',
							wall: 4,
							offset: 300,
							width: 80,
							height: 80,
							elevation: 300,
							gang: 1,
							usb: false
						}
					}
				]
			},
			{
				id: 'v2',
				name: 'B',
				source: 'user',
				items: [item({ id: 'other', roomId: 'room-rect' })],
				suggestions: []
			}
		]
	};
}

describe('buildScene', () => {
	it('places the items of the active variant', () => {
		const project = projectWithItems();
		const scene = buildScene(
			{ project, roomIds: ['room-rect'] },
			DEFAULT_SCENE_OPTIONS,
			sampleLookup
		);
		expect([...scene.itemObjects.keys()].sort()).toEqual(['bed', 'lamp']);
		const bed = scene.itemObjects.get('bed');
		expect(bed?.userData.itemId).toBe('bed');
		const expected = toWorld({ x: 1200, y: 1800 });
		expect(bed?.position.x).toBeCloseTo(expected.x, 6);
		expect(bed?.position.z).toBeCloseTo(expected.z, 6);
		expect(bed?.rotation.y).toBeCloseTo(Math.PI / 2, 6);
		expect(scene.itemObjects.get('lamp')?.position.y).toBeCloseTo(0.1, 6);
		expect([...scene.roomGroups.keys()]).toEqual(['room-rect']);
	});

	it('uses the requested variant instead of the active one', () => {
		const scene = buildScene(
			{ project: projectWithItems(), roomIds: ['room-rect'], variantId: 'v2' },
			DEFAULT_SCENE_OPTIONS,
			sampleLookup
		);
		expect([...scene.itemObjects.keys()]).toEqual(['other']);
	});

	it('arranges several rooms by board position', () => {
		const project = projectWithItems();
		const scene = buildScene(
			{ project, roomIds: ['room-rect', 'room-l'] },
			DEFAULT_SCENE_OPTIONS,
			sampleLookup
		);
		const lRoomGroup = scene.roomGroups.get('room-l');
		const origin = roomOrigin(lRoom(), true);
		expect(lRoomGroup?.position.x).toBeCloseTo(origin.position.x, 6);
		expect(lRoomGroup?.position.z).toBeCloseTo(origin.position.z, 6);
		expect(scene.itemObjects.size).toBe(3);
		expect(scene.itemObjects.get('sofa')?.parent).toBe(lRoomGroup);
	});

	it('renders suggested elements of the variant', () => {
		const project = projectWithItems();
		const withSuggestions = buildScene(
			{ project, roomIds: ['room-rect'] },
			DEFAULT_SCENE_OPTIONS,
			sampleLookup
		);
		const without = buildScene(
			{ project, roomIds: ['room-rect'], variantId: 'v2' },
			DEFAULT_SCENE_OPTIONS,
			sampleLookup
		);
		const vertices = (root: typeof withSuggestions.root) => {
			let sum = 0;
			root.traverse((object) => {
				const geometry = (
					object as { geometry?: { getAttribute(name: string): { count: number } } }
				).geometry;
				if (geometry && object.userData.part === 'fixture')
					sum += geometry.getAttribute('position').count;
			});
			return sum;
		};
		expect(vertices(withSuggestions.root)).toBeGreaterThan(vertices(without.root));
	});

	it('collects lamp positions in world space', () => {
		const project = projectWithItems();
		const scene = buildScene(
			{ project, roomIds: ['room-rect'] },
			DEFAULT_SCENE_OPTIONS,
			sampleLookup
		);
		const lamps = scene.root.userData.lamps as { x: number; y: number; z: number }[];
		expect(lamps).toHaveLength(1);
		expect(lamps[0].x).toBeCloseTo(0.3, 5);
		expect(lamps[0].z).toBeCloseTo(-0.3, 5);
	});

	it('returns an empty scene for unknown rooms', () => {
		const scene = buildScene(
			{ project: projectWithItems(), roomIds: ['missing'] },
			DEFAULT_SCENE_OPTIONS,
			sampleLookup
		);
		expect(scene.root.children).toHaveLength(0);
		expect(scene.itemObjects.size).toBe(0);
	});

	it('disposes room resources but leaves the shared furniture resources alone', () => {
		const project = projectWithItems();
		const scene = buildScene(
			{ project, roomIds: ['room-rect', 'room-l'] },
			{ ...DEFAULT_SCENE_OPTIONS, ceiling: true },
			sampleLookup
		);
		const furniture = new Set<{ addEventListener(type: 'dispose', listener: () => void): void }>();
		for (const holder of scene.itemObjects.values()) {
			const { geometries, materials } = collectResources(holder);
			for (const resource of [...geometries, ...materials]) furniture.add(resource);
		}
		const rooms = new Set<{ addEventListener(type: 'dispose', listener: () => void): void }>();
		for (const group of scene.roomGroups.values()) {
			const { geometries, materials } = collectResources(group.children[0]);
			for (const resource of [...geometries, ...materials]) rooms.add(resource);
		}
		expect(rooms.size).toBeGreaterThan(10);
		let roomDisposed = 0;
		let furnitureDisposed = 0;
		for (const resource of rooms) resource.addEventListener('dispose', () => roomDisposed++);
		for (const resource of furniture)
			resource.addEventListener('dispose', () => furnitureDisposed++);
		scene.dispose();
		expect(roomDisposed).toBe(rooms.size);
		expect(furnitureDisposed).toBe(0);
		expect(scene.root.parent).toBeNull();
	});
});
