import { Box3, Mesh, Raycaster, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { lRoom, rectangleRoom } from '#lib/core/fixtures.ts';
import { areaMm2, ceilingHeightAt, wallHeightAt } from '#lib/core/geometry.ts';
import type { Room, Slope } from '#lib/core/schema.ts';
import { DEFAULT_SCENE_OPTIONS, type RoomBuildOptions } from '../types.ts';
import { wallFrames } from './frames.ts';
import { applyWallHeight, buildRoom, setCeilingShown, wallGroups } from './index.ts';
import { profileTop, wallProfile } from './profile.ts';
import { roofEdges, roofSurface } from './roof.ts';

const OPTIONS: RoomBuildOptions = {
	...DEFAULT_SCENE_OPTIONS,
	electrical: false,
	wallHeightFactor: 1
};

function sloped(room: Room, slopes: Slope[]): Room {
	return { ...room, elements: [], slopes };
}

function profileOf(room: Room, wall: number): [number, number][] {
	const frame = wallFrames(room.polygon).find((candidate) => candidate.number === wall);
	if (!frame) throw new Error('no wall');
	return wallProfile(room, frame).map((point) => [Math.round(point.u), Math.round(point.h)]);
}

function meshes(root: Object3D, part: string): Mesh[] {
	const found: Mesh[] = [];
	root.traverse((object) => {
		if (object instanceof Mesh && object.userData.part === part) found.push(object);
	});
	return found;
}

const SINGLE: Slope[] = [{ wall: 1, kneeHeight: 1000, angle: 45 }];
const GABLE: Slope[] = [
	{ wall: 1, kneeHeight: 1000, angle: 45 },
	{ wall: 3, kneeHeight: 1000, angle: 45 }
];

describe('wall profile', () => {
	it('lets a rectangular room with one slope follow the ceiling', () => {
		const room = sloped(rectangleRoom(), SINGLE);
		expect(profileOf(room, 1)).toEqual([
			[0, 1000],
			[4000, 1000]
		]);
		expect(profileOf(room, 2)).toEqual([
			[0, 1000],
			[1500, 2500],
			[3000, 2500]
		]);
		expect(profileOf(room, 3)).toEqual([
			[0, 2500],
			[4000, 2500]
		]);
		expect(profileOf(room, 4)).toEqual([
			[0, 2500],
			[1500, 2500],
			[3000, 1000]
		]);
	});

	it('meets at the ridge of a gable roof without a flat part', () => {
		const room = sloped(rectangleRoom(), GABLE);
		expect(profileOf(room, 2)).toEqual([
			[0, 1000],
			[1500, 2500],
			[3000, 1000]
		]);
		expect(profileOf(room, 4)).toEqual([
			[0, 1000],
			[1500, 2500],
			[3000, 1000]
		]);
	});

	it('keeps a flat middle part between two slopes', () => {
		const room = sloped(rectangleRoom('wide', 4000, 4000), GABLE);
		expect(profileOf(room, 2)).toEqual([
			[0, 1000],
			[1500, 2500],
			[2500, 2500],
			[4000, 1000]
		]);
	});

	it('finds the crossing of two shallow slopes below the ceiling', () => {
		const shallow: Slope[] = GABLE.map((slope) => ({ ...slope, angle: 30 }));
		const room = sloped(rectangleRoom(), shallow);
		expect(profileOf(room, 2)).toEqual([
			[0, 1000],
			[1500, 1866],
			[3000, 1000]
		]);
	});

	it('matches the ceiling height along every wall of an L room', () => {
		const slopes: Slope[] = [
			{ wall: 1, kneeHeight: 900, angle: 40 },
			{ wall: 5, kneeHeight: 1200, angle: 30 },
			{ wall: 6, kneeHeight: 1000, angle: 50 }
		];
		const room = sloped(lRoom(), slopes);
		for (const frame of wallFrames(room.polygon)) {
			const profile = wallProfile(room, frame);
			expect(profile[0].u).toBe(0);
			expect(profile.at(-1)?.u).toBeCloseTo(frame.length, 6);
			for (let step = 0; step <= 80; step++) {
				const along = (frame.length * step) / 80;
				expect(
					Math.abs(profileTop(profile, along) - wallHeightAt(room, frame.number, along))
				).toBeLessThan(1);
			}
		}
		expect(profileOf(room, 2)[0][1]).toBe(900);
	});
});

describe('sloped room geometry', () => {
	it('keeps a knee wall at or below its knee height', () => {
		const root = buildRoom(sloped(rectangleRoom(), SINGLE), OPTIONS);
		root.updateMatrixWorld(true);
		const [first, second, third] = wallGroups(root);
		const top = (group: Object3D) => {
			const box = new Box3();
			for (const mesh of meshes(group, 'wallBody')) box.expandByObject(mesh);
			return box.max.y;
		};
		expect(top(first)).toBeLessThanOrEqual(1.0 + 1e-6);
		expect(top(first)).toBeGreaterThan(0.99);
		expect(top(second)).toBeCloseTo(2.5, 5);
		expect(top(third)).toBeCloseTo(2.5, 5);
	});

	it('cuts the gable wall at the roof line and keeps openings', () => {
		const room: Room = {
			...rectangleRoom(),
			slopes: SINGLE,
			elements: [
				{
					id: 'd',
					kind: 'door',
					status: 'existing',
					wall: 2,
					offset: 100,
					width: 800,
					height: 900,
					elevation: 0,
					hinge: 'start',
					swing: 'in'
				},
				{
					id: 'w',
					kind: 'window',
					status: 'existing',
					wall: 2,
					offset: 1600,
					width: 800,
					height: 1000,
					elevation: 800,
					windowType: 'fixed'
				}
			]
		};
		const root = buildRoom(room, OPTIONS);
		root.updateMatrixWorld(true);
		const bodies = meshes(wallGroups(root)[1], 'wallBody');
		const shoot = (u: number, height: number) =>
			new Raycaster(new Vector3(3, height, -u), new Vector3(1, 0, 0)).intersectObjects(
				bodies,
				false
			).length;
		expect(shoot(0.5, 0.5)).toBe(0);
		expect(shoot(0.5, 1.2)).toBeGreaterThan(0);
		expect(shoot(0.5, 1.7)).toBe(0);
		expect(shoot(2.0, 1.2)).toBe(0);
		expect(shoot(2.0, 0.4)).toBeGreaterThan(0);
		expect(shoot(2.0, 2.2)).toBeGreaterThan(0);
		expect(shoot(2.0, 2.6)).toBe(0);
	});

	it('scales the whole profile with the wall height factor', () => {
		const root = buildRoom(sloped(rectangleRoom(), SINGLE), OPTIONS);
		const [, gable] = wallGroups(root);
		applyWallHeight(gable, 0.5);
		root.updateMatrixWorld(true);
		const box = new Box3();
		for (const mesh of meshes(gable, 'wallBody')) box.expandByObject(mesh);
		expect(box.max.y).toBeCloseTo(1.25, 5);
	});

	it.each([
		['single slope', SINGLE, 'rect'],
		['gable', GABLE, 'rect'],
		['gable with flat middle', GABLE, 'wide'],
		[
			'L room',
			[
				{ wall: 1, kneeHeight: 900, angle: 40 },
				{ wall: 5, kneeHeight: 1200, angle: 30 }
			],
			'l'
		]
	] as const)('puts every roof vertex on the ceiling height: %s', (_name, slopes, kind) => {
		const base =
			kind === 'l'
				? lRoom()
				: kind === 'wide'
					? rectangleRoom('wide', 4000, 4000)
					: rectangleRoom();
		const room = sloped(base, [...slopes]);
		const root = buildRoom(room, OPTIONS);
		let vertices = 0;
		for (const part of ['ceiling', 'slope']) {
			for (const mesh of meshes(root, part)) {
				const position = mesh.geometry.getAttribute('position');
				for (let i = 0; i < position.count; i++) {
					const point = { x: position.getX(i) * 1000, y: -position.getZ(i) * 1000 };
					expect(Math.abs(position.getY(i) * 1000 - ceilingHeightAt(room, point))).toBeLessThan(1);
					vertices++;
				}
			}
		}
		expect(vertices).toBeGreaterThan(0);
		const surface = roofSurface(room);
		const projected = [...surface.flat, ...surface.sloped].reduce(
			(sum, [a, b, c]) => sum + Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2,
			0
		);
		expect(projected).toBeCloseTo(areaMm2(room.polygon), 0);
	});

	it('draws ridge lines only where a slope meets the ceiling', () => {
		expect(roofEdges(sloped(rectangleRoom(), SINGLE))).toHaveLength(1);
		const [edge] = roofEdges(sloped(rectangleRoom(), SINGLE));
		expect(edge.from.h).toBeCloseTo(2500, 3);
		expect(Math.abs(edge.from.y - 1500)).toBeLessThan(1e-6);
		expect(Math.abs(edge.to.x - edge.from.x)).toBeCloseTo(4000, 3);
	});

	it('shows slopes solid with the ceiling and as ghost without it', () => {
		const room = sloped(rectangleRoom(), SINGLE);
		const root = buildRoom(room, { ...OPTIONS, ceiling: false });
		const state = () => ({
			ceiling: meshes(root, 'ceiling').every((mesh) => mesh.visible),
			slope: meshes(root, 'slope').every((mesh) => mesh.visible),
			ghost: meshes(root, 'slopeGhost').every((mesh) => mesh.visible)
		});
		expect(state()).toEqual({ ceiling: false, slope: false, ghost: true });
		setCeilingShown(root, true);
		expect(state()).toEqual({ ceiling: true, slope: true, ghost: false });
	});

	it('hangs a ceiling lamp at the ceiling height of its position', () => {
		const room: Room = {
			...rectangleRoom(),
			slopes: SINGLE,
			elements: [{ id: 'l', kind: 'ceilingLamp', status: 'existing', x: 2000, y: 500 }]
		};
		const root = buildRoom(room, { ...OPTIONS, electrical: true });
		const lamps = root.userData.lamps as { y: number }[];
		expect(lamps[0].y).toBeCloseTo((1500 - 120) / 1000, 5);
	});

	it('builds a room without slopes like before', () => {
		const plain = buildRoom({ ...rectangleRoom(), slopes: undefined }, OPTIONS);
		const empty = buildRoom({ ...rectangleRoom(), slopes: [] }, OPTIONS);
		const positions = (root: Object3D) =>
			meshes(root, 'wallBody').map((mesh) => [...mesh.geometry.getAttribute('position').array]);
		expect(positions(empty)).toEqual(positions(plain));
		expect(meshes(plain, 'slope')).toHaveLength(0);
		expect(meshes(plain, 'ceiling')).toHaveLength(1);
	});
});
