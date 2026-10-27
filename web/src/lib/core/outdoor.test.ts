import { describe, expect, it } from 'vitest';
import { checkRoomItems, validateRoom } from './checks.ts';
import { createElement, createRoom, rectanglePolygon } from './defaults.ts';
import { sequentialIds } from './ids.ts';
import { areaSummary, coverHeightAt, railingRuns, stripCover, wholeCover } from './outdoor.ts';
import type { Item, Project, Room } from './schema.ts';

function room(id: string, patch: Partial<Room> = {}): Room {
	return { ...createRoom(id, id, 'living'), ...patch };
}

// Living room 4 × 3 m, balcony 4 × 1.5 m docked onto its wall 3 with a 15 cm wall in between.
const living = room('living');
const balcony = room('balcony', {
	type: 'balcony',
	polygon: rectanglePolygon(4000, 1500),
	boardPos: { x: 0, y: 3150, rot: 0 },
	railing: { height: 1000 }
});

const plant = (patch: Partial<Item>): Item => ({
	id: 'p',
	roomId: 'balcony',
	name: 'Palme',
	category: 'plant',
	dims: { w: 600, d: 600, h: 2800 },
	x: 2000,
	y: 750,
	rotation: 0,
	elevation: 0,
	...patch
});

describe('outdoor areas', () => {
	it('runs the railing along every edge except the house wall', () => {
		expect(railingRuns([living, balcony], balcony)).toEqual([
			{ wall: 2, from: 0, to: 1500 },
			{ wall: 3, from: 0, to: 4000 },
			{ wall: 4, from: 0, to: 1500 }
		]);
		expect(railingRuns([living, { ...balcony, railing: undefined }], balcony)).toHaveLength(3);
		expect(railingRuns([living, balcony], { ...balcony, railing: undefined })).toEqual([]);
		expect(railingRuns([living], living)).toEqual([]);
	});

	it('limits the height only under the cover', () => {
		const covered = { ...balcony, cover: stripCover(balcony, 1, 800, 2400) };
		expect(coverHeightAt(covered, { x: 2000, y: 400 })).toBe(2400);
		expect(coverHeightAt(covered, { x: 2000, y: 1200 })).toBeUndefined();
		expect(checkRoomItems(balcony, [plant({})])).toEqual([]);
		const underCover = plant({ y: 400, dims: { w: 600, d: 600, h: 2800 } });
		expect(checkRoomItems(covered, [underCover]).map((issue) => issue.code)).toEqual(['tooTall']);
		expect(checkRoomItems(covered, [plant({ y: 1150 })])).toEqual([]);
		expect(wholeCover(balcony, 2500).polygon).toEqual(balcony.polygon);
	});

	it('marks wall elements of a room that became an open-air area', () => {
		const terrace = { ...balcony, type: 'terrace' as const };
		terrace.elements = [createElement('window', terrace, 1, 2000, sequentialIds('w'))];
		expect(validateRoom(terrace).map((issue) => issue.code)).toEqual(['elementNotForRoomType']);
	});

	it('sums living and outdoor area separately, per floor if asked', () => {
		const project: Pick<Project, 'rooms' | 'floors'> = {
			rooms: [
				{ ...living, floorId: 'eg' },
				{ ...balcony, floorId: 'og' },
				room('winter', {
					type: 'winterGarden',
					polygon: rectanglePolygon(3000, 2000),
					floorId: 'eg'
				})
			],
			floors: [
				{ id: 'eg', name: 'EG', slabThickness: 300 },
				{ id: 'og', name: '1. OG', slabThickness: 300 }
			]
		};
		expect(areaSummary(project)).toEqual({ living: 12, outdoor: 12 });
		expect(areaSummary(project, 'og')).toEqual({ living: 0, outdoor: 6 });
	});
});
