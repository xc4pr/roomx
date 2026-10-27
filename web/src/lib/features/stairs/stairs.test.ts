import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkRoomItems } from '#lib/core/checks.ts';
import { createRoom } from '#lib/core/defaults.ts';
import { checkStairs, stairContext } from '#lib/core/floors.ts';
import type { Item, Project, Room, Stair } from '#lib/core/schema.ts';
import { db } from '#lib/state/db.ts';
import { createProject, ProjectStore } from '#lib/state/project.svelte.ts';
import { collectWarnings } from '#lib/features/board/buildCheck.ts';
import { findFreeSpot } from '#lib/features/furnish/snap.ts';
import {
	angleFromHandle,
	canAddStair,
	cutLine,
	editorMaxHeight,
	newStair,
	roomStairZones,
	snapAngle,
	summarise
} from './logic.ts';

const floors = [
	{ id: 'eg', name: 'EG', slabThickness: 300 },
	{ id: 'og', name: '1. OG', slabThickness: 250 }
];
const square = [
	{ x: 0, y: 0 },
	{ x: 6000, y: 0 },
	{ x: 6000, y: 6000 },
	{ x: 0, y: 6000 }
];

function room(id: string, floorId: string, patch: Partial<Room> = {}): Room {
	return { ...createRoom(id, id, 'living'), floorId, polygon: square, ...patch };
}

const stair = (patch: Partial<Stair> = {}): Stair => ({
	id: 'st',
	fromFloorId: 'eg',
	shape: 'straight',
	x: 1000,
	y: 300,
	rotation: 0,
	width: 900,
	turn: 'left',
	...patch
});

function project(patch: Partial<Project> = {}): Project {
	return {
		id: 'p',
		name: 'Haus',
		schemaVersion: 2,
		rev: 0,
		createdAt: '2026-10-27T00:00:00.000Z',
		updatedAt: '2026-10-27T00:00:00.000Z',
		rooms: [room('a', 'eg'), room('b', 'og')],
		floors,
		stairs: [stair()],
		variants: [],
		...patch
	};
}

const sofa = (patch: Partial<Item> = {}): Item => ({
	id: 'i',
	roomId: 'a',
	name: 'Sofa',
	category: 'sofa',
	mount: 'floor',
	dims: { w: 800, d: 600, h: 700 },
	x: 3500,
	y: 3500,
	rotation: 0,
	elevation: 0,
	...patch
});

describe('stair summary', () => {
	it('shows steps, riser, tread, stride and run length', () => {
		const p = project();
		const summary = summarise(p, p.stairs![0])!;
		expect(summary.steps).toBe(16);
		expect(summary.riser).toBeCloseTo(175, 5);
		expect(summary.tread).toBe(280);
		expect(summary.stride).toBeCloseTo(630, 5);
		expect(summary.run).toBeCloseTo(15 * 280, 0);
	});

	it('has no summary on the top floor', () => {
		const p = project();
		expect(summarise(p, stair({ fromFloorId: 'og' }))).toBeUndefined();
		expect(canAddStair(p, 'eg')).toBe(true);
		expect(canAddStair(p, 'og')).toBe(false);
		expect(canAddStair({ floors: undefined }, undefined)).toBe(false);
	});

	it('draws a cut line across the flight', () => {
		const context = stairContext(project(), stair())!;
		const cut = cutLine(context)!;
		expect(cut.above).toBeGreaterThan(1);
		expect(
			Math.hypot(cut.line.to.x - cut.line.from.x, cut.line.to.y - cut.line.from.y)
		).toBeGreaterThan(900);
	});
});

describe('turning', () => {
	it('snaps to 15 degrees and derives the angle from the handle behind the foot', () => {
		expect(snapAngle(52)).toBe(45);
		expect(snapAngle(-170)).toBe(-165);
		expect(snapAngle(358)).toBe(0);
		expect(angleFromHandle({ x: 0, y: 0 }, { x: 0, y: -400 })).toBeCloseTo(0);
		expect(angleFromHandle({ x: 0, y: 0 }, { x: 400, y: 0 })).toBeCloseTo(90);
	});
});

describe('stairwell and findings', () => {
	it('opens the stairwell on the upper floor', () => {
		const p = project();
		const context = stairContext(p, p.stairs![0])!;
		expect(context.opening.length).toBeGreaterThan(5);
		const zones = roomStairZones(p, p.rooms[1]);
		expect(zones.every((zone) => zone.kind === 'stairwell')).toBe(true);
		expect(zones).toHaveLength(context.opening.length);
	});

	it('collects stair findings in the build check', () => {
		const p = project({ stairs: [stair({ x: 9000 }), stair({ id: 'top', fromFloorId: 'og' })] });
		const issues = checkStairs(p);
		const warnings = collectWarnings(p.rooms, () => ({ done: 0, total: 0 }), undefined, issues);
		expect(warnings).toHaveLength(2);
		expect(warnings.every((warning) => warning.kind === 'stair')).toBe(true);
		expect(issues.map((issue) => issue.code).sort()).toEqual([
			'stairNoUpperFloor',
			'stairOutsideRooms'
		]);
	});

	it('reports headroom under a slope with step and value', () => {
		const attic = room('b', 'og', {
			height: 2400,
			slopes: [{ id: 's', wall: 3, kneeHeight: 300, angle: 30 }]
		});
		const issues = checkStairs(project({ rooms: [room('a', 'eg'), attic] }));
		expect(issues[0]).toMatchObject({ code: 'stairHeadroom', stairId: 'st' });
		expect(issues[0].tread).toBeGreaterThan(0);
		expect(issues[0].headroom).toBeLessThan(2000);
	});

	it('does not scope stair findings to single rooms', () => {
		const p = project({ stairs: [stair({ x: 9000 })] });
		const issues = checkStairs(p);
		expect(collectWarnings(p.rooms, () => ({ done: 0, total: 0 }), ['a'], issues)).toEqual([]);
	});
});

describe('furniture on stairs', () => {
	it('marks a piece on the stair or in the stairwell as an error', () => {
		const p = project();
		const lower = p.rooms[0];
		const onStair = sofa({ x: 1000, y: 1200 });
		const issues = checkRoomItems(lower, [onStair], [], roomStairZones(p, lower));
		expect(issues.map((issue) => issue.code)).toContain('onStair');
		const upper = p.rooms[1];
		const inWell = sofa({ id: 'j', roomId: 'b', x: 1000, y: 1200 });
		const upperIssues = checkRoomItems(upper, [inWell], [], roomStairZones(p, upper));
		expect(upperIssues.map((issue) => issue.code)).toContain('inStairwell');
		const free = sofa({ x: 4500, y: 4500 });
		expect(checkRoomItems(lower, [free], [], roomStairZones(p, lower))).toEqual([]);
	});

	it('keeps the free-spot search off the stair', () => {
		const p = project();
		const lower = p.rooms[0];
		const blocked = roomStairZones(p, lower).map((zone) => zone.shape);
		const spot = findFreeSpot(lower, [], { w: 800, d: 600 }, 0, { x: 1000, y: 1200 }, blocked)!;
		const issues = checkRoomItems(
			lower,
			[sofa({ x: spot.x, y: spot.y })],
			[],
			roomStairZones(p, lower)
		);
		expect(issues).toEqual([]);
	});
});

describe('store', () => {
	const opened: ProjectStore[] = [];
	afterEach(async () => {
		await Promise.all(opened.splice(0).map((store) => store.flush()));
	});
	beforeEach(async () => {
		await Promise.all(db.tables.map((table) => table.clear()));
	});

	it('adds a stair on the lower floor and offers none without floors', async () => {
		const store = new ProjectStore();
		opened.push(store);
		await store.open(await createProject('Haus'));
		store.addRoom('Wohnen', 'living');
		expect(store.addStair(newStair('x', { x: 0, y: 0 }))).toBeUndefined();
		store.enableFloors(['EG', '1. OG']);
		const [eg] = store.project!.floors!;
		const id = store.addStair(newStair(eg.id, { x: 1234, y: 567 }))!;
		expect(store.project!.stairs![0]).toMatchObject({
			id,
			shape: 'straight',
			width: 900,
			x: 1230,
			y: 570
		});
	});
});

describe('stair editor height', () => {
	it('leaves room for the tool column above it', () => {
		expect(editorMaxHeight(0)).toContain('calc(100% - 0px');
		expect(editorMaxHeight(300.4)).toContain('calc(100% - 300px');
		expect(editorMaxHeight(-5)).toContain('calc(100% - 0px');
	});
});
