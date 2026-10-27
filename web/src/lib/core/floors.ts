import { DEFAULT_ROOM, FLOOR_NAMES } from './defaults.ts';
import {
	add,
	boardToRoom,
	ceilingHeightAt,
	centroid,
	distance,
	pointInPolygon,
	rotate,
	type Vec
} from './geometry.ts';
import { isOpenAir, type Floor, type Project, type Room, type Stair } from './schema.ts';

export const RISER = { min: 170, max: 180, target: 175 } as const;
// Step rule: two risers plus one tread make one comfortable stride.
export const STRIDE = 630;
export const MIN_HEADROOM = 2000;
export const SPIRAL_NEWEL = 100;
export const U_EYE = 100;
const SPIRAL_ARC_POINTS = 4;
const EDGE_TOLERANCE = 2;

type Floored = Pick<Project, 'rooms' | 'floors'>;

export function floorsEnabled(project: Pick<Project, 'floors'>): boolean {
	return (project.floors?.length ?? 0) > 0;
}

// The floor a room belongs to; a room without a (known) floor counts to the first floor.
export function roomFloorId(project: Pick<Project, 'floors'>, room: Pick<Room, 'floorId'>): string | undefined {
	const floors = project.floors ?? [];
	if (floors.length === 0) return undefined;
	return floors.some((floor) => floor.id === room.floorId) ? room.floorId : floors[0].id;
}

export function floorRooms(project: Floored, floorId: string): Room[] {
	return project.rooms.filter((room) => roomFloorId(project, room) === floorId);
}

export function floorIndex(project: Pick<Project, 'floors'>, floorId: string): number {
	return (project.floors ?? []).findIndex((floor) => floor.id === floorId);
}

export function nextFloor(project: Pick<Project, 'floors'>, floorId: string): Floor | undefined {
	const floors = project.floors ?? [];
	const index = floorIndex(project, floorId);
	return index >= 0 ? floors[index + 1] : undefined;
}

// Clear room height of a floor: its own value, else the highest indoor room on it.
export function floorClearHeight(project: Floored, floor: Floor): number {
	if (floor.height !== undefined) return floor.height;
	const heights = floorRooms(project, floor.id)
		.filter((room) => !isOpenAir(room))
		.map((room) => room.height);
	return heights.length > 0 ? Math.max(...heights) : DEFAULT_ROOM.height;
}

// From the floor of one storey to the floor of the next: clear height plus slab.
export function floorToFloor(project: Floored, floor: Floor): number {
	return floorClearHeight(project, floor) + floor.slabThickness;
}

// Level of each floor above the lowest one (mm).
export function floorLevels(project: Floored): Map<string, number> {
	const levels = new Map<string, number>();
	let level = 0;
	for (const floor of project.floors ?? []) {
		levels.set(floor.id, level);
		level += floorToFloor(project, floor);
	}
	return levels;
}

// Floors can be switched off again only while at most one floor holds rooms and no stair exists,
// so switching off never drops anything.
export function canDisableFloors(project: Pick<Project, 'rooms' | 'floors' | 'stairs'>): boolean {
	if ((project.stairs?.length ?? 0) > 0) return false;
	const used = new Set(project.rooms.map((room) => roomFloorId(project, room)));
	return used.size <= 1;
}

export function suggestFloorName(project: Pick<Project, 'floors'>): string {
	const used = new Set((project.floors ?? []).map((floor) => floor.name));
	return FLOOR_NAMES.find((name) => !used.has(name)) ?? `${(project.floors?.length ?? 0) + 1}`;
}

export interface Risers {
	count: number;
	riser: number;
	tread: number;
}

// Number of risers for a floor-to-floor height: the riser closest to 175 mm within 170 to 180 mm
// if possible, the tread from the step rule.
export function stairRisers(height: number): Risers {
	const guess = Math.max(1, Math.round(height / RISER.target));
	const candidates = [guess - 1, guess, guess + 1].filter((count) => count > 0);
	const within = candidates.filter((count) => {
		const riser = height / count;
		return riser >= RISER.min && riser <= RISER.max;
	});
	const pool = within.length > 0 ? within : candidates;
	const count = pool.reduce((best, count) =>
		Math.abs(height / count - RISER.target) < Math.abs(height / best - RISER.target) ? count : best
	);
	const riser = height / count;
	return { count, riser, tread: Math.round(STRIDE - 2 * riser) };
}

export interface StairTread {
	// Board coordinates.
	polygon: Vec[];
	// Height of the walking surface above the lower floor.
	height: number;
	landing: boolean;
}

export interface StairLayout {
	risers: Risers;
	treads: StairTread[];
	// Edge where the stair arrives on the upper floor (board coordinates).
	arrival: { from: Vec; to: Vec };
}

function rect(x0: number, x1: number, y0: number, y1: number): Vec[] {
	const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)];
	const [c, d] = [Math.min(y0, y1), Math.max(y0, y1)];
	return [
		{ x: a, y: c },
		{ x: b, y: c },
		{ x: b, y: d },
		{ x: a, y: d }
	];
}

interface LocalTread {
	polygon: Vec[];
	riser: number;
	landing: boolean;
}

// Local frame: origin at the middle of the front edge of the first step, +y = walking direction,
// x to the right. For a spiral stair the origin is its centre and the first step leaves towards +y.
function localTreads(stair: Stair, risers: Risers): { treads: LocalTread[]; arrival: [Vec, Vec] } {
	const w = stair.width;
	const t = risers.tread;
	const treadCount = Math.max(1, risers.count - 1);
	const side = stair.turn === 'left' ? -1 : 1;
	const treads: LocalTread[] = [];
	const push = (polygon: Vec[], landing = false) =>
		treads.push({ polygon, riser: treads.length + 1, landing });

	if (stair.shape === 'straight') {
		for (let i = 0; i < treadCount; i++) push(rect(-w / 2, w / 2, i * t, (i + 1) * t));
		const end = treadCount * t;
		return { treads, arrival: [{ x: -w / 2, y: end }, { x: w / 2, y: end }] };
	}

	if (stair.shape === 'l') {
		const first = Math.floor((treadCount - 1) / 2);
		const second = treadCount - 1 - first;
		for (let i = 0; i < first; i++) push(rect(-w / 2, w / 2, i * t, (i + 1) * t));
		const y0 = first * t;
		push(rect(-w / 2, w / 2, y0, y0 + w), true);
		for (let j = 0; j < second; j++) {
			const inner = side * (w / 2 + j * t);
			push(rect(inner, inner + side * t, y0, y0 + w));
		}
		const x = side * (w / 2 + second * t);
		return { treads, arrival: [{ x, y: y0 }, { x, y: y0 + w }] };
	}

	if (stair.shape === 'u') {
		const first = Math.floor((treadCount - 1) / 2);
		const second = treadCount - 1 - first;
		const back = side * (w + U_EYE);
		for (let i = 0; i < first; i++) push(rect(-w / 2, w / 2, i * t, (i + 1) * t));
		const y0 = first * t;
		// The landing in three parts (above each flight and above the eye) so that its edges meet
		// the flights edge to edge.
		push(rect(-w / 2, w / 2, y0, y0 + w), true);
		push(rect(side * (w / 2), side * (w / 2 + U_EYE), y0, y0 + w), true);
		push(rect(back - w / 2, back + w / 2, y0, y0 + w), true);
		for (let j = 0; j < second; j++) push(rect(back - w / 2, back + w / 2, y0 - (j + 1) * t, y0 - j * t));
		const y = y0 - second * t;
		return { treads, arrival: [{ x: back - w / 2, y }, { x: back + w / 2, y }] };
	}

	// Spiral: sectors around the centre, the tread measured on the walking line.
	const inner = SPIRAL_NEWEL;
	const outer = SPIRAL_NEWEL + w;
	const walking = inner + w / 2;
	const step = t / walking;
	const spin = stair.turn === 'left' ? 1 : -1;
	const at = (radius: number, angle: number): Vec => ({
		x: radius * Math.cos(angle),
		y: radius * Math.sin(angle)
	});
	const start = spin > 0 ? 0 : Math.PI;
	for (let i = 0; i < treadCount; i++) {
		const a0 = start + spin * i * step;
		const a1 = start + spin * (i + 1) * step;
		const arc = Array.from({ length: SPIRAL_ARC_POINTS + 1 }, (_, k) =>
			at(outer, a0 + ((a1 - a0) * k) / SPIRAL_ARC_POINTS)
		);
		const polygon = [at(inner, a0), ...arc, at(inner, a1)];
		push(spin > 0 ? polygon : polygon.reverse());
	}
	const end = start + spin * treadCount * step;
	return { treads, arrival: [at(inner, end), at(outer, end)] };
}

export function stairLayout(stair: Stair, floorHeight: number): StairLayout {
	const risers = stairRisers(floorHeight);
	const local = localTreads(stair, risers);
	const toBoard = (p: Vec) => add({ x: stair.x, y: stair.y }, rotate(p, stair.rotation));
	return {
		risers,
		treads: local.treads.map((tread) => ({
			polygon: tread.polygon.map(toBoard),
			height: tread.riser * risers.riser,
			landing: tread.landing
		})),
		arrival: { from: toBoard(local.arrival[0]), to: toBoard(local.arrival[1]) }
	};
}

export interface StairContext {
	stair: Stair;
	from: Floor;
	to: Floor;
	height: number;
	layout: StairLayout;
	// Treads below which the slab above is cut open (board coordinates).
	opening: StairTread[];
}

// Everything about a stair that depends on the floors; undefined if it starts on the top floor
// or on an unknown floor.
export function stairContext(project: Floored, stair: Stair): StairContext | undefined {
	const from = (project.floors ?? []).find((floor) => floor.id === stair.fromFloorId);
	const to = from ? nextFloor(project, from.id) : undefined;
	if (!from || !to) return undefined;
	const height = floorToFloor(project, from);
	const clear = floorClearHeight(project, from);
	const layout = stairLayout(stair, height);
	return {
		stair,
		from,
		to,
		height,
		layout,
		opening: layout.treads.filter((tread) => tread.height + MIN_HEADROOM > clear)
	};
}

export interface Segment {
	from: Vec;
	to: Vec;
}

function sameEdge(a: Segment, b: Segment): boolean {
	return (
		(distance(a.from, b.to) < EDGE_TOLERANCE && distance(a.to, b.from) < EDGE_TOLERANCE) ||
		(distance(a.from, b.from) < EDGE_TOLERANCE && distance(a.to, b.to) < EDGE_TOLERANCE)
	);
}

function edgesOf(polygon: readonly Vec[]): Segment[] {
	return polygon.map((from, i) => ({ from, to: polygon[(i + 1) % polygon.length] }));
}

// Outline of the stairwell for the railing: edges of the opening that no other tread shares,
// without the arrival edge.
export function stairwellRailing(context: StairContext): Segment[] {
	const edges = context.opening.flatMap((tread) => edgesOf(tread.polygon));
	return edges.filter(
		(edge, index) =>
			!edges.some((other, j) => j !== index && sameEdge(edge, other)) &&
			!sameEdge(edge, context.layout.arrival)
	);
}

function roomAt(rooms: readonly Room[], p: Vec): Room | undefined {
	return rooms.find((room) => pointInPolygon(boardToRoom(room, p), room.polygon, 1));
}

export type StairIssueCode = 'stairHeadroom' | 'stairNoUpperFloor' | 'stairOutsideRooms';

export interface StairIssue {
	code: StairIssueCode;
	stairId: string;
	tread?: number;
	headroom?: number;
}

// Headroom above every tread: under the slab of the lower floor, or through the opening up to the
// ceiling of the upper floor, slopes included.
export function checkStairs(project: Floored & Pick<Project, 'stairs'>): StairIssue[] {
	const issues: StairIssue[] = [];
	for (const stair of project.stairs ?? []) {
		const context = stairContext(project, stair);
		if (!context) {
			issues.push({ code: 'stairNoUpperFloor', stairId: stair.id });
			continue;
		}
		const lower = floorRooms(project, context.from.id);
		const upper = floorRooms(project, context.to.id);
		const clear = floorClearHeight(project, context.from);
		const open = new Set(context.opening);
		let outside = false;
		let worst: StairIssue | undefined;
		context.layout.treads.forEach((tread, index) => {
			const centre = centroid(tread.polygon);
			const below = roomAt(lower, centre);
			if (!below) outside = true;
			let ceiling: number;
			if (open.has(tread)) {
				const above = roomAt(upper, centre);
				const upperCeiling = above
					? ceilingHeightAt(above, boardToRoom(above, centre))
					: floorClearHeight(project, context.to);
				ceiling = context.height + upperCeiling;
			} else {
				ceiling = below ? ceilingHeightAt(below, boardToRoom(below, centre)) : clear;
			}
			const headroom = Math.round(ceiling - tread.height);
			if (headroom < MIN_HEADROOM && (!worst || headroom < (worst.headroom ?? Infinity))) {
				worst = { code: 'stairHeadroom', stairId: stair.id, tread: index + 1, headroom };
			}
		});
		if (worst) issues.push(worst);
		if (outside) issues.push({ code: 'stairOutsideRooms', stairId: stair.id });
	}
	return issues;
}

export interface StairZone {
	kind: 'stair' | 'stairwell';
	stairId: string;
	// Room coordinates of the room the zone was computed for.
	shape: Vec[];
}

// Areas of a room that furniture must keep free: the treads of a stair starting on its floor and
// the opening of a stair arriving on it.
export function stairZonesForRoom(project: Floored & Pick<Project, 'stairs'>, room: Room): StairZone[] {
	const floorId = roomFloorId(project, room);
	if (!floorId) return [];
	const zones: StairZone[] = [];
	const local = (polygon: Vec[]) => polygon.map((p) => boardToRoom(room, p));
	const touches = (polygon: Vec[]) =>
		local(polygon).some((p) => pointInPolygon(p, room.polygon, 1)) ||
		room.polygon.some((corner) => pointInPolygon(corner, local(polygon), 1));
	for (const stair of project.stairs ?? []) {
		const context = stairContext(project, stair);
		if (!context) continue;
		if (context.from.id === floorId) {
			for (const tread of context.layout.treads) {
				if (touches(tread.polygon)) zones.push({ kind: 'stair', stairId: stair.id, shape: local(tread.polygon) });
			}
		}
		if (context.to.id === floorId) {
			for (const tread of context.opening) {
				if (touches(tread.polygon)) {
					zones.push({ kind: 'stairwell', stairId: stair.id, shape: local(tread.polygon) });
				}
			}
		}
	}
	return zones;
}
