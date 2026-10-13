import { describe, expect, it } from 'vitest';
import { rectanglePolygon } from '#lib/core/defaults.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import type { Room, WallElement } from '#lib/core/schema.ts';
import {
	centerHeight,
	clampOffset,
	distanceFromEnd,
	dragOffset,
	duplicateOffset,
	elevationForCenter,
	nearestWindow,
	alongToScreen,
	nudgeDelta,
	screenDeltaToAlong,
	offsetFromEndDistance,
	pickWall,
	placementAt,
	radiatorUnderWindow,
	snapCeilingPoint,
	snapElevation,
	snapOffset,
	switchAboveWorktop,
	thresholdMm,
	wallCorners,
	windowsOnWall
} from './logic.ts';

const polygon = rectanglePolygon(4000, 3000);

function windowElement(overrides: Partial<WallElement> = {}): WallElement {
	return {
		id: 'w1',
		kind: 'window',
		status: 'existing',
		wall: 1,
		offset: 1000,
		width: 1200,
		height: 1400,
		elevation: 900,
		windowType: 'tiltTurn',
		...overrides
	} as WallElement;
}

function room(elements: Room['elements'] = []): Room {
	return {
		id: 'r',
		name: 'r',
		type: 'other',
		polygon,
		height: 2500,
		boardPos: { x: 0, y: 0, rot: 0 },
		elements,
		photos: []
	};
}

describe('clampOffset', () => {
	it('keeps elements inside the wall', () => {
		expect(clampOffset(-50, 800, 4000)).toBe(0);
		expect(clampOffset(3500, 800, 4000)).toBe(3200);
		expect(clampOffset(1234.6, 800, 4000)).toBe(1235);
	});

	it('pins elements wider than the wall to the start', () => {
		expect(clampOffset(300, 5000, 4000)).toBe(0);
	});
});

describe('start and end distance', () => {
	it('converts between offset and distance from the end corner', () => {
		expect(distanceFromEnd(500, 800, 4000)).toBe(2700);
		expect(offsetFromEndDistance(2700, 800, 4000)).toBe(500);
	});

	it('goes negative when the element overhangs', () => {
		expect(distanceFromEnd(3500, 800, 4000)).toBe(-300);
	});

	it('rounds the wall length', () => {
		expect(distanceFromEnd(0, 1000, 3999.6)).toBe(3000);
	});
});

describe('snapOffset', () => {
	const base = { width: 800, wallLength: 4000, neighbors: [], threshold: 20 };

	it('snaps to the 1 cm grid', () => {
		expect(snapOffset({ ...base, offset: 1234.4, threshold: 0 })).toEqual({
			value: 1230,
			kind: 'grid'
		});
		expect(snapOffset({ ...base, offset: 1236, threshold: 0 })).toEqual({
			value: 1240,
			kind: 'grid'
		});
	});

	it('snaps flush to both corners', () => {
		expect(snapOffset({ ...base, offset: 12 })).toEqual({ value: 0, kind: 'start' });
		expect(snapOffset({ ...base, offset: 3190 })).toEqual({ value: 3200, kind: 'end' });
	});

	it('snaps to the wall centre', () => {
		expect(snapOffset({ ...base, offset: 1610 })).toEqual({ value: 1600, kind: 'center' });
	});

	it('snaps flush to neighbours on both sides', () => {
		const neighbors = [{ from: 1000, to: 2000 }];
		expect(snapOffset({ ...base, neighbors, offset: 2012 })).toEqual({
			value: 2000,
			kind: 'neighbor'
		});
		expect(snapOffset({ ...base, neighbors, offset: 188 })).toEqual({
			value: 200,
			kind: 'neighbor'
		});
	});

	it('clamps to the wall', () => {
		expect(snapOffset({ ...base, offset: -300, threshold: 0 }).value).toBe(0);
		expect(snapOffset({ ...base, offset: 9000, threshold: 0 }).value).toBe(3200);
	});

	it('does not snap beyond the threshold', () => {
		expect(snapOffset({ ...base, offset: 600, threshold: 20 }).kind).toBe('grid');
	});
});

describe('snapElevation', () => {
	const base = { height: 1400, roomHeight: 2500, neighbors: [], threshold: 20 };

	it('snaps to the floor and ceiling', () => {
		expect(snapElevation({ ...base, elevation: 12 })).toEqual({ value: 0, kind: 'start' });
		expect(snapElevation({ ...base, elevation: 1090 })).toEqual({ value: 1100, kind: 'end' });
	});

	it('snaps to neighbouring edges', () => {
		const neighbors = [{ elevation: 900, height: 1400 }];
		expect(snapElevation({ ...base, height: 600, neighbors, elevation: 290 }).value).toBe(300);
		expect(snapElevation({ ...base, height: 600, neighbors, elevation: 905 }).value).toBe(900);
	});

	it('rounds to 1 cm in free space', () => {
		expect(snapElevation({ ...base, elevation: 503, threshold: 0 })).toEqual({
			value: 500,
			kind: 'grid'
		});
	});

	it('stays inside the room height', () => {
		expect(snapElevation({ ...base, elevation: -100, threshold: 0 }).value).toBe(0);
		expect(snapElevation({ ...base, elevation: 5000, threshold: 0 }).value).toBe(1100);
	});
});

describe('centre height', () => {
	it('converts between lower edge and centre', () => {
		expect(centerHeight(260, 80)).toBe(300);
		expect(elevationForCenter(1150, 80)).toBe(1110);
	});

	it('places a switch at 115 cm above the worktop', () => {
		expect(switchAboveWorktop(80)).toBe(1110);
		expect(centerHeight(switchAboveWorktop(80), 80)).toBe(1150);
	});
});

describe('radiatorUnderWindow', () => {
	const radiator = { width: 1000, height: 600, elevation: 150 };

	it('centres the radiator under the window', () => {
		const result = radiatorUnderWindow(radiator, windowElement(), 4000);
		expect(result.offset).toBe(1100);
		expect(result.elevation).toBe(150);
	});

	it('lowers the radiator below the sill', () => {
		const result = radiatorUnderWindow(
			{ ...radiator, height: 700 },
			windowElement({ elevation: 800 }),
			4000
		);
		expect(result.elevation).toBe(50);
	});

	it('never goes below the floor', () => {
		const result = radiatorUnderWindow(radiator, windowElement({ elevation: 300 }), 4000);
		expect(result.elevation).toBe(0);
	});

	it('stays inside the wall', () => {
		const result = radiatorUnderWindow(radiator, windowElement({ offset: 0, width: 400 }), 4000);
		expect(result.offset).toBe(0);
	});

	it('finds the nearest window on the wall', () => {
		const near = windowElement({ id: 'near', offset: 2900, width: 600 });
		const far = windowElement({ id: 'far', offset: 100, width: 600 });
		const windows = windowsOnWall(room([far, near]), 1);
		expect(nearestWindow(windows, { offset: 2500, width: 800 })?.id).toBe('near');
		expect(nearestWindow([], { offset: 0, width: 800 })).toBeUndefined();
	});
});

describe('pickWall and dragOffset', () => {
	it('picks the nearest wall', () => {
		const hit = pickWall(polygon, { x: 2000, y: 100 });
		expect(hit?.wall.number).toBe(1);
		expect(hit?.along).toBe(2000);
		expect(pickWall(polygon, { x: 3900, y: 1500 })?.wall.number).toBe(2);
	});

	it('sticks to the current wall near corners', () => {
		const point = { x: 3900, y: 150 };
		expect(pickWall(polygon, point)?.wall.number).toBe(2);
		expect(pickWall(polygon, point, 1, 80)?.wall.number).toBe(1);
		expect(pickWall(polygon, point, 1, 10)?.wall.number).toBe(2);
	});

	it('keeps the grab point on the same wall and centres on a new wall', () => {
		const same = { startOffset: 500, startAlong: 700, along: 900, width: 800 };
		expect(dragOffset({ ...same, sameWall: true })).toBe(700);
		expect(dragOffset({ ...same, sameWall: false })).toBe(500);
	});
});

describe('placementAt', () => {
	it('places a door centred on the tapped wall position', () => {
		const element = placementAt('door', room(), { x: 2000, y: 90 }, sequentialIds('n'), 0);
		expect(element).toMatchObject({ kind: 'door', wall: 1, offset: 1600, id: 'n-1' });
	});

	it('snaps flush to the corner', () => {
		const element = placementAt('door', room(), { x: 430, y: 60 }, sequentialIds(), 40);
		expect(element).toMatchObject({ offset: 0 });
	});

	it('places on another wall', () => {
		const element = placementAt('window', room(), { x: 3950, y: 1500 }, sequentialIds(), 0);
		expect(element).toMatchObject({ kind: 'window', wall: 2 });
	});

	it('places a ceiling lamp at the tap inside the room', () => {
		const element = placementAt('ceilingLamp', room(), { x: 1234, y: 2001 }, sequentialIds(), 0);
		expect(element).toMatchObject({ kind: 'ceilingLamp', x: 1230, y: 2000 });
	});

	it('falls back to the room centre outside the room', () => {
		const element = placementAt('ceilingLamp', room(), { x: -900, y: 100 }, sequentialIds(), 0);
		expect(element).toMatchObject({ x: 2000, y: 1500 });
	});
});

describe('snapCeilingPoint', () => {
	it('snaps to the reference per axis', () => {
		const result = snapCeilingPoint({ x: 1995, y: 700 }, { x: 2000, y: 1500 }, 30);
		expect(result).toMatchObject({ x: 2000, y: 700, snappedX: true, snappedY: false });
	});
});

describe('duplicateOffset', () => {
	it('puts the copy next to the original', () => {
		expect(duplicateOffset({ offset: 500, width: 800 }, 4000)).toBe(1300);
	});

	it('falls back to the left side at the wall end', () => {
		expect(duplicateOffset({ offset: 3200, width: 800 }, 4000)).toBe(2400);
	});

	it('clamps when the wall is too short for two', () => {
		expect(duplicateOffset({ offset: 200, width: 800 }, 1000)).toBe(200);
	});
});

describe('helpers', () => {
	it('names the wall corners', () => {
		expect(wallCorners(polygon, 1)).toBe('A–B');
		expect(wallCorners(polygon, 4)).toBe('D–A');
		expect(wallCorners(polygon, 9)).toBe('');
	});

	it('scales the snap threshold with the zoom', () => {
		expect(thresholdMm(0.1, 8)).toBeCloseTo(80);
		expect(thresholdMm(0)).toBe(0);
	});

	it('maps arrow keys to nudges', () => {
		expect(nudgeDelta('ArrowLeft', false, false)).toEqual({ along: -10, up: 0 });
		expect(nudgeDelta('ArrowLeft', false, true)).toEqual({ along: 10, up: 0 });
		expect(nudgeDelta('ArrowRight', true, true)).toEqual({ along: -100, up: 0 });
		expect(nudgeDelta('ArrowRight', true, false)).toEqual({ along: 100, up: 0 });
		expect(nudgeDelta('ArrowUp', false, true)).toEqual({ along: 0, up: 10 });
		expect(nudgeDelta('ArrowDown', true, true)).toEqual({ along: 0, up: -100 });
		expect(nudgeDelta('ArrowUp', false, false)).toEqual({ along: -10, up: 0 });
		expect(nudgeDelta('a', false, false)).toBeUndefined();
	});
});

describe('mirrored wall view', () => {
	it('puts the start corner on the right and the end corner on the left', () => {
		expect(alongToScreen(0, 4000, 0.1, 58)).toBe(458);
		expect(alongToScreen(4000, 4000, 0.1, 58)).toBe(58);
		expect(alongToScreen(1000, 4000, 0.1, 58)).toBeCloseTo(358);
	});

	it('turns a screen drag to the right into a smaller offset', () => {
		expect(screenDeltaToAlong(50, 0.1)).toBeCloseTo(-500);
		expect(screenDeltaToAlong(-30, 0.1)).toBeCloseTo(300);
		expect(screenDeltaToAlong(0, 0.1)).toBeCloseTo(0);
	});
});
