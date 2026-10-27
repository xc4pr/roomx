import { ShapeUtils, Vector2 } from 'three';
import { roomFloorId, SPIRAL_NEWEL, stairContext, type StairContext } from '#lib/core/floors.ts';
import { boardToRoom, roomToBoard, type Vec } from '#lib/core/geometry.ts';
import type { Project, Room } from '#lib/core/schema.ts';
import { outlineLoops } from './slab.ts';

export interface RoomHoles {
	// Room coordinates: the stairwell in the floor of a room on the upper storey.
	floor: Vec[][];
	// Room coordinates: the stairwell in the ceiling of a room on the lower storey.
	ceiling: Vec[][];
	// The same ceiling opening as convex pieces, for cutting it out of a sloped ceiling.
	ceilingParts: Vec[][];
}

const MIN_AREA = 1000;
const MIN_PIECE_AREA = 1;
const DISC_POINTS = 48;

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

function withoutDuplicates(polygon: readonly Vec[]): Vec[] {
	return polygon.filter((p, i) => {
		const next = polygon[(i + 1) % polygon.length];
		return Math.abs(p.x - next.x) > 0.01 || Math.abs(p.y - next.y) > 0.01;
	});
}

// A concave room as triangles, so that every piece of the opening is cut by a convex shape.
function convexParts(polygon: readonly Vec[]): Vec[][] {
	if (isConvex(polygon)) return [[...polygon]];
	const contour = polygon.map((p) => new Vector2(p.x, p.y));
	return ShapeUtils.triangulateShape(contour, []).map((face) => face.map((i) => polygon[i]));
}

// The part of each tread of the opening (board coordinates, convex) that lies in the room, in room
// coordinates, as convex pieces. Several rooms can share one opening, so every room takes its own.
function parts(room: Room, treads: readonly (readonly Vec[])[]): Vec[][] {
	const shapes = convexParts(room.polygon);
	const result: Vec[][] = [];
	for (const tread of treads) {
		const local = tread.map((p) => boardToRoom(room, p));
		for (const shape of shapes) {
			const piece = withoutDuplicates(clip(local, shape));
			if (piece.length >= 3 && Math.abs(area(piece)) > MIN_PIECE_AREA) result.push(piece);
		}
	}
	return result;
}

// Loops around the pieces; tiny gaps between pieces and a mere touch of an opening are dropped.
function loops(pieces: readonly Vec[][]): Vec[][] {
	return outlineLoops(pieces).filter((loop) => Math.abs(area(loop)) > MIN_AREA);
}

// The treads of a spiral stair can turn further than a full circle and overlap; the opening is
// then the whole disc.
function openingTreads(context: StairContext): Vec[][] {
	const treads = context.opening.map((tread) => tread.polygon);
	const { stair } = context;
	if (stair.shape !== 'spiral' || treads.length === 0) return treads;
	const centre = { x: stair.x, y: stair.y };
	const angle = (p: Vec) => Math.atan2(p.y - centre.y, p.x - centre.x);
	const turn = treads.reduce((sum, tread) => {
		let delta = Math.abs(angle(tread[tread.length - 1]) - angle(tread[0]));
		if (delta > Math.PI) delta = 2 * Math.PI - delta;
		return sum + delta;
	}, 0);
	if (turn < 2 * Math.PI - 1e-6) return treads;
	// Around the circle, so the polygon covers the arcs of the treads.
	const radius = (SPIRAL_NEWEL + stair.width) / Math.cos(Math.PI / DISC_POINTS);
	return [
		Array.from({ length: DISC_POINTS }, (_, i) => ({
			x: centre.x + radius * Math.cos((2 * Math.PI * i) / DISC_POINTS),
			y: centre.y + radius * Math.sin((2 * Math.PI * i) / DISC_POINTS)
		}))
	];
}

function stairwellTreads(project: Project, floorId: string, side: 'to' | 'from'): Vec[][] {
	return (project.stairs ?? []).flatMap((stair) => {
		const context = stairContext(project, stair);
		if (!context || context[side].id !== floorId) return [];
		return openingTreads(context);
	});
}

export function roomHoles(project: Project, room: Room): RoomHoles {
	const floorId = roomFloorId(project, room);
	if (floorId === undefined) return { floor: [], ceiling: [], ceilingParts: [] };
	const ceilingParts = parts(room, stairwellTreads(project, floorId, 'from'));
	return {
		floor: loops(parts(room, stairwellTreads(project, floorId, 'to'))),
		ceiling: loops(ceilingParts),
		ceilingParts
	};
}

export function holeToBoard(room: Room, hole: readonly Vec[]): Vec[] {
	return hole.map((p) => roomToBoard(room, p));
}
