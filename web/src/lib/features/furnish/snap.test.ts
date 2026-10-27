import { describe, expect, it } from 'vitest';
import { createElement } from '#lib/core/defaults.ts';
import { convexOverlap, footprint, walls } from '#lib/core/geometry.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import { rectangleRoom } from '#lib/core/fixtures.ts';
import type { Item } from '#lib/core/schema.ts';
import {
	angleDiff,
	computePlacement,
	defaultWallElevation,
	descendantsOf,
	findCarrier,
	findFreeSpot,
	fixtureAreas,
	snapRotation,
	stackOn,
	type PlaceSubject
} from './snap.ts';

const room = { ...rectangleRoom(), elements: [] };

function item(partial: Partial<Item> & { id: string }): Item {
	return {
		roomId: room.id,
		name: partial.id,
		category: 'table',
		mount: 'floor',
		dims: { w: 1000, d: 600, h: 740 },
		x: 2000,
		y: 1500,
		rotation: 0,
		elevation: 0,
		...partial
	};
}

const sofa: PlaceSubject = {
	dims: { w: 2000, d: 900, h: 800 },
	mount: 'floor',
	category: 'sofa',
	rotation: 0,
	elevation: 0
};

describe('angleDiff', () => {
	it('wraps to the shortest signed difference', () => {
		expect(angleDiff(10, 350)).toBe(20);
		expect(angleDiff(350, 10)).toBe(-20);
		expect(angleDiff(180, 0)).toBe(-180);
	});
});

describe('snapRotation', () => {
	const context = { walls: walls(room.polygon), itemRotations: [] };
	it('snaps to 15 degree steps within the capture range', () => {
		expect(snapRotation(43, context)).toEqual({ rotation: 45, kind: 'step' });
		expect(snapRotation(37, context).kind).toBeNull();
	});
	it('snaps parallel to walls and other items', () => {
		expect(snapRotation(93, context).rotation).toBe(90);
		const tilted = { walls: [], itemRotations: [33] };
		expect(snapRotation(36, tilted)).toEqual({ rotation: 33, kind: 'item' });
		expect(snapRotation(125, tilted).rotation).toBe(123);
	});
});

describe('computePlacement against walls', () => {
	const context = { room, others: [], threshold: 100 };

	it('puts the back flush against the nearest wall and rotates towards it', () => {
		const result = computePlacement({ ...sofa, rotation: 20 }, { x: 2000, y: 520 }, context);
		expect(result.rotation).toBe(0);
		expect(result.y).toBe(450);
		expect(result.snapped).toBe(true);
	});

	it('rotates the back to the right-hand wall', () => {
		const result = computePlacement(
			{ ...sofa, rotation: 60 },
			{ x: 3500, y: 1500 },
			{ ...context, threshold: 300 }
		);
		expect(result.rotation).toBe(90);
		expect(result.x).toBe(4000 - 450);
	});

	it('snaps flush to a second wall in a corner', () => {
		const result = computePlacement(sofa, { x: 1060, y: 480 }, context);
		expect(result.x).toBe(1000);
		expect(result.y).toBe(450);
	});

	it('does not move in open space', () => {
		const result = computePlacement(sofa, { x: 2000, y: 1500 }, context);
		expect(result).toMatchObject({ x: 2000, y: 1500, rotation: 0, snapped: false, inside: true });
	});

	it('keeps items inside the room', () => {
		const result = computePlacement(sofa, { x: 9000, y: 9000 }, context);
		expect(result.inside).toBe(true);
	});

	it('mounts wall items to the wall with the stored height', () => {
		const picture: PlaceSubject = {
			dims: { w: 600, d: 30, h: 800 },
			mount: 'wall',
			category: 'picture',
			rotation: 0,
			elevation: 1100
		};
		const result = computePlacement(picture, { x: 2000, y: 2800 }, context);
		expect(result.rotation).toBe(180);
		expect(result.y).toBe(3000 - 15);
		expect(result.elevation).toBe(1100);
	});

	it('hangs ceiling items from the ceiling', () => {
		const lamp: PlaceSubject = {
			dims: { w: 400, d: 400, h: 300 },
			mount: 'ceiling',
			category: 'lamp',
			rotation: 0,
			elevation: 0
		};
		expect(computePlacement(lamp, { x: 2000, y: 1500 }, context).elevation).toBe(2200);
	});
});

describe('computePlacement against items', () => {
	const table = item({ id: 'table', x: 2000, y: 1500 });
	const context = { room, others: [table], threshold: 80 };
	const chair: PlaceSubject = {
		dims: { w: 450, d: 450, h: 900 },
		mount: 'floor',
		category: 'chair',
		rotation: 0,
		elevation: 0
	};

	it('touches the edge of another item', () => {
		const result = computePlacement(chair, { x: 2000 + 500 + 225 + 40, y: 1500 }, context);
		expect(result.x).toBe(2000 + 500 + 225);
		expect(result.guides.length).toBeGreaterThan(0);
	});

	it('aligns edges', () => {
		const result = computePlacement(
			chair,
			{ x: 2000 + 500 + 225 + 40, y: 1500 + 300 - 225 + 30 },
			context
		);
		expect(result.y).toBe(1500 + 300 - 225);
	});

	it('does not snap to rotated items', () => {
		const turned = item({ id: 'turned', rotation: 40 });
		const result = computePlacement(chair, { x: 2740, y: 1500 }, { ...context, others: [turned] });
		expect(result.x).toBe(2740);
	});
});

describe('stacking', () => {
	const desk = item({
		id: 'desk',
		category: 'desk',
		dims: { w: 1600, d: 800, h: 740 },
		x: 2000,
		y: 1500
	});
	const monitor: PlaceSubject = {
		dims: { w: 615, d: 200, h: 450 },
		mount: 'on-top',
		category: 'electronics',
		rotation: 0,
		elevation: 0
	};

	it('finds the carrier under the point', () => {
		expect(findCarrier({ x: 2100, y: 1500 }, monitor, [desk], 2500)?.id).toBe('desk');
		expect(findCarrier({ x: 3500, y: 1500 }, monitor, [desk], 2500)).toBeUndefined();
	});

	it('does not stack floor furniture such as chairs or things that do not fit', () => {
		const chair: PlaceSubject = {
			...monitor,
			mount: 'floor',
			category: 'chair',
			dims: { w: 450, d: 450, h: 900 }
		};
		expect(findCarrier({ x: 2000, y: 1500 }, chair, [desk], 2500)).toBeUndefined();
		const lamp: PlaceSubject = {
			...monitor,
			mount: 'floor',
			category: 'lamp',
			dims: { w: 300, d: 300, h: 400 }
		};
		expect(findCarrier({ x: 2000, y: 1500 }, lamp, [desk], 2500)?.id).toBe('desk');
		const huge: PlaceSubject = { ...monitor, dims: { w: 2400, d: 200, h: 100 } };
		expect(findCarrier({ x: 2000, y: 1500 }, huge, [desk], 2500)).toBeUndefined();
	});

	it('does not stack through the ceiling', () => {
		expect(findCarrier({ x: 2000, y: 1500 }, monitor, [desk], 1000)).toBeUndefined();
	});

	it('places on the surface and keeps the item within the carrier', () => {
		const spot = stackOn(desk, monitor, { x: 2790, y: 1500 });
		expect(spot).toEqual({ x: 2493, y: 1500, elevation: 740 });
		const result = computePlacement(
			monitor,
			{ x: 2000, y: 1500 },
			{ room, others: [desk], threshold: 80 }
		);
		expect(result).toMatchObject({ onItemId: 'desk', elevation: 740 });
	});

	it('returns to the floor when no carrier is under the item', () => {
		const result = computePlacement(
			{ ...monitor, onItemId: 'desk', elevation: 740 },
			{ x: 500, y: 2500 },
			{ room, others: [desk], threshold: 80 }
		);
		expect(result.onItemId).toBeUndefined();
		expect(result.elevation).toBe(0);
	});

	it('lists everything stacked on an item', () => {
		const a = item({ id: 'a', onItemId: 'desk' });
		const b = item({ id: 'b', onItemId: 'a' });
		expect(descendantsOf([desk, a, b], 'desk').map((i) => i.id)).toEqual(['a', 'b']);
	});
});

describe('defaults', () => {
	it('hangs wall items at 1.5 m centre height and tall curtains from the ceiling', () => {
		expect(defaultWallElevation(800, 2500)).toBe(1100);
		expect(defaultWallElevation(2300, 2500)).toBe(200);
		expect(defaultWallElevation(100, 300)).toBe(200);
	});

	it('finds a free spot that avoids existing furniture', () => {
		const blocker = item({ id: 'big', dims: { w: 2400, d: 1600, h: 700 }, x: 2000, y: 1500 });
		const spot = findFreeSpot(room, [blocker], { w: 600, d: 600 });
		expect(spot).toBeDefined();
		expect(findFreeSpot(room, [blocker], { w: 3900, d: 2900 })).toBeUndefined();
	});

	it('keeps a new piece off columns and out of the zone in front of a stove', () => {
		const withFixtures = rectangleRoom();
		const ids = sequentialIds('f');
		const stove = createElement('stove', withFixtures, 1, 2000, ids);
		withFixtures.elements = [stove];
		const areas = fixtureAreas(withFixtures);
		expect(areas).toHaveLength(2);
		const spot = findFreeSpot(withFixtures, [], { w: 600, d: 600 }, 0, { x: 2000, y: 600 }, areas)!;
		const shape = footprint({ ...spot, rotation: 0, dims: { w: 600, d: 600 } });
		expect(areas.some((area) => convexOverlap(shape, area, 2))).toBe(false);
	});
});

describe('kitchen placement', () => {
	const hob: PlaceSubject = {
		dims: { w: 600, d: 520, h: 50 },
		mount: 'on-top',
		category: 'kitchen',
		model: 'hob',
		rotation: 0,
		elevation: 0
	};
	const base = item({
		id: 'base',
		category: 'kitchen',
		model: 'kitchenBase',
		dims: { w: 600, d: 600, h: 900 }
	});

	it('hangs wall cabinets at the upper cabinet height', () => {
		expect(defaultWallElevation(700, 2500, 'kitchenWall')).toBe(1450);
		expect(defaultWallElevation(700, 2000, 'kitchenWall')).toBe(1300);
		expect(defaultWallElevation(700, 2500)).toBe(1150);
	});

	it('puts a hob on a base cabinet and never on other furniture', () => {
		expect(findCarrier({ x: 2000, y: 1500 }, hob, [base], 2500)?.id).toBe('base');
		const table = item({ id: 'table' });
		expect(findCarrier({ x: 2000, y: 1500 }, hob, [table], 2500)).toBeUndefined();
		const placed = computePlacement(
			hob,
			{ x: 2000, y: 1500 },
			{
				room,
				others: [base],
				threshold: 60
			}
		);
		expect(placed.onItemId).toBe('base');
		expect(placed.elevation).toBe(900);
	});
});
