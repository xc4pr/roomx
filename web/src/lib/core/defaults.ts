import { areaMm2, centroid, wall } from './geometry.ts';
import type { ElementKind, Point, Room, RoomElement, RoomType } from './schema.ts';
import type { IdFactory } from './ids.ts';

export const DEFAULT_ROOM = { length: 4000, width: 3000, height: 2500 } as const;
export const WALL_THICKNESS = 150;
export const EYE_HEIGHT = 1650;
export const SOCKET_WARN_DISTANCE = 1500;
export const SWITCH_CENTER_ABOVE_WORKTOP = 1150;

const BOX = 80;

export function rectanglePolygon(length: number, width: number): Point[] {
	return [
		{ x: 0, y: 0 },
		{ x: length, y: 0 },
		{ x: length, y: width },
		{ x: 0, y: width }
	];
}

export function createRoom(
	id: string,
	name: string,
	type: RoomType = 'other',
	boardPos = { x: 0, y: 0, rot: 0 }
): Room {
	return {
		id,
		name,
		type,
		polygon: rectanglePolygon(DEFAULT_ROOM.length, DEFAULT_ROOM.width),
		height: DEFAULT_ROOM.height,
		boardPos,
		elements: [],
		photos: []
	};
}

export function createElement(
	kind: ElementKind,
	room: Pick<Room, 'polygon' | 'height'>,
	wallNumber: number,
	centerAlong: number,
	newId: IdFactory
): RoomElement {
	const id = newId();
	const status = 'existing' as const;
	if (kind === 'ceilingLamp') {
		const center = centroid(room.polygon);
		return { id, kind, status, x: Math.round(center.x), y: Math.round(center.y) };
	}
	const place = (width: number, height: number, elevation: number) => {
		const length = Math.round(wall(room.polygon, wallNumber)?.length ?? width);
		const offset = Math.max(0, Math.min(length - width, Math.round(centerAlong - width / 2)));
		return { id, status, wall: wallNumber, offset, width, height, elevation };
	};
	switch (kind) {
		case 'door':
			return { ...place(800, 2000, 0), kind, hinge: 'start', swing: 'in' };
		case 'window':
			return { ...place(1200, 1400, 900), kind, windowType: 'tiltTurn' };
		case 'builtin':
			return { ...place(1000, Math.min(2400, room.height), 0), kind, depth: 600 };
		case 'obstacle':
			return { ...place(400, room.height, 0), kind, depth: 300 };
		case 'socket':
			return { ...place(BOX, BOX, 300 - BOX / 2), kind, gang: 1, usb: false };
		case 'switch':
			return { ...place(BOX, BOX, 1050 - BOX / 2), kind };
		case 'wallLamp':
			return { ...place(200, 200, 1800 - 100), kind };
		case 'dataPort':
			return { ...place(BOX, BOX, 300 - BOX / 2), kind, portType: 'lan' };
		case 'radiator':
			return { ...place(1000, 600, 150), kind, depth: 100 };
	}
}

export function socketWidth(gang: number): number {
	return BOX * gang;
}

export function areaM2(polygon: readonly Point[]): number {
	return Math.round(areaMm2(polygon) / 10000) / 100;
}
