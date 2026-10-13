import {
	add,
	dot,
	elementPosition,
	itemFootprint,
	pointInPolygon,
	scale,
	sub,
	type Vec
} from '#lib/core/geometry.ts';
import type { Item, Point, RoomElement } from '#lib/core/schema.ts';

export interface SocketLink {
	socket: Vec;
	target: Vec;
	distance: number;
}

function nearestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
	const ab = sub(b, a);
	const lenSq = dot(ab, ab);
	if (lenSq < 1e-9) return a;
	const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / lenSq));
	return add(a, scale(ab, t));
}

export function nearestOnShape(p: Vec, shape: readonly Vec[]): Vec {
	if (pointInPolygon(p, shape)) return p;
	let best = shape[0];
	let bestDistance = Infinity;
	for (let i = 0; i < shape.length; i++) {
		const q = nearestOnSegment(p, shape[i], shape[(i + 1) % shape.length]);
		const d = Math.hypot(p.x - q.x, p.y - q.y);
		if (d < bestDistance) {
			best = q;
			bestDistance = d;
		}
	}
	return best;
}

export function socketLink(
	polygon: readonly Point[],
	item: Pick<Item, 'x' | 'y' | 'rotation' | 'dims'>,
	elements: readonly RoomElement[]
): SocketLink | undefined {
	const shape = itemFootprint(item);
	let best: SocketLink | undefined;
	for (const element of elements) {
		if (element.kind !== 'socket') continue;
		const socket = elementPosition(polygon, element);
		if (!socket) continue;
		const target = nearestOnShape(socket, shape);
		const distance = Math.round(Math.hypot(socket.x - target.x, socket.y - target.y));
		if (!best || distance < best.distance) best = { socket, target, distance };
	}
	return best;
}
