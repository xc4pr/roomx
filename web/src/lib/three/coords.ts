import { Vector3 } from 'three';
import { roomToBoard, type Vec } from '#lib/core/geometry.ts';
import type { Room } from '#lib/core/schema.ts';

export const MM = 0.001;

export function toWorld(point: Vec, heightMm = 0): Vector3 {
	return new Vector3(point.x * MM, heightMm * MM, -point.y * MM);
}

export function fromWorld(position: { x: number; z: number }): Vec {
	return { x: position.x / MM, y: -position.z / MM };
}

export function degToRad(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

export function roomOrigin(
	room: Room,
	arranged: boolean
): { position: Vector3; rotationY: number } {
	if (!arranged) return { position: new Vector3(), rotationY: 0 };
	return {
		position: toWorld(roomToBoard(room, { x: 0, y: 0 })),
		rotationY: degToRad(room.boardPos.rot)
	};
}
