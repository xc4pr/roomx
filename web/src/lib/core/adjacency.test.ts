import { describe, expect, it } from 'vitest';
import { mirroredOpenings, roomNeighbours, wallLinks } from './adjacency.ts';
import { WALL_THICKNESS } from './defaults.ts';
import { rectangleRoom } from './fixtures.ts';
import type { Room } from './schema.ts';

function pair(gap = WALL_THICKNESS, shiftY = 0): Room[] {
	const left = rectangleRoom('left', 4000, 3000);
	const right = {
		...rectangleRoom('right', 3000, 3000),
		elements: [],
		boardPos: { x: 4000 + gap, y: shiftY, rot: 0 }
	};
	return [left, right];
}

describe('wallLinks', () => {
	it('links walls that share one wall thickness', () => {
		const links = wallLinks(pair());
		expect(links).toContainEqual({
			roomId: 'left',
			wall: 2,
			otherRoomId: 'right',
			otherWall: 4,
			from: 0,
			to: 3000,
			thickness: 150
		});
		expect(links).toContainEqual({
			roomId: 'right',
			wall: 4,
			otherRoomId: 'left',
			otherWall: 2,
			from: 0,
			to: 3000,
			thickness: 150
		});
		expect(roomNeighbours(pair(), 'left')).toHaveLength(1);
	});

	it('keeps only the overlapping part and ignores distant rooms', () => {
		const shifted = wallLinks(pair(WALL_THICKNESS, 1000)).find((link) => link.roomId === 'left');
		expect(shifted).toMatchObject({ from: 1000, to: 3000 });
		expect(wallLinks(pair(600))).toEqual([]);
		expect(wallLinks(pair(40))).toEqual([]);
		expect(wallLinks(pair(250)).find((link) => link.roomId === 'left')?.thickness).toBe(250);
		expect(wallLinks(pair(WALL_THICKNESS, 2950))).toEqual([]);
	});

	it('works for rotated rooms', () => {
		const [left, right] = pair();
		const turned = { ...right, boardPos: { x: 4000 + WALL_THICKNESS + 3000, y: 0, rot: 90 } };
		expect(wallLinks([left, turned]).find((link) => link.roomId === 'left')).toMatchObject({
			wall: 2,
			otherWall: 3
		});
	});
});

describe('mirroredOpenings', () => {
	it('mirrors a door in a shared wall into the neighbour', () => {
		const [left, right] = pair();
		left.elements = [
			{
				id: 'pass',
				kind: 'door',
				status: 'existing',
				wall: 2,
				offset: 500,
				width: 900,
				height: 2000,
				elevation: 0,
				hinge: 'start',
				swing: 'in'
			}
		];
		const [mirrored] = mirroredOpenings([left, right]);
		expect(mirrored.roomId).toBe('right');
		expect(mirrored.element).toMatchObject({
			id: 'pass@right',
			wall: 4,
			offset: 1600,
			width: 900,
			hinge: 'end',
			swing: 'out'
		});
	});

	it('ignores openings outside the shared part', () => {
		const [left, right] = pair(WALL_THICKNESS, 2000);
		left.elements = [
			{
				id: 'w',
				kind: 'window',
				status: 'existing',
				wall: 2,
				offset: 200,
				width: 800,
				height: 1200,
				elevation: 900,
				windowType: 'fixed'
			}
		];
		expect(mirroredOpenings([left, right])).toEqual([]);
	});
});

describe('export with neighbours', () => {
	it('lists neighbours per wall and mirrored doors', async () => {
		const { buildExport, ExportSchema } = await import('./export.ts');
		const { sampleProject } = await import('./fixtures.ts');
		const [left, right] = pair();
		left.elements = [
			{
				id: 'pass',
				kind: 'door',
				status: 'existing',
				wall: 2,
				offset: 500,
				width: 900,
				height: 2000,
				elevation: 0,
				hinge: 'start',
				swing: 'in'
			}
		];
		right.name = 'Flur';
		const doc = buildExport({ ...sampleProject(), rooms: [left, right] });
		expect(ExportSchema.safeParse(doc).success).toBe(true);
		expect(doc.rooms[0].walls[1].neighbours).toEqual([
			{ roomId: 'right', roomName: 'Flur', wall: 4, from: 0, to: 3000, thickness: 150 }
		]);
		expect(doc.rooms[1].walls[3].elements[0]).toMatchObject({
			id: 'pass@right',
			sharedFrom: 'pass',
			offsetFromStart: 1600
		});
		expect(
			buildExport({ ...sampleProject(), rooms: [left, right] }, { roomIds: ['right'] }).rooms
		).toHaveLength(1);
	});
});

describe('unconnectedRooms', () => {
	it('reports rooms without a shared wall, but not a single room', async () => {
		const { unconnectedRooms } = await import('./adjacency.ts');
		const [left, right] = pair();
		expect(unconnectedRooms([left])).toEqual([]);
		expect(unconnectedRooms([left, right])).toEqual([]);
		const far = { ...rectangleRoom('far'), boardPos: { x: 20000, y: 0, rot: 0 } };
		expect(unconnectedRooms([left, right, far]).map((room) => room.id)).toEqual(['far']);
		expect(unconnectedRooms(pair(600)).map((room) => room.id)).toEqual(['left', 'right']);
		expect(unconnectedRooms([left, right, { ...far, separate: true }])).toEqual([]);
	});
});

describe('dockAtThickness', () => {
	it('moves the neighbour so the shared wall gets the requested thickness', async () => {
		const { dockAtThickness } = await import('./adjacency.ts');
		const rooms = pair();
		const link = wallLinks(rooms).find((candidate) => candidate.roomId === 'left')!;
		const moved = dockAtThickness(rooms, link, 250)!;
		expect(moved).toEqual({ roomId: 'right', boardPos: { x: 4250, y: 0, rot: 0 } });
		const after = rooms.map((room) =>
			room.id === 'right' ? { ...room, boardPos: moved.boardPos } : room
		);
		expect(wallLinks(after).find((candidate) => candidate.roomId === 'left')?.thickness).toBe(250);
	});
});
