import {
	ELEMENT_GROUP,
	ELEMENT_GROUPS,
	elementFitsRoom,
	groupsForRoom,
	kindAvailable,
	type ElementGroup
} from '#lib/core/elements.ts';
import {
	add,
	dot,
	frontDirection,
	interiorAngle,
	isConvexCorner,
	normalizeDegrees,
	pointInPolygon,
	scale,
	sub,
	wallPoint,
	walls,
	type Vec
} from '#lib/core/geometry.ts';
import { kitchenGridWidth } from '#lib/core/defaults.ts';
import type { IdFactory } from '#lib/core/ids.ts';
import {
	KITCHEN_APPLIANCES,
	type ElementKind,
	type KitchenAppliance,
	type KitchenGrid,
	type KitchenModule,
	type KitchenModuleKind,
	type Point,
	type Room,
	type RoomElement,
	type WallElement
} from '#lib/core/schema.ts';
import { pickWall, roundStep } from './logic.ts';

type PaletteRoom = Pick<Room, 'type' | 'polygon' | 'height' | 'slopes' | 'kitchen' | 'cover'> &
	Pick<Room, 'elements'>;

const PALETTE_ORDER: readonly ElementKind[] = [
	'door',
	'window',
	'socket',
	'switch',
	'wallLamp',
	'dataPort',
	'ceilingLamp',
	'radiator',
	'acWall',
	'acFloor',
	'fireplace',
	'stove',
	'tiledStove',
	'washbasin',
	'toilet',
	'shower',
	'bathtub',
	'kitchenRun',
	'builtin',
	'obstacle',
	'column',
	'freeObstacle'
];

export interface PaletteSection {
	group: ElementGroup;
	kinds: ElementKind[];
}

// Palette content per room: only the groups the room type offers (or still holds elements of),
// and in them only the kinds that can be placed. The roof window waits for the slope package.
export function paletteSections(room: PaletteRoom): PaletteSection[] {
	const shown = new Set(groupsForRoom(room));
	return ELEMENT_GROUPS.filter((group) => shown.has(group))
		.map((group) => ({
			group,
			kinds: PALETTE_ORDER.filter(
				(kind) => ELEMENT_GROUP[kind] === group && kindAvailable(room, kind)
			)
		}))
		.filter((section) => section.kinds.length > 0);
}

export function elementUnfit(room: PaletteRoom, element: RoomElement): boolean {
	return !elementFitsRoom(room, element);
}

export const DEPTH_KINDS = [
	'builtin',
	'obstacle',
	'radiator',
	'washbasin',
	'toilet',
	'shower',
	'bathtub',
	'kitchenRun',
	'acWall'
] as const;

export type DepthElement = Extract<WallElement, { kind: (typeof DEPTH_KINDS)[number] }>;

export function hasDepth(element: RoomElement): element is DepthElement {
	return (DEPTH_KINDS as readonly string[]).includes(element.kind);
}

export function isCornerKind(kind: ElementKind): boolean {
	return kind === 'shower' || kind === 'bathtub';
}

export function cornerOffset(corner: 'start' | 'end', width: number, wallLength: number): number {
	return corner === 'start' ? 0 : Math.max(0, Math.round(wallLength) - width);
}

export interface FreePose {
	x: number;
	y: number;
	rotation: number;
}

interface FreeBox extends FreePose {
	width: number;
	depth: number;
}

export function rotateBy(rotation: number, degrees: number): number {
	return normalizeDegrees(rotation + degrees);
}

// Back against the nearest wall, front into the room.
export function dockToWall(polygon: readonly Point[], box: FreeBox): FreePose | undefined {
	const hit = pickWall(polygon, { x: box.x, y: box.y });
	if (!hit) return undefined;
	const half = box.width / 2;
	const along =
		hit.wall.length >= box.width
			? Math.min(Math.max(hit.along, half), hit.wall.length - half)
			: hit.wall.length / 2;
	const center = wallPoint(hit.wall, along, box.depth / 2);
	return { x: Math.round(center.x), y: Math.round(center.y), rotation: hit.wall.angleDeg };
}

// Diagonal into the nearest convex corner: the back edge touches both walls.
export function dockToCorner(polygon: readonly Point[], box: FreeBox): FreePose | undefined {
	const n = polygon.length;
	const order = polygon
		.map((corner, index) => ({ index, d: Math.hypot(corner.x - box.x, corner.y - box.y) }))
		.sort((a, b) => a.d - b.d);
	for (const { index } of order) {
		if (!isConvexCorner(polygon, index)) continue;
		const corner = polygon[index];
		const toPrev = unit(sub(polygon[(index - 1 + n) % n], corner));
		const toNext = unit(sub(polygon[(index + 1) % n], corner));
		const bisector = unit(add(toPrev, toNext));
		const half = (interiorAngle(polygon, index) * Math.PI) / 360;
		const reach = box.width / (2 * Math.tan(half)) + box.depth / 2;
		const center = add(corner, scale(bisector, reach));
		return {
			x: Math.round(center.x),
			y: Math.round(center.y),
			rotation: normalizeDegrees((Math.atan2(-bisector.x, bisector.y) * 180) / Math.PI)
		};
	}
	return undefined;
}

function unit(v: Vec): Vec {
	const len = Math.hypot(v.x, v.y);
	return len === 0 ? { x: 1, y: 0 } : { x: v.x / len, y: v.y / len };
}

// While dragging: a back edge that runs parallel to a wall and comes within the threshold snaps
// onto that wall.
export function snapFreeToWall(
	polygon: readonly Point[],
	box: FreeBox,
	threshold: number
): { x: number; y: number } {
	const front = frontDirection(box.rotation);
	const back = sub({ x: box.x, y: box.y }, scale(front, box.depth / 2));
	for (const target of walls(polygon)) {
		const diff = Math.abs(normalizeDegrees(box.rotation - target.angleDeg + 180) - 180);
		if (diff > 1) continue;
		const gap = dot(sub(back, target.start), target.inward);
		const along = dot(sub(back, target.start), target.direction);
		if (Math.abs(gap) > threshold || along < 0 || along > target.length) continue;
		return {
			x: Math.round(box.x - target.inward.x * gap),
			y: Math.round(box.y - target.inward.y * gap)
		};
	}
	return { x: box.x, y: box.y };
}

export function dragFree(
	polygon: readonly Point[],
	box: FreeBox,
	point: Vec,
	grab: Vec,
	threshold: number
): { x: number; y: number } | undefined {
	const x = roundStep(point.x - grab.x);
	const y = roundStep(point.y - grab.y);
	if (!pointInPolygon({ x, y }, polygon, 1)) return undefined;
	return snapFreeToWall(polygon, { ...box, x, y }, threshold);
}

export const MODULE_APPLIANCES: Record<KitchenModuleKind, readonly KitchenAppliance[]> = {
	base: KITCHEN_APPLIANCES,
	sink: [],
	hob: ['oven', 'steamer'],
	dishwasher: [],
	tall: KITCHEN_APPLIANCES,
	table: []
};

export function moduleWidthChoices(grid: KitchenGrid): number[] {
	const base = kitchenGridWidth(grid);
	return [1, 2, 3].map((factor) => base * factor);
}

export function newModule(kind: KitchenModuleKind, grid: KitchenGrid, newId: IdFactory) {
	const module: KitchenModule = { id: newId(), kind, width: kitchenGridWidth(grid) };
	return module;
}

export function changeModuleKind(module: KitchenModule, kind: KitchenModuleKind): KitchenModule {
	const allowed = MODULE_APPLIANCES[kind];
	const appliances = module.appliances?.filter((item) => allowed.includes(item));
	const { appliances: _drop, ...rest } = module;
	return { ...rest, kind, ...(appliances && appliances.length > 0 ? { appliances } : {}) };
}

export function toggleAppliance(module: KitchenModule, appliance: KitchenAppliance): KitchenModule {
	const current = module.appliances ?? [];
	const next = current.includes(appliance)
		? current.filter((item) => item !== appliance)
		: [...current, appliance];
	const { appliances: _drop, ...rest } = module;
	return next.length > 0 ? { ...rest, appliances: next } : rest;
}

export function moveModule(
	modules: readonly KitchenModule[],
	id: string,
	direction: -1 | 1
): KitchenModule[] {
	const index = modules.findIndex((module) => module.id === id);
	const target = index + direction;
	if (index < 0 || target < 0 || target >= modules.length) return [...modules];
	const next = [...modules];
	[next[index], next[target]] = [next[target], next[index]];
	return next;
}

// Module widths that were whole multiples of the old grid follow the new one.
export function regrid(
	modules: readonly KitchenModule[],
	from: KitchenGrid,
	to: KitchenGrid
): KitchenModule[] {
	const a = kitchenGridWidth(from);
	const b = kitchenGridWidth(to);
	return modules.map((module) =>
		module.width % a === 0 ? { ...module, width: (module.width / a) * b } : module
	);
}

export function modulesTotal(modules: readonly KitchenModule[]): number {
	return modules.reduce((sum, module) => sum + module.width, 0);
}
