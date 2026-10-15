import { Box3, Vector3 } from 'three';
import { mirroredOpenings, withMirroredOpenings } from '#lib/core/adjacency.ts';
import { WALL_THICKNESS } from '#lib/core/defaults.ts';
import {
	add,
	pointInPolygon,
	pointOnSegmentDistance,
	scale,
	sub,
	dot,
	type Vec
} from '#lib/core/geometry.ts';
import type { Room, Variant } from '#lib/core/schema.ts';
import { MM, roomOrigin, toWorld } from '../coords.ts';
import type { FloorHit, SceneContent, SharedOpenings } from '../types.ts';

export interface RoomFrame {
	room: Room;
	origin: Vector3;
	rotationY: number;
}

export function sceneVariant(content: SceneContent): Variant | undefined {
	const id = content.variantId ?? content.project.activeVariantId;
	return id === undefined
		? undefined
		: content.project.variants.find((variant) => variant.id === id);
}

export function sceneRooms(content: SceneContent): Room[] {
	const variant = sceneVariant(content);
	const connected = new Map(
		withMirroredOpenings(content.project.rooms).map((room) => [room.id, room])
	);
	const rooms: Room[] = [];
	for (const id of content.roomIds) {
		const room = connected.get(id);
		if (!room) continue;
		const extra = (variant?.suggestions ?? [])
			.filter((suggestion) => suggestion.roomId === room.id)
			.map((suggestion) => ({ ...suggestion.element, status: 'suggested' as const }));
		rooms.push(extra.length > 0 ? { ...room, elements: [...room.elements, ...extra] } : room);
	}
	return rooms;
}

// Where two rooms of the scene share a wall, the door leaf (or window) is built once, in the room it opens into.
// The hole is cut in both walls.
export function sharedOpenings(content: SceneContent): Map<string, SharedOpenings> {
	const present = new Set(content.roomIds);
	const byId = new Map(content.project.rooms.map((room) => [room.id, room]));
	const result = new Map<string, { silent: Set<string>; covered: Set<string> }>();
	const entry = (roomId: string) => {
		let found = result.get(roomId);
		if (!found) {
			found = { silent: new Set(), covered: new Set() };
			result.set(roomId, found);
		}
		return found;
	};
	for (const mirrored of mirroredOpenings(content.project.rooms)) {
		if (!present.has(mirrored.roomId) || !present.has(mirrored.sourceRoomId)) continue;
		const original = byId
			.get(mirrored.sourceRoomId)
			?.elements.find((element) => element.id === mirrored.element.id.split('@')[0]);
		if (!original || (original.kind !== 'door' && original.kind !== 'window')) continue;
		entry(mirrored.roomId).covered.add(mirrored.element.id);
		const opensIntoNeighbour = original.kind === 'door' && original.swing === 'out';
		if (opensIntoNeighbour) entry(mirrored.sourceRoomId).silent.add(original.id);
		else entry(mirrored.roomId).silent.add(mirrored.element.id);
	}
	return result;
}

export function roomFrames(content: SceneContent): RoomFrame[] {
	const rooms = sceneRooms(content);
	const arranged = content.roomIds.length > 1;
	return rooms.map((room) => {
		const origin = roomOrigin(room, arranged);
		return { room, origin: origin.position, rotationY: origin.rotationY };
	});
}

export function worldToRoom(frame: RoomFrame, x: number, z: number): Vec {
	const dx = x - frame.origin.x;
	const dz = z - frame.origin.z;
	const cos = Math.cos(frame.rotationY);
	const sin = Math.sin(frame.rotationY);
	return { x: (dx * cos - dz * sin) / MM, y: -(dx * sin + dz * cos) / MM };
}

export function roomToWorld(frame: RoomFrame, point: Vec, heightMm = 0): Vector3 {
	const local = toWorld(point, heightMm);
	local.applyAxisAngle(new Vector3(0, 1, 0), frame.rotationY);
	return local.add(frame.origin);
}

export function layoutBounds(frames: readonly RoomFrame[]): Box3 {
	const box = new Box3();
	for (const frame of frames) {
		const margin = WALL_THICKNESS * 1.5;
		const xs = frame.room.polygon.map((p) => p.x);
		const ys = frame.room.polygon.map((p) => p.y);
		const corners: Vec[] = [
			{ x: Math.min(...xs) - margin, y: Math.min(...ys) - margin },
			{ x: Math.max(...xs) + margin, y: Math.min(...ys) - margin },
			{ x: Math.max(...xs) + margin, y: Math.max(...ys) + margin },
			{ x: Math.min(...xs) - margin, y: Math.max(...ys) + margin }
		];
		for (const corner of corners) {
			box.expandByPoint(roomToWorld(frame, corner, 0));
			box.expandByPoint(roomToWorld(frame, corner, frame.room.height));
		}
	}
	return box;
}

export function floorAt(frames: readonly RoomFrame[], x: number, z: number): FloorHit | null {
	for (const frame of frames) {
		const local = worldToRoom(frame, x, z);
		if (pointInPolygon(local, frame.room.polygon)) {
			return { roomId: frame.room.id, x: Math.round(local.x), y: Math.round(local.y) };
		}
	}
	return null;
}

export function nearestBoundaryPoint(polygon: readonly Vec[], point: Vec): Vec {
	let best = polygon[0];
	let bestDistance = Infinity;
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i];
		const b = polygon[(i + 1) % polygon.length];
		const ab = sub(b, a);
		const lengthSq = dot(ab, ab);
		const t = lengthSq < 1e-9 ? 0 : Math.max(0, Math.min(1, dot(sub(point, a), ab) / lengthSq));
		const candidate = add(a, scale(ab, t));
		const d = pointOnSegmentDistance(point, a, b);
		if (d < bestDistance) {
			bestDistance = d;
			best = candidate;
		}
	}
	return best;
}

const PREFERRED_BIAS = 400;

// Like floorAt, but a point outside all rooms is clamped to the closest room, favouring the preferred one.
export function clampedFloorAt(
	frames: readonly RoomFrame[],
	x: number,
	z: number,
	preferRoomId?: string
): FloorHit | null {
	const inside = floorAt(frames, x, z);
	if (inside) return inside;
	let best: { frame: RoomFrame; point: Vec; score: number } | null = null;
	for (const frame of frames) {
		const local = worldToRoom(frame, x, z);
		const point = nearestBoundaryPoint(frame.room.polygon, local);
		const distance = Math.hypot(point.x - local.x, point.y - local.y);
		const score = distance - (frame.room.id === preferRoomId ? PREFERRED_BIAS : 0);
		if (!best || score < best.score) best = { frame, point, score };
	}
	if (!best) return null;
	return {
		roomId: best.frame.room.id,
		x: Math.round(best.point.x),
		y: Math.round(best.point.y),
		outside: true
	};
}

export function footprintPoints(frames: readonly RoomFrame[]): { x: number; z: number }[][] {
	return frames.map((frame) => {
		const margin = WALL_THICKNESS * 1.1;
		const center = frame.room.polygon.reduce(
			(sum, point) => ({
				x: sum.x + point.x / frame.room.polygon.length,
				y: sum.y + point.y / frame.room.polygon.length
			}),
			{ x: 0, y: 0 }
		);
		return frame.room.polygon.map((point) => {
			const away = { x: point.x - center.x, y: point.y - center.y };
			const length = Math.hypot(away.x, away.y) || 1;
			const world = roomToWorld(
				frame,
				{ x: point.x + (away.x / length) * margin, y: point.y + (away.y / length) * margin },
				0
			);
			return { x: world.x, z: world.z };
		});
	});
}
