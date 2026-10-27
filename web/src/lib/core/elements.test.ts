import { describe, expect, it } from 'vitest';
import { checkRoomItems, validateRoom } from './checks.ts';
import { createElement, createRoom, defaultKitchenModules } from './defaults.ts';
import {
	clearanceZone,
	elementFitsRoom,
	elementVolumes,
	freeElementTop,
	groupsForRoom,
	kindAvailable,
	kitchenModuleSpans,
	kitchenUpperSpans
} from './elements.ts';
import {
	ceilingHeightAt,
	roofWindowPlacement,
	slopeAngleFromDepth,
	slopeContours,
	slopeDormers,
	slopeRun,
	wallHeightAt
} from './geometry.ts';
import type { Item, KitchenRun, Room, RoomElement } from './schema.ts';

let counter = 0;
const newId = () => `id-${++counter}`;

function room(patch: Partial<Room> = {}): Room {
	return { ...createRoom('r', 'Raum', 'living'), ...patch };
}

function item(patch: Partial<Item>): Item {
	return {
		id: 'i',
		roomId: 'r',
		name: 'Kommode',
		category: 'dresser',
		dims: { w: 800, d: 400, h: 800 },
		x: 2000,
		y: 1500,
		rotation: 0,
		elevation: 0,
		...patch
	};
}

describe('palette groups by room type', () => {
	it('shows sanitary only in the bath and kitchen only with a built-in kitchen', () => {
		expect(groupsForRoom(room({ type: 'bath' }))).toEqual([
			'openings',
			'electrical',
			'climate',
			'sanitary',
			'obstacles'
		]);
		expect(groupsForRoom(room({ type: 'kitchen' }))).toContain('kitchen');
		expect(groupsForRoom(room({ type: 'living' }))).not.toContain('kitchen');
		expect(groupsForRoom(room({ type: 'living', kitchen: { open: true } }))).toContain('kitchen');
		expect(
			groupsForRoom(room({ type: 'kitchen', kitchen: { mode: 'catalog' } }))
		).not.toContain('kitchen');
		expect(groupsForRoom(room({ type: 'bedroom', kitchen: { open: true } }))).not.toContain(
			'kitchen'
		);
	});

	it('offers only free elements outdoors and a ceiling lamp only under a cover', () => {
		const terrace = room({ type: 'terrace' });
		expect(kindAvailable(terrace, 'column')).toBe(true);
		expect(kindAvailable(terrace, 'door')).toBe(false);
		expect(kindAvailable(terrace, 'ceilingLamp')).toBe(false);
		const covered = room({
			type: 'terrace',
			cover: { polygon: terrace.polygon, height: 2600 }
		});
		expect(kindAvailable(covered, 'ceilingLamp')).toBe(true);
		expect(kindAvailable(room({ type: 'winterGarden' }), 'door')).toBe(true);
	});

	it('offers a roof window only in a room with a slope', () => {
		expect(kindAvailable(room(), 'roofWindow')).toBe(false);
		expect(
			kindAvailable(room({ slopes: [{ id: 's', wall: 1, kneeHeight: 800, angle: 40 }] }), 'roofWindow')
		).toBe(true);
	});

	it('keeps elements on a change of room type and marks them', () => {
		const bath = room({ type: 'bath' });
		bath.elements = [createElement('toilet', bath, 1, 1000, newId)];
		const office: Room = { ...bath, type: 'office' };
		expect(office.elements).toHaveLength(1);
		expect(elementFitsRoom(office, office.elements[0])).toBe(false);
		expect(groupsForRoom(office)).toContain('sanitary');
		expect(validateRoom(office).map((issue) => issue.code)).toEqual(['elementNotForRoomType']);
		expect(validateRoom(bath)).toEqual([]);
	});
});

describe('kitchen run', () => {
	const kitchen = room({ type: 'kitchen' });

	it('fills the run with the grid width and lays modules side by side', () => {
		const run = createElement('kitchenRun', kitchen, 1, 2000, newId) as KitchenRun;
		expect(run.width).toBe(2200);
		expect(run.modules.map((module) => [module.kind, module.width])).toEqual([
			['sink', 550],
			['dishwasher', 550],
			['base', 550],
			['hob', 550]
		]);
		expect(defaultKitchenModules(1300, 'euro', newId).map((module) => module.width)).toEqual([
			600, 600
		]);
		const spans = kitchenModuleSpans({ ...run, width: 1500 });
		expect(spans.map((span) => [span.from, span.to])).toEqual([
			[0, 550],
			[550, 1100],
			[1100, 1500]
		]);
	});

	it('has base, tall and upper volumes, and upper cabinets skip tall modules', () => {
		const run: KitchenRun = {
			...(createElement('kitchenRun', kitchen, 1, 2000, newId) as KitchenRun),
			offset: 0,
			width: 3000,
			modules: [
				{ id: 'a', kind: 'tall', width: 600, appliances: ['fridge'] },
				{ id: 'b', kind: 'sink', width: 600 },
				{ id: 'c', kind: 'table', width: 800 }
			],
			upper: { depth: 350, height: 700, elevation: 1450 }
		};
		expect(kitchenUpperSpans(run)).toEqual([{ from: 600, to: 3000 }]);
		const volumes = elementVolumes(kitchen, run).map((volume) => [
			Math.round(volume.shape[0].x),
			Math.round(volume.shape[1].x),
			volume.bottom,
			volume.top
		]);
		expect(volumes).toEqual([
			[0, 600, 0, 2100],
			[600, 1200, 0, 900],
			[1200, 2000, 860, 900],
			[2000, 3000, 0, 900],
			[600, 3000, 1450, 2150]
		]);
	});
});

describe('fixtures and furniture', () => {
	it('reports furniture inside a bath fixture, a column or a free obstacle', () => {
		const bath = room({ type: 'bath' });
		bath.elements = [
			{ ...(createElement('bathtub', bath, 1, 1000, newId) as RoomElement), id: 'tub' },
			{ ...(createElement('column', bath, 3, 2000, newId) as RoomElement), id: 'col' }
		];
		const onTub = item({ id: 'a', x: 1000, y: 300 });
		const atColumn = item({ id: 'b', x: 2000, y: 2700, dims: { w: 300, d: 300, h: 500 } });
		const free = item({ id: 'c', x: 2000, y: 1500, dims: { w: 300, d: 300, h: 500 } });
		const issues = checkRoomItems(bath, [onTub, atColumn, free]);
		expect(issues.map((issue) => [issue.code, issue.itemIds[0], issue.elementId])).toEqual([
			['elementCollision', 'a', 'tub'],
			['elementCollision', 'b', 'col']
		]);
	});

	it('lets furniture stand under upper cabinets and on the worktop, not in the base', () => {
		const kitchen = room({ type: 'kitchen' });
		const run = createElement('kitchenRun', kitchen, 1, 2000, newId) as KitchenRun;
		run.upper = { depth: 350, height: 700, elevation: 1450 };
		kitchen.elements = [run];
		const onWorktop = item({ id: 'a', x: 1000, y: 300, elevation: 900, dims: { w: 400, d: 300, h: 300 } });
		const inBase = item({ id: 'b', x: 1000, y: 300, dims: { w: 400, d: 300, h: 300 } });
		const intoUpper = item({ id: 'c', x: 1000, y: 200, elevation: 900, dims: { w: 400, d: 300, h: 700 } });
		const codes = checkRoomItems(kitchen, [onWorktop, inBase, intoUpper]).map((issue) => [
			issue.code,
			issue.itemIds[0]
		]);
		expect(codes).toContainEqual(['elementCollision', 'b']);
		expect(codes).toContainEqual(['elementCollision', 'c']);
		expect(codes).not.toContainEqual(['elementCollision', 'a']);
	});

	it('marks furniture in front of a fireplace red and in front of an air outlet as a warning', () => {
		const living = room();
		const stove = createElement('stove', living, 1, 2000, newId);
		const ac = createElement('acWall', living, 3, 2000, newId);
		living.elements = [stove, ac];
		const zone = clearanceZone(living, stove)!;
		expect(zone.kind).toBe('fire');
		expect(Math.round(Math.min(...zone.shape.map((p) => p.y)))).toBe(450);
		expect(Math.round(Math.max(...zone.shape.map((p) => p.y)))).toBe(1250);
		const inFire = item({ id: 'a', x: 2000, y: 900, dims: { w: 400, d: 300, h: 400 } });
		const beyond = item({ id: 'b', x: 2000, y: 1500, dims: { w: 400, d: 300, h: 400 } });
		const tallUnderAc = item({ id: 'c', x: 2000, y: 2500, dims: { w: 600, d: 400, h: 1800 } });
		const lowUnderAc = item({ id: 'd', x: 2000, y: 2500, dims: { w: 600, d: 400, h: 800 } });
		const issues = checkRoomItems(living, [inFire, beyond, tallUnderAc]);
		expect(issues.map((issue) => [issue.code, issue.severity, issue.itemIds[0]])).toEqual([
			['fireZone', 'error', 'a'],
			['airflowBlocked', 'warning', 'c']
		]);
		expect(checkRoomItems(living, [lowUnderAc])).toEqual([]);
	});

	it('lets a column reach the ceiling under a slope and the cover outdoors', () => {
		const attic = room({ slopes: [{ id: 's', wall: 1, kneeHeight: 1000, angle: 45 }] });
		const column = createElement('column', attic, 1, 2000, newId);
		if (column.kind !== 'column') throw new Error('column');
		expect(freeElementTop(attic, column)).toBe(1150);
		const terrace = room({
			type: 'terrace',
			cover: { polygon: attic.polygon, height: 2700 }
		});
		expect(freeElementTop(terrace, column)).toBe(2700);
		expect(freeElementTop(attic, { ...column, toCeiling: false, height: 900 })).toBe(900);
	});

	it('flags a free element outside the room', () => {
		const living = room();
		const column = { ...(createElement('column', living, 1, 2000, newId) as RoomElement) };
		if (column.kind !== 'column') throw new Error('column');
		living.elements = [{ ...column, x: -200 }];
		expect(validateRoom(living).map((issue) => issue.code)).toEqual(['elementOutsideWall']);
	});
});

describe('roof slopes', () => {
	const base = room({ height: 2500 });

	it('converts depth and angle in both directions', () => {
		expect(slopeAngleFromDepth(2500, 500, 2000)).toBe(45);
		expect(slopeRun(base, { kneeHeight: 500, angle: 45 })).toBeCloseTo(2000, 6);
		const angle = slopeAngleFromDepth(2500, 800, 1500);
		expect(slopeRun(base, { kneeHeight: 800, angle })).toBeCloseTo(1500, -1);
		expect(slopeAngleFromDepth(2500, 2600, 1000)).toBe(85);
	});

	it('covers only its stretch of the wall and is full height beyond it', () => {
		const attic = room({
			slopes: [{ id: 's', wall: 1, kneeHeight: 500, angle: 45, from: 1000, to: 3000 }]
		});
		expect(ceilingHeightAt(attic, { x: 2000, y: 500 })).toBeCloseTo(1000, 6);
		expect(ceilingHeightAt(attic, { x: 500, y: 500 })).toBe(2500);
		expect(ceilingHeightAt(attic, { x: 3500, y: 500 })).toBe(2500);
		expect(wallHeightAt(attic, 1, 2000)).toBeCloseTo(500, 6);
		expect(wallHeightAt(attic, 1, 3200)).toBe(2500);
	});

	it('raises the ceiling to the dormer height inside a dormer, at most to the room height', () => {
		const slope = {
			id: 's',
			wall: 1,
			kneeHeight: 500,
			angle: 45,
			dormers: [
				{ id: 'd', from: 1500, to: 2500, height: 2100 },
				{ id: 'full', from: 3000, to: 3500, height: 2800 }
			]
		};
		const attic = room({ slopes: [slope] });
		expect(ceilingHeightAt(attic, { x: 2000, y: 100 })).toBe(2100);
		expect(ceilingHeightAt(attic, { x: 2000, y: 1800 })).toBeCloseTo(2300, 6);
		expect(ceilingHeightAt(attic, { x: 1000, y: 100 })).toBeCloseTo(600, 6);
		expect(ceilingHeightAt(attic, { x: 3200, y: 100 })).toBe(2500);
		const contours = slopeContours(attic, slope, 2000);
		expect(contours.map((line) => [Math.round(line.from.x), Math.round(line.to.x)])).toEqual([
			[0, 1500],
			[2500, 3000],
			[3500, 4000]
		]);
	});

	it('equals a partial slope when the dormer is as high as the room', () => {
		const withDormer = room({
			slopes: [{ id: 's', wall: 1, kneeHeight: 500, angle: 45, dormers: [{ id: 'd', from: 0, to: 1000, height: 2500 }] }]
		});
		const partial = room({ slopes: [{ id: 's', wall: 1, kneeHeight: 500, angle: 45, from: 1000, to: 4000 }] });
		for (const x of [200, 999, 1001, 2500, 3900]) {
			for (const y of [0, 600, 1500]) {
				expect(ceilingHeightAt(withDormer, { x, y })).toBeCloseTo(ceilingHeightAt(partial, { x, y }), 6);
			}
		}
	});

	it('cuts the slope above a door that is higher than the knee wall', () => {
		const attic = room({ slopes: [{ id: 's', wall: 1, kneeHeight: 1000, angle: 45 }] });
		attic.elements = [createElement('door', attic, 1, 2000, newId)];
		const [cut] = slopeDormers(attic, attic.slopes![0]);
		expect(cut).toMatchObject({ from: 1600, to: 2400, height: 2000 });
		expect(wallHeightAt(attic, 1, 2000)).toBe(2000);
		expect(validateRoom(attic)).toEqual([]);
		expect(ceilingHeightAt({ ...attic, elements: undefined }, { x: 2000, y: 0 })).toBe(1000);
	});

	it('places a roof window in its slope and flags one without slope', () => {
		const attic = room({ slopes: [{ id: 's', wall: 1, kneeHeight: 500, angle: 45 }] });
		const window = createElement('roofWindow', attic, 1, 2000, newId);
		if (window.kind !== 'roofWindow') throw new Error('roofWindow');
		expect(window).toMatchObject({ width: 780, length: 1180, offset: 1610, elevation: 1000 });
		const placement = roofWindowPlacement(attic, window)!;
		expect(placement.near).toBeCloseTo(500, 6);
		expect(placement.far).toBeCloseTo(500 + 1180 * Math.SQRT1_2, 6);
		expect(placement.top).toBeCloseTo(1000 + 1180 * Math.SQRT1_2, 6);
		attic.elements = [window];
		expect(validateRoom(attic)).toEqual([]);
		attic.elements = [{ ...window, wall: 2 }];
		expect(validateRoom(attic).map((issue) => issue.code)).toEqual(['roofWindowOffSlope']);
	});
});
