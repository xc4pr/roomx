import { roomFloorId, stairContext } from '#lib/core/floors.ts';
import { boardToRoom, pointInPolygon, roomToBoard, type Vec } from '#lib/core/geometry.ts';
import type { Project, Room } from '#lib/core/schema.ts';
import { outlineLoops } from './slab.ts';

export interface RoomHoles {
	// Room coordinates: the stairwell in the floor of a room on the upper storey.
	floor: Vec[][];
	// Room coordinates: the stairwell in the ceiling of a room on the lower storey.
	ceiling: Vec[][];
}

const MIN_AREA = 1000;

function area(polygon: readonly Vec[]): number {
	return (
		polygon.reduce((sum, p, i) => {
			const q = polygon[(i + 1) % polygon.length];
			return sum + (p.x * q.y - q.x * p.y);
		}, 0) / 2
	);
}

function isConvex(polygon: readonly Vec[]): boolean {
	let sign = 0;
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i];
		const b = polygon[(i + 1) % polygon.length];
		const c = polygon[(i + 2) % polygon.length];
		const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
		if (Math.abs(cross) < 1e-6) continue;
		if (sign === 0) sign = Math.sign(cross);
		else if (Math.sign(cross) !== sign) return false;
	}
	return true;
}

// Sutherland-Hodgman: the subject may be concave, the clip polygon must be convex.
function clip(subject: readonly Vec[], clipper: readonly Vec[]): Vec[] {
	const orientation = area(clipper) >= 0 ? 1 : -1;
	let output = [...subject];
	for (let i = 0; i < clipper.length && output.length > 0; i++) {
		const a = clipper[i];
		const b = clipper[(i + 1) % clipper.length];
		const side = (p: Vec) => orientation * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
		const input = output;
		output = [];
		input.forEach((current, index) => {
			const previous = input[(index + input.length - 1) % input.length];
			const sc = side(current);
			const sp = side(previous);
			if (sc >= 0 !== sp >= 0) {
				const t = sp / (sp - sc);
				output.push({
					x: previous.x + (current.x - previous.x) * t,
					y: previous.y + (current.y - previous.y) * t
				});
			}
			if (sc >= 0) output.push(current);
		});
	}
	return output;
}

// The part of each opening loop (board coordinates) that lies in the room, in room coordinates.
// Several rooms can share one opening, so every room takes its own piece.
function pieces(room: Room, loops: readonly (readonly Vec[])[]): Vec[][] {
	const convex = isConvex(room.polygon);
	const result: Vec[][] = [];
	for (const loop of loops) {
		const local = loop.map((p) => boardToRoom(room, p));
		if (convex) {
			const piece = clip(local, room.polygon);
			if (piece.length >= 3 && Math.abs(area(piece)) > MIN_AREA) result.push(piece);
		} else {
			const centre = {
				x: local.reduce((sum, p) => sum + p.x, 0) / local.length,
				y: local.reduce((sum, p) => sum + p.y, 0) / local.length
			};
			if (pointInPolygon(centre, room.polygon, 1)) result.push(local);
		}
	}
	return result;
}

function stairwellLoops(project: Project, floorId: string, side: 'to' | 'from'): Vec[][] {
	return (project.stairs ?? []).flatMap((stair) => {
		const context = stairContext(project, stair);
		if (!context || context[side].id !== floorId || context.opening.length === 0) return [];
		return outlineLoops(context.opening.map((tread) => tread.polygon));
	});
}

export function roomHoles(project: Project, room: Room): RoomHoles {
	const floorId = roomFloorId(project, room);
	if (floorId === undefined) return { floor: [], ceiling: [] };
	return {
		floor: pieces(room, stairwellLoops(project, floorId, 'to')),
		ceiling: pieces(room, stairwellLoops(project, floorId, 'from'))
	};
}

export function holeToBoard(room: Room, hole: readonly Vec[]): Vec[] {
	return hole.map((p) => roomToBoard(room, p));
}
