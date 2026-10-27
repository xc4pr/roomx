import { describe, expect, it } from 'vitest';
import { createElement, createRoom, rectanglePolygon } from '#lib/core/defaults.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import type { KitchenModule, Room } from '#lib/core/schema.ts';
import {
	changeModuleKind,
	cornerOffset,
	dockToCorner,
	dockToWall,
	dragFree,
	hasDepth,
	appendModule,
	moduleWidthChoices,
	modulesTotal,
	moveModule,
	newModule,
	paletteSections,
	regrid,
	rotateBy,
	snapFreeToWall,
	toggleAppliance
} from './free.ts';
import { placementAt } from './logic.ts';

const polygon = rectanglePolygon(4000, 3000);

function room(type: Room['type'], extra: Partial<Room> = {}): Room {
	return { ...createRoom('r', 'Raum', type), ...extra };
}

function kinds(target: Room): string[] {
	return paletteSections(target).flatMap((section) => section.kinds);
}

describe('paletteSections', () => {
	it('keeps the old kinds in the old order for a plain room', () => {
		const sections = paletteSections(room('living'));
		expect(sections.map((section) => section.group)).toEqual([
			'openings',
			'electrical',
			'climate',
			'obstacles'
		]);
		expect(kinds(room('living')).slice(0, 7)).toEqual([
			'door',
			'window',
			'socket',
			'switch',
			'wallLamp',
			'dataPort',
			'ceilingLamp'
		]);
	});

	it('offers sanitary kinds in the bath only', () => {
		expect(kinds(room('bath'))).toContain('toilet');
		expect(kinds(room('office'))).not.toContain('toilet');
		expect(paletteSections(room('bath')).map((section) => section.group)).toContain('sanitary');
	});

	it('offers the kitchen run in kitchens and open built-in kitchens', () => {
		expect(kinds(room('kitchen'))).toContain('kitchenRun');
		expect(kinds(room('living'))).not.toContain('kitchenRun');
		expect(kinds(room('living', { kitchen: { open: true } }))).toContain('kitchenRun');
		expect(kinds(room('kitchen', { kitchen: { mode: 'catalog' } }))).not.toContain('kitchenRun');
	});

	it('offers the roof window only in rooms with a slope', () => {
		const sloped = room('office', { slopes: [{ id: 's', wall: 1, kneeHeight: 1000, angle: 30 }] });
		expect(kinds(sloped)).toContain('roofWindow');
		expect(kinds(room('office'))).not.toContain('roofWindow');
	});

	it('keeps the group of an element that no longer fits', () => {
		const element = createElement('toilet', polygon && room('bath'), 1, 1000, sequentialIds('e'));
		const office = room('office', { elements: [element] });
		expect(paletteSections(office).map((section) => section.group)).not.toContain('sanitary');
		expect(kinds(office)).not.toContain('toilet');
	});
});

describe('wall kinds', () => {
	it('knows which kinds carry a depth', () => {
		const ids = sequentialIds('e');
		expect(hasDepth(createElement('shower', room('bath'), 1, 1000, ids))).toBe(true);
		expect(hasDepth(createElement('window', room('bath'), 1, 1000, ids))).toBe(false);
	});

	it('places a shower into the corner offsets', () => {
		expect(cornerOffset('start', 900, 4000)).toBe(0);
		expect(cornerOffset('end', 900, 4000)).toBe(3100);
		expect(cornerOffset('end', 5000, 4000)).toBe(0);
	});

	it('docks a shower to the wall end when dropped close to it', () => {
		const bath = room('bath');
		const placed = placementAt('shower', bath, { x: 3900, y: 20 }, sequentialIds('e'), 80);
		expect(placed).toMatchObject({ kind: 'shower', wall: 1, offset: 3100 });
	});
});

describe('free elements', () => {
	it('starts against the wall near the drop point', () => {
		const placed = placementAt(
			'column',
			room('living'),
			{ x: 2000, y: 60 },
			sequentialIds('e'),
			80
		);
		expect(placed).toMatchObject({ kind: 'column', x: 2000, y: 150, rotation: 0 });
	});

	it('starts at the drop point when it is far from every wall', () => {
		const placed = placementAt(
			'freeObstacle',
			room('living'),
			{ x: 2003, y: 1500 },
			sequentialIds('e'),
			80
		);
		expect(placed).toMatchObject({ kind: 'freeObstacle', x: 2000, y: 1500 });
	});

	it('turns and wraps the rotation', () => {
		expect(rotateBy(350, 15)).toBe(5);
		expect(rotateBy(0, -15)).toBe(345);
		expect(rotateBy(270, 90)).toBe(0);
	});

	it('docks to the nearest wall with the back against it', () => {
		const pose = dockToWall(polygon, { x: 2000, y: 700, rotation: 33, width: 1000, depth: 500 });
		expect(pose).toEqual({ x: 2000, y: 250, rotation: 0 });
		const right = dockToWall(polygon, { x: 3600, y: 1500, rotation: 0, width: 1000, depth: 500 });
		expect(right).toEqual({ x: 3750, y: 1500, rotation: 90 });
	});

	it('keeps the element on the wall when docking near a corner', () => {
		const pose = dockToWall(polygon, { x: 100, y: 100, rotation: 0, width: 1000, depth: 500 });
		expect(pose?.x).toBeGreaterThanOrEqual(500);
	});

	it('docks diagonally into the nearest corner', () => {
		const pose = dockToCorner(polygon, { x: 600, y: 700, rotation: 0, width: 1000, depth: 500 });
		expect(pose).toEqual({ x: 530, y: 530, rotation: 315 });
		const far = dockToCorner(polygon, { x: 3600, y: 2600, rotation: 0, width: 1000, depth: 500 });
		expect(far?.x).toBe(3470);
		expect(far?.y).toBe(2470);
	});

	it('skips reflex corners', () => {
		const lShape = [
			{ x: 0, y: 0 },
			{ x: 4000, y: 0 },
			{ x: 4000, y: 2000 },
			{ x: 2000, y: 2000 },
			{ x: 2000, y: 4000 },
			{ x: 0, y: 4000 }
		];
		const pose = dockToCorner(lShape, { x: 2100, y: 2100, rotation: 0, width: 600, depth: 400 });
		expect(pose).toBeDefined();
		expect(Math.hypot((pose?.x ?? 0) - 2000, (pose?.y ?? 0) - 2000)).toBeGreaterThan(900);
	});

	it('snaps a parallel back edge onto the wall while dragging', () => {
		const box = { x: 1500, y: 250, rotation: 0, width: 600, depth: 400 };
		expect(snapFreeToWall(polygon, box, 60)).toEqual({ x: 1500, y: 200 });
		expect(snapFreeToWall(polygon, { ...box, y: 400 }, 60)).toEqual({ x: 1500, y: 400 });
		expect(snapFreeToWall(polygon, { ...box, rotation: 20 }, 60)).toEqual({ x: 1500, y: 250 });
	});

	it('drags in steps and refuses points outside the room', () => {
		const box = { x: 1500, y: 1500, rotation: 0, width: 600, depth: 400 };
		expect(dragFree(polygon, box, { x: 2013, y: 1507 }, { x: 0, y: 0 }, 40)).toEqual({
			x: 2010,
			y: 1510
		});
		expect(dragFree(polygon, box, { x: 9000, y: 1500 }, { x: 0, y: 0 }, 40)).toBeUndefined();
	});
});

describe('kitchen modules', () => {
	const ids = sequentialIds('m');
	const modules: KitchenModule[] = [
		{ id: 'a', kind: 'sink', width: 600 },
		{ id: 'b', kind: 'hob', width: 600, appliances: ['oven'] },
		{ id: 'c', kind: 'base', width: 300 }
	];

	it('suggests multiples of the grid', () => {
		expect(moduleWidthChoices('sms')).toEqual([550, 1100, 1650]);
		expect(moduleWidthChoices('euro')).toEqual([600, 1200, 1800]);
		expect(newModule('base', 'euro', ids)).toMatchObject({ kind: 'base', width: 600 });
	});

	it('moves modules and stops at the ends', () => {
		expect(moveModule(modules, 'b', -1).map((m) => m.id)).toEqual(['b', 'a', 'c']);
		expect(moveModule(modules, 'a', -1).map((m) => m.id)).toEqual(['a', 'b', 'c']);
		expect(moveModule(modules, 'c', 1).map((m) => m.id)).toEqual(['a', 'b', 'c']);
	});

	it('drops appliances that do not belong to the new kind', () => {
		expect(changeModuleKind(modules[1], 'sink')).toEqual({ id: 'b', kind: 'sink', width: 600 });
		expect(changeModuleKind(modules[1], 'tall').appliances).toEqual(['oven']);
	});

	it('toggles appliances', () => {
		expect(toggleAppliance(modules[1], 'oven').appliances).toBeUndefined();
		expect(toggleAppliance(modules[1], 'steamer').appliances).toEqual(['oven', 'steamer']);
	});

	it('converts whole grid multiples to the other grid', () => {
		const sms: KitchenModule[] = [
			{ id: 'a', kind: 'base', width: 550 },
			{ id: 'b', kind: 'base', width: 1100 },
			{ id: 'c', kind: 'base', width: 700 }
		];
		expect(regrid(sms, 'sms', 'euro').map((m) => m.width)).toEqual([600, 1200, 700]);
		expect(modulesTotal(modules)).toBe(1500);
	});
});

describe('appendModule', () => {
	const module = (id: string, width = 550) => ({ id, kind: 'base' as const, width });
	it('grows a full run as far as the wall allows', () => {
		const run = { modules: [module('a'), module('b')], width: 1100, offset: 500 };
		expect(appendModule(run, 4000, module('c')).width).toBe(1650);
		expect(appendModule(run, 2000, module('c')).width).toBe(1500);
		expect(appendModule({ ...run, width: 2000 }, 4000, module('c')).width).toBe(2000);
	});
});
