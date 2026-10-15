import {
	add,
	distance,
	dot,
	pointInPolygon,
	pointOnSegmentDistance,
	scale,
	sub,
	walls,
	type Vec
} from '#lib/core/geometry.ts';
import type { Point } from '#lib/core/schema.ts';
import { roomToWorld, type RoomFrame } from './layout.ts';

export function canStandAt(polygon: readonly Point[], point: Vec, radius: number): boolean {
	if (!pointInPolygon(point, polygon)) return false;
	for (let i = 0; i < polygon.length; i++) {
		if (pointOnSegmentDistance(point, polygon[i], polygon[(i + 1) % polygon.length]) < radius) {
			return false;
		}
	}
	return true;
}

// Slides along walls: tries the full step, then each axis alone, then stays.
export function moveInside(polygon: readonly Point[], from: Vec, to: Vec, radius: number): Vec {
	if (canStandAt(polygon, to, radius)) return to;
	const alongX = { x: to.x, y: from.y };
	if (distance(alongX, from) > 0 && canStandAt(polygon, alongX, radius)) return alongX;
	const alongY = { x: from.x, y: to.y };
	if (distance(alongY, from) > 0 && canStandAt(polygon, alongY, radius)) return alongY;
	return from;
}

export function lookDirection(yaw: number): { x: number; z: number } {
	return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function walkStep(
	yaw: number,
	input: { forward: number; strafe: number },
	speed: number,
	seconds: number
): { x: number; z: number } {
	const forward = lookDirection(yaw);
	const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
	const length = Math.hypot(input.forward, input.strafe);
	const scale = length > 1 ? 1 / length : 1;
	return {
		x: (forward.x * input.forward + right.x * input.strafe) * scale * speed * seconds,
		z: (forward.z * input.forward + right.z * input.strafe) * scale * speed * seconds
	};
}

export function bestStandPoint(polygon: readonly Point[], radius: number): Vec | undefined {
	const xs = polygon.map((p) => p.x);
	const ys = polygon.map((p) => p.y);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	const stepX = (Math.max(...xs) - minX) / 32;
	const stepY = (Math.max(...ys) - minY) / 32;
	let best: Vec | undefined;
	let bestClearance = -Infinity;
	for (let i = 1; i < 32; i++) {
		for (let j = 1; j < 32; j++) {
			const point = { x: minX + stepX * i, y: minY + stepY * j };
			if (!pointInPolygon(point, polygon)) continue;
			let clearance = Infinity;
			for (let k = 0; k < polygon.length; k++) {
				clearance = Math.min(
					clearance,
					pointOnSegmentDistance(point, polygon[k], polygon[(k + 1) % polygon.length])
				);
			}
			if (clearance > bestClearance) {
				bestClearance = clearance;
				best = point;
			}
		}
	}
	return bestClearance >= radius ? best : undefined;
}

export interface WalkDoor {
	a: Vec;
	b: Vec;
	id?: string;
	roomId?: string;
}

export interface WalkRoomInput {
	polygon: readonly Vec[];
	doors: readonly WalkDoor[];
}

interface Segment {
	a: Vec;
	b: Vec;
}

interface Portal {
	origin: Vec;
	tangent: Vec;
	normal: Vec;
	from: number;
	to: number;
	depth: number;
}

export interface WalkMap {
	rooms: { polygon: readonly Vec[]; segments: Segment[] }[];
	portals: Portal[];
}

const MAX_DOOR_GAP = 1.3;
const PORTAL_SLACK = 0.04;
const SEGMENT_EPS = 1e-6;

function unit(v: Vec): Vec {
	const length = Math.hypot(v.x, v.y) || 1;
	return { x: v.x / length, y: v.y / length };
}

function midpoint(door: WalkDoor): Vec {
	return scale(add(door.a, door.b), 0.5);
}

function outwardNormal(polygon: readonly Vec[], door: WalkDoor): Vec {
	const tangent = unit(sub(door.b, door.a));
	const normal = { x: -tangent.y, y: tangent.x };
	const probe = add(midpoint(door), scale(normal, 0.05));
	return pointInPolygon(probe, polygon) ? scale(normal, -1) : normal;
}

function cutSegments(polygon: readonly Vec[], openings: readonly WalkDoor[]): Segment[] {
	const segments: Segment[] = [];
	for (let i = 0; i < polygon.length; i++) {
		const start = polygon[i];
		const end = polygon[(i + 1) % polygon.length];
		const length = distance(start, end);
		if (length < SEGMENT_EPS) continue;
		const direction = scale(sub(end, start), 1 / length);
		const cuts: { from: number; to: number }[] = [];
		for (const door of openings) {
			const mid = midpoint(door);
			if (pointOnSegmentDistance(mid, start, end) > 0.05) continue;
			const from = dot(sub(door.a, start), direction);
			const to = dot(sub(door.b, start), direction);
			cuts.push({ from: Math.min(from, to), to: Math.max(from, to) });
		}
		cuts.sort((x, y) => x.from - y.from);
		let cursor = 0;
		for (const cut of cuts) {
			if (cut.from > cursor + SEGMENT_EPS) {
				segments.push({
					a: add(start, scale(direction, cursor)),
					b: add(start, scale(direction, cut.from))
				});
			}
			cursor = Math.max(cursor, cut.to);
		}
		if (cursor < length - SEGMENT_EPS) {
			segments.push({ a: add(start, scale(direction, cursor)), b: end });
		}
	}
	return segments;
}

// A door in a shared wall exists twice: the original and its mirror in the neighbour ("<id>@<roomId>").
function twins(x: WalkDoor, y: WalkDoor): boolean {
	if (x.id === undefined || y.id === undefined) return false;
	return x.id === `${y.id}@${x.roomId}` || y.id === `${x.id}@${y.roomId}`;
}

// Doors in a wall that two rooms share open a passage; doors to the outside stay closed.
export function buildWalkMap(inputs: readonly WalkRoomInput[], radius: number): WalkMap {
	const connected = inputs.map(() => new Set<WalkDoor>());
	const portals: Portal[] = [];
	inputs.forEach((room, i) => {
		for (const door of room.doors) {
			const tangent = unit(sub(door.b, door.a));
			const normal = outwardNormal(room.polygon, door);
			const origin = midpoint(door);
			const half = distance(door.a, door.b) / 2;
			inputs.forEach((other, j) => {
				if (i === j) return;
				for (const match of other.doors) {
					if (!twins(door, match)) continue;
					const otherTangent = unit(sub(match.b, match.a));
					if (Math.abs(dot(tangent, otherTangent)) < 0.97) continue;
					if (dot(normal, outwardNormal(other.polygon, match)) > -0.9) continue;
					const gap = dot(sub(midpoint(match), origin), normal);
					if (gap < -PORTAL_SLACK || gap > MAX_DOOR_GAP) continue;
					const t0 = dot(sub(match.a, origin), tangent);
					const t1 = dot(sub(match.b, origin), tangent);
					const lo = Math.max(-half, Math.min(t0, t1));
					const hi = Math.min(half, Math.max(t0, t1));
					if (hi - lo < radius * 2 + 0.1) continue;
					connected[i].add(door);
					connected[j].add(match);
					if (i < j) {
						portals.push({
							origin,
							tangent,
							normal,
							from: lo + radius,
							to: hi - radius,
							depth: Math.max(0, gap)
						});
					}
				}
			});
		}
	});
	return {
		rooms: inputs.map((room, index) => ({
			polygon: room.polygon,
			segments: cutSegments(room.polygon, [...connected[index]])
		})),
		portals
	};
}

function inPortal(portal: Portal, point: Vec): boolean {
	const delta = sub(point, portal.origin);
	const along = dot(delta, portal.tangent);
	const across = dot(delta, portal.normal);
	return (
		along >= portal.from &&
		along <= portal.to &&
		across >= -PORTAL_SLACK &&
		across <= portal.depth + PORTAL_SLACK
	);
}

export function standable(map: WalkMap, point: Vec, radius: number): boolean {
	if (map.portals.some((portal) => inPortal(portal, point))) return true;
	return map.rooms.some(
		(room) =>
			pointInPolygon(point, room.polygon) &&
			room.segments.every(
				(segment) => pointOnSegmentDistance(point, segment.a, segment.b) >= radius
			)
	);
}

function nearestSegment(map: WalkMap, point: Vec): Segment | undefined {
	let best: Segment | undefined;
	let bestDistance = Infinity;
	for (const room of map.rooms) {
		for (const segment of room.segments) {
			const d = pointOnSegmentDistance(point, segment.a, segment.b);
			if (d < bestDistance) {
				bestDistance = d;
				best = segment;
			}
		}
	}
	return best;
}

// Slides along the nearest wall, then along the world axes, then stays.
export function moveOnMap(map: WalkMap, from: Vec, to: Vec, radius: number): Vec {
	if (standable(map, to, radius)) return to;
	const delta = sub(to, from);
	const wall = nearestSegment(map, to);
	if (wall) {
		const tangent = unit(sub(wall.b, wall.a));
		const slide = add(from, scale(tangent, dot(delta, tangent)));
		if (distance(slide, from) > 0 && standable(map, slide, radius)) return slide;
	}
	const alongX = { x: to.x, y: from.y };
	if (distance(alongX, from) > 0 && standable(map, alongX, radius)) return alongX;
	const alongY = { x: from.x, y: to.y };
	if (distance(alongY, from) > 0 && standable(map, alongY, radius)) return alongY;
	return from;
}

export function walkInputs(frames: readonly RoomFrame[]): WalkRoomInput[] {
	return frames.map((frame) => {
		const toWorldPoint = (point: Vec): Vec => {
			const world = roomToWorld(frame, point);
			return { x: world.x, y: world.z };
		};
		const polygon = frame.room.polygon.map(toWorldPoint);
		const edges = walls(frame.room.polygon);
		const doors: WalkDoor[] = [];
		for (const element of frame.room.elements) {
			if (element.kind !== 'door') continue;
			const edge = edges[element.wall - 1];
			if (!edge) continue;
			const at = (along: number) => add(edge.start, scale(edge.direction, along));
			doors.push({
				a: toWorldPoint(at(element.offset)),
				b: toWorldPoint(at(element.offset + element.width)),
				id: element.id,
				roomId: frame.room.id
			});
		}
		return { polygon, doors };
	});
}

export function approach(current: number, target: number, rate: number, seconds: number): number {
	const next = current + (target - current) * (1 - Math.exp(-rate * seconds));
	return Math.abs(next - target) < 0.0005 ? target : next;
}

export function stickCurve(value: number): number {
	return Math.sign(value) * Math.pow(Math.min(1, Math.abs(value)), 1.6);
}
