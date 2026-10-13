import { describe, expect, it } from 'vitest';
import { rectanglePolygon } from '#lib/core/defaults.ts';
import { roomToBoard } from '#lib/core/geometry.ts';
import { boardCentroid, hitRoom, roomBox, roomsBox, rotatedBoardPos } from './rooms.ts';

const room = (x: number, y: number, rot = 0) => ({
	boardPos: { x, y, rot },
	polygon: rectanglePolygon(4000, 3000)
});

describe('rooms', () => {
	it('computes board boxes', () => {
		expect(roomBox(room(1000, 500))).toEqual({ minX: 1000, minY: 500, maxX: 5000, maxY: 3500 });
		expect(roomsBox([room(0, 0), room(5000, 0)])).toEqual({
			minX: 0,
			minY: 0,
			maxX: 9000,
			maxY: 3000
		});
		expect(roomsBox([])).toBeUndefined();
	});

	it('hits the topmost room and tolerates the wall band', () => {
		const rooms = [room(0, 0), room(2000, 0)];
		expect(hitRoom(rooms, { x: 3000, y: 1000 })).toBe(rooms[1]);
		expect(hitRoom(rooms, { x: 500, y: 1000 })).toBe(rooms[0]);
		expect(hitRoom(rooms, { x: -100, y: 1000 })).toBe(rooms[0]);
		expect(hitRoom(rooms, { x: -2000, y: 1000 })).toBeUndefined();
	});

	it('rotates around the centre and keeps it fixed', () => {
		const r = room(1000, 2000);
		const before = boardCentroid(r);
		const pos = rotatedBoardPos(r, 90);
		expect(pos.rot).toBe(90);
		const after = roomToBoard({ boardPos: pos }, { x: 2000, y: 1500 });
		expect(after.x).toBeCloseTo(before.x, 0);
		expect(after.y).toBeCloseTo(before.y, 0);
		expect(rotatedBoardPos({ ...r, boardPos: pos }, 270).rot).toBe(0);
	});
});
