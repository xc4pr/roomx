import {
	add,
	ceilingHeightAt,
	footprint,
	frontDirection,
	rotate,
	scale,
	wall,
	wallElementFootprint,
	wallPoint,
	type Vec
} from './geometry.ts';
import {
	FREE_ELEMENT_KINDS,
	isFireElement,
	isFreeElement,
	isOpenAir,
	isWallElement,
	type ElementKind,
	type FreeElement,
	type KitchenModule,
	type KitchenRun,
	type Room,
	type RoomElement,
	type WallElement
} from './schema.ts';

export const ELEMENT_GROUPS = [
	'openings',
	'electrical',
	'climate',
	'sanitary',
	'kitchen',
	'obstacles'
] as const;
export type ElementGroup = (typeof ELEMENT_GROUPS)[number];

export const ELEMENT_GROUP: Record<ElementKind, ElementGroup> = {
	door: 'openings',
	window: 'openings',
	roofWindow: 'openings',
	socket: 'electrical',
	switch: 'electrical',
	wallLamp: 'electrical',
	dataPort: 'electrical',
	ceilingLamp: 'electrical',
	radiator: 'climate',
	acWall: 'climate',
	acFloor: 'climate',
	fireplace: 'climate',
	stove: 'climate',
	tiledStove: 'climate',
	washbasin: 'sanitary',
	toilet: 'sanitary',
	shower: 'sanitary',
	bathtub: 'sanitary',
	kitchenRun: 'kitchen',
	builtin: 'obstacles',
	obstacle: 'obstacles',
	column: 'obstacles',
	freeObstacle: 'obstacles'
};

// An item in front of a wall air conditioner blocks the air when its top comes this close to
// the lower edge of the unit.
export const AC_WALL_REACH_BELOW = 500;
const ROUND_SEGMENTS = 16;
const TABLE_TOP = 40;

type RoomLike = Pick<Room, 'type' | 'polygon' | 'height' | 'slopes' | 'kitchen' | 'cover'>;

export function hasWalls(room: Pick<Room, 'type'>): boolean {
	return !isOpenAir(room);
}

// Kitchen elements belong to kitchens and to living or dining rooms with an open kitchen, as long
// as the kitchen is built in rather than planned from the catalogue.
export function hasKitchen(room: Pick<Room, 'type' | 'kitchen'>): boolean {
	if (room.type === 'kitchen') return true;
	return (room.type === 'living' || room.type === 'dining') && room.kitchen?.open === true;
}

export function builtInKitchen(room: Pick<Room, 'type' | 'kitchen'>): boolean {
	return hasKitchen(room) && room.kitchen?.mode !== 'catalog';
}

// Whether the palette offers this kind in this room. Elements that no longer fit after a change of
// room type stay in the room and are marked (elementFitsRoom), never removed.
export function kindAvailable(room: RoomLike, kind: ElementKind): boolean {
	const group = ELEMENT_GROUP[kind];
	if (isOpenAir(room)) {
		if (kind === 'ceilingLamp') return room.cover !== undefined;
		return (FREE_ELEMENT_KINDS as readonly string[]).includes(kind);
	}
	if (kind === 'roofWindow') return (room.slopes?.length ?? 0) > 0;
	if (group === 'sanitary') return room.type === 'bath';
	if (group === 'kitchen') return builtInKitchen(room);
	return true;
}

export function elementFitsRoom(room: RoomLike, element: Pick<RoomElement, 'kind'>): boolean {
	return kindAvailable(room, element.kind);
}

// Groups the palette shows: those with an available kind, plus those that still hold elements.
export function groupsForRoom(room: RoomLike & Pick<Room, 'elements'>): ElementGroup[] {
	const kinds = Object.keys(ELEMENT_GROUP) as ElementKind[];
	return ELEMENT_GROUPS.filter(
		(group) =>
			kinds.some((kind) => ELEMENT_GROUP[kind] === group && kindAvailable(room, kind)) ||
			room.elements.some((element) => ELEMENT_GROUP[element.kind] === group)
	);
}

export interface KitchenModuleSpan {
	module: KitchenModule;
	from: number;
	to: number;
}

// Modules sit side by side from the start of the run; whatever does not fit is cut off.
export function kitchenModuleSpans(
	run: Pick<KitchenRun, 'modules' | 'width'>
): KitchenModuleSpan[] {
	const spans: KitchenModuleSpan[] = [];
	let cursor = 0;
	for (const module of run.modules) {
		const to = Math.min(run.width, cursor + module.width);
		if (to <= cursor) break;
		spans.push({ module, from: cursor, to });
		cursor = to;
	}
	return spans;
}

// Stretches of the run without upper cabinets above (tall modules) as offsets from the run start.
export function kitchenUpperSpans(run: KitchenRun): { from: number; to: number }[] {
	if (!run.upper) return [];
	const spans: { from: number; to: number }[] = [];
	let cursor = 0;
	for (const span of kitchenModuleSpans(run)) {
		if (span.module.kind !== 'tall') continue;
		if (span.from > cursor) spans.push({ from: cursor, to: span.from });
		cursor = span.to;
	}
	if (cursor < run.width) spans.push({ from: cursor, to: run.width });
	return spans;
}

export function freeElementShape(element: FreeElement): Vec[] {
	if (element.kind === 'column' && element.shape === 'round') {
		const center = { x: element.x, y: element.y };
		const rx = element.width / 2;
		const ry = element.depth / 2;
		return Array.from({ length: ROUND_SEGMENTS }, (_, i) => {
			const angle = (2 * Math.PI * i) / ROUND_SEGMENTS;
			return add(
				center,
				rotate({ x: rx * Math.cos(angle), y: ry * Math.sin(angle) }, element.rotation)
			);
		});
	}
	return footprint({
		x: element.x,
		y: element.y,
		rotation: element.rotation,
		dims: { w: element.width, d: element.depth }
	});
}

function openAirTop(room: Pick<Room, 'cover' | 'height'>): number {
	return room.cover?.height ?? room.height;
}

// Upper end of a free element: the ceiling above its centre (the cover outdoors) for elements
// that reach the ceiling, its own height otherwise.
export function freeElementTop(room: RoomLike, element: FreeElement): number {
	const reaches =
		(element.kind === 'column' || element.kind === 'freeObstacle') && element.toCeiling;
	if (!reaches) return element.elevation + element.height;
	if (isOpenAir(room)) return openAirTop(room);
	return Math.round(ceilingHeightAt(room, { x: element.x, y: element.y }));
}

export interface Volume {
	shape: Vec[];
	bottom: number;
	top: number;
}

function wallVolume(
	room: Pick<Room, 'polygon'>,
	element: WallElement,
	from: number,
	to: number,
	depth: number,
	bottom: number,
	top: number
): Volume | undefined {
	const target = wall(room.polygon, element.wall);
	if (!target || to <= from) return undefined;
	const start = element.offset + from;
	const end = element.offset + to;
	return {
		shape: [
			wallPoint(target, start, 0),
			wallPoint(target, end, 0),
			wallPoint(target, end, depth),
			wallPoint(target, start, depth)
		],
		bottom,
		top
	};
}

function kitchenVolumes(room: Pick<Room, 'polygon'>, run: KitchenRun): Volume[] {
	const volumes: (Volume | undefined)[] = [];
	const worktop = run.elevation + run.height;
	let cursor = 0;
	// Base cabinets run continuously; tall modules and the built-in table interrupt them.
	for (const span of kitchenModuleSpans(run)) {
		if (span.module.kind !== 'tall' && span.module.kind !== 'table') continue;
		volumes.push(wallVolume(room, run, cursor, span.from, run.depth, run.elevation, worktop));
		const bottom = span.module.kind === 'table' ? worktop - TABLE_TOP : run.elevation;
		const top = span.module.kind === 'table' ? worktop : run.elevation + run.tallHeight;
		volumes.push(wallVolume(room, run, span.from, span.to, run.depth, bottom, top));
		cursor = span.to;
	}
	volumes.push(wallVolume(room, run, cursor, run.width, run.depth, run.elevation, worktop));
	const upper = run.upper;
	if (upper) {
		for (const span of kitchenUpperSpans(run)) {
			const top = upper.elevation + upper.height;
			volumes.push(wallVolume(room, run, span.from, span.to, upper.depth, upper.elevation, top));
		}
	}
	return volumes.filter((volume): volume is Volume => volume !== undefined);
}

const SOLID_WALL_KINDS: readonly ElementKind[] = [
	'builtin',
	'obstacle',
	'washbasin',
	'toilet',
	'shower',
	'bathtub',
	'acWall'
];

// Bodies of the fixed elements that furniture must not enter (doors, windows and radiators have
// their own rules). Shapes are in room coordinates, heights above the floor.
export function elementVolumes(room: RoomLike, element: RoomElement): Volume[] {
	if (element.kind === 'kitchenRun') return kitchenVolumes(room, element);
	if (isWallElement(element) && SOLID_WALL_KINDS.includes(element.kind) && 'depth' in element) {
		const volume = wallVolume(
			room,
			element,
			0,
			element.width,
			element.depth,
			element.elevation,
			element.elevation + element.height
		);
		return volume ? [volume] : [];
	}
	if (isFreeElement(element)) {
		return [
			{
				shape: freeElementShape(element),
				bottom: element.elevation,
				top: freeElementTop(room, element)
			}
		];
	}
	return [];
}

export interface ClearanceZone {
	shape: Vec[];
	bottom: number;
	top: number;
	kind: 'fire' | 'airflow';
}

// Zone in front of a fireplace opening or an air outlet that furniture has to keep free.
export function clearanceZone(room: RoomLike, element: RoomElement): ClearanceZone | undefined {
	if (isFreeElement(element) && (isFireElement(element) || element.kind === 'acFloor')) {
		if (element.clearance <= 0) return undefined;
		const front = frontDirection(element.rotation);
		const side = rotate({ x: 1, y: 0 }, element.rotation);
		const center = { x: element.x, y: element.y };
		const edge = add(center, scale(front, element.depth / 2));
		const half = scale(side, element.width / 2);
		const reach = scale(front, element.clearance);
		return {
			shape: [
				add(edge, scale(half, -1)),
				add(edge, half),
				add(add(edge, half), reach),
				add(add(edge, scale(half, -1)), reach)
			],
			bottom: 0,
			top: isOpenAir(room) ? openAirTop(room) : room.height,
			kind: isFireElement(element) ? 'fire' : 'airflow'
		};
	}
	if (element.kind === 'acWall' && element.clearance > 0) {
		const shape = wallElementFootprint(room.polygon, element, element.depth + element.clearance);
		if (shape.length === 0) return undefined;
		return {
			shape,
			bottom: Math.max(0, element.elevation - AC_WALL_REACH_BELOW),
			top: element.elevation + element.height,
			kind: 'airflow'
		};
	}
	return undefined;
}
