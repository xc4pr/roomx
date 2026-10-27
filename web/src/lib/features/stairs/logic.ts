import { add, centroid, distance, rotate, type Vec } from '#lib/core/geometry.ts';
import {
	nextFloor,
	stairContext,
	stairZonesForRoom,
	type StairContext,
	type StairZone
} from '#lib/core/floors.ts';
import type { Project, Room, Stair } from '#lib/core/schema.ts';

export const DEFAULT_STAIR_WIDTH = 900;
export const MIN_STAIR_WIDTH = 600;
export const MAX_STAIR_WIDTH = 1500;
export const TURN_STEP = 15;

type Staired = Pick<Project, 'rooms' | 'floors' | 'stairs'>;

export function normaliseAngle(degrees: number): number {
	const wrapped = ((degrees % 360) + 360) % 360;
	return wrapped > 180 ? wrapped - 360 : wrapped;
}

export function snapAngle(degrees: number, step = TURN_STEP): number {
	return normaliseAngle(Math.round(degrees / step) * step);
}

// Rotation of a stair whose foot is `foot` and which a handle behind the foot is dragged to.
export function angleFromHandle(foot: Vec, pointer: Vec): number {
	return (Math.atan2(pointer.x - foot.x, foot.y - pointer.y) * 180) / Math.PI;
}

export function handlePosition(
	stair: Pick<Stair, 'x' | 'y' | 'rotation'>,
	distanceMm: number
): Vec {
	return add({ x: stair.x, y: stair.y }, rotate({ x: 0, y: -distanceMm }, stair.rotation));
}

export function canAddStair(project: Pick<Project, 'floors'> | null | undefined, floorId?: string) {
	return !!project && !!floorId && nextFloor(project, floorId) !== undefined;
}

export function newStair(floorId: string, at: Vec): Omit<Stair, 'id'> {
	return {
		fromFloorId: floorId,
		shape: 'straight',
		x: Math.round(at.x / 10) * 10,
		y: Math.round(at.y / 10) * 10,
		rotation: 0,
		width: DEFAULT_STAIR_WIDTH,
		turn: 'right'
	};
}

export interface StairSummary {
	context: StairContext;
	steps: number;
	riser: number;
	tread: number;
	stride: number;
	run: number;
}

// Length of the walking line: through the middle of every tread, plus one tread for the last step.
export function runLength(context: StairContext): number {
	const centres = context.layout.treads.map((tread) => centroid(tread.polygon));
	let run = context.layout.risers.tread;
	for (let i = 1; i < centres.length; i++) run += distance(centres[i - 1], centres[i]);
	return run;
}

export function summarise(project: Staired, stair: Stair): StairSummary | undefined {
	const context = stairContext(project, stair);
	if (!context) return undefined;
	const { count, riser, tread } = context.layout.risers;
	return {
		context,
		steps: count,
		riser,
		tread,
		stride: 2 * riser + tread,
		run: runLength(context)
	};
}

export function stairsStartingOn(project: Pick<Project, 'stairs'>, floorId: string): Stair[] {
	return (project.stairs ?? []).filter((stair) => stair.fromFloorId === floorId);
}

export function stairsArrivingOn(project: Staired, floorId: string): StairContext[] {
	return (project.stairs ?? []).flatMap((stair) => {
		const context = stairContext(project, stair);
		return context && context.to.id === floorId ? [context] : [];
	});
}

export function roomStairZones(project: Staired | null | undefined, room: Room): StairZone[] {
	return project && (project.stairs?.length ?? 0) > 0 ? stairZonesForRoom(project, room) : [];
}

export interface CutLine {
	from: Vec;
	to: Vec;
}

// Break line across the flight, drawn slightly slanted at about the middle of the stair.
export function cutLine(context: StairContext): { line: CutLine; above: number } | undefined {
	const treads = context.layout.treads;
	if (treads.length < 3) return undefined;
	const index = Math.min(treads.length - 2, Math.max(1, Math.round(treads.length * 0.55)));
	const centres = treads.map((tread) => centroid(tread.polygon));
	const mid = {
		x: (centres[index - 1].x + centres[index].x) / 2,
		y: (centres[index - 1].y + centres[index].y) / 2
	};
	const along = {
		x: centres[index].x - centres[index - 1].x,
		y: centres[index].y - centres[index - 1].y
	};
	const length = Math.hypot(along.x, along.y) || 1;
	const dir = { x: along.x / length, y: along.y / length };
	const across = { x: -dir.y, y: dir.x };
	const reach = treads[index].polygon.map(
		(p) => (p.x - mid.x) * across.x + (p.y - mid.y) * across.y
	);
	const lo = Math.min(...reach) - 40;
	const hi = Math.max(...reach) + 40;
	const slant = (length * 0.35) / (hi - lo || 1);
	const point = (offset: number, shift: number): Vec => ({
		x: mid.x + across.x * offset + dir.x * shift,
		y: mid.y + across.y * offset + dir.y * shift
	});
	return {
		line: { from: point(lo, -slant * (hi - lo) * 0.5), to: point(hi, slant * (hi - lo) * 0.5) },
		above: index
	};
}

// Tallest the stair editor may be so that it ends below the tool column at the top left (`reserve`
// px from the top of the board): editor and floor switcher never overlap, also on a phone.
export function editorMaxHeight(reserve: number): string {
	return `min(70%, calc(100% - ${Math.max(0, Math.round(reserve))}px - max(1rem, var(--safe-bottom)) - 4.25rem))`;
}
