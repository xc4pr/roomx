import {
	add,
	boundingBox,
	centroid,
	pointInPolygon,
	roomToBoard,
	rotate,
	sub,
	type Vec
} from '#lib/core/geometry.ts';
import { WALL_THICKNESS } from '#lib/core/defaults.ts';
import type { BoardPos, Room } from '#lib/core/schema.ts';
import { boardToRoom } from '#lib/core/geometry.ts';
import type { Box } from './camera.ts';

type Placed = Pick<Room, 'boardPos' | 'polygon'>;

export function boardPolygon(room: Placed): Vec[] {
	return room.polygon.map((corner) => roomToBoard(room, corner));
}

export function roomBox(room: Placed, pad = 0): Box {
	const box = boundingBox(boardPolygon(room));
	return { minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad };
}

export function roomsBox(rooms: readonly Placed[], pad = 0): Box | undefined {
	if (rooms.length === 0) return undefined;
	const points = rooms.flatMap((room) => boardPolygon(room));
	const box = boundingBox(points);
	return { minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad };
}

export function boardCentroid(room: Placed): Vec {
	return roomToBoard(room, centroid(room.polygon));
}

export function hitRoom<R extends Placed>(
	rooms: readonly R[],
	point: Vec,
	tolerance = WALL_THICKNESS
): R | undefined {
	for (let i = rooms.length - 1; i >= 0; i--) {
		const room = rooms[i];
		if (pointInPolygon(boardToRoom(room, point), room.polygon, tolerance)) return room;
	}
	return undefined;
}

export function rotatedBoardPos(room: Placed, degrees: number): BoardPos {
	const center = centroid(room.polygon);
	const worldCenter = roomToBoard(room, center);
	const rot = (((room.boardPos.rot + degrees) % 360) + 360) % 360;
	const origin = sub(worldCenter, rotate(center, rot));
	return { x: Math.round(origin.x), y: Math.round(origin.y), rot };
}

export function shiftedBoardPos(pos: BoardPos, delta: Vec): BoardPos {
	const next = add(pos, delta);
	return { ...pos, x: Math.round(next.x), y: Math.round(next.y) };
}

export function snapToCentimetre(value: number): number {
	return Math.round(value / 10) * 10;
}
