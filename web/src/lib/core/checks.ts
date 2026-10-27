import { SOCKET_WARN_DISTANCE } from './defaults.ts';
import {
	clearanceZone,
	elementFitsRoom,
	elementVolumes,
	freeElementShape,
	wallBands
} from './elements.ts';
import type { StairZone } from './floors.ts';
import {
	ceilingHeightAt,
	convexInsidePolygon,
	convexOverlap,
	doorSwing,
	elementPosition,
	elementSpan,
	isSimplePolygon,
	itemFootprint,
	pointInPolygon,
	pointOnSegmentDistance,
	roofWindowPlacement,
	wall,
	wallElementFootprint,
	wallElements,
	wallHeightAt,
	walls,
	type Vec
} from './geometry.ts';
import {
	isFreeElement,
	isWallElement,
	type Item,
	type Room,
	type RoomElement,
	type WallElement
} from './schema.ts';

export type RoomIssueCode =
	| 'polygonInvalid'
	| 'elementOutsideWall'
	| 'elementTooHigh'
	| 'elementOverlap'
	| 'roofWindowOffSlope'
	| 'elementNotForRoomType';

export interface RoomIssue {
	code: RoomIssueCode;
	roomId: string;
	elementIds: string[];
	wall?: number;
}

export type ItemIssueCode =
	| 'outsideRoom'
	| 'tooTall'
	| 'underSlope'
	| 'collision'
	| 'elementCollision'
	| 'doorBlocked'
	| 'windowBlocked'
	| 'radiatorBlocked'
	| 'fireZone'
	| 'airflowBlocked'
	| 'onStair'
	| 'inStairwell'
	| 'socketFar';

export interface ItemIssue {
	code: ItemIssueCode;
	severity: 'error' | 'warning';
	roomId: string;
	itemIds: string[];
	elementId?: string;
	distance?: number;
}

const DOOR_CLEARANCE = 600;
const WINDOW_CLEARANCE = 150;
const RADIATOR_CLEARANCE = 100;
const FLAT_CATEGORIES: readonly Item['category'][] = ['rug'];
const WINDOW_FRIENDLY: readonly Item['category'][] = ['curtain', 'plant', 'decor'];

function verticalOverlap(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
	return Math.min(aTo, bTo) - Math.max(aFrom, bFrom) > 1;
}

function usesOpening(a: RoomElement): boolean {
	return a.kind === 'door' || a.kind === 'window';
}

const NEW_FLOOR_FIXTURES: readonly RoomElement['kind'][] = [
	'washbasin',
	'toilet',
	'shower',
	'bathtub',
	'kitchenRun',
	'acWall'
];
const FLOOR_FIXTURES: readonly RoomElement['kind'][] = [
	...NEW_FLOOR_FIXTURES,
	'builtin',
	'obstacle',
	'radiator'
];

// Two fixtures on one wall must not take the same place. Pairs of the older kinds (built-in,
// obstacle, radiator) keep their earlier rule, so existing rooms get no new findings.
function fixturesClash(a: WallElement, b: WallElement): boolean {
	if (!FLOOR_FIXTURES.includes(a.kind) || !FLOOR_FIXTURES.includes(b.kind)) return false;
	return NEW_FLOOR_FIXTURES.includes(a.kind) || NEW_FLOOR_FIXTURES.includes(b.kind);
}

export function validateRoom(room: Room): RoomIssue[] {
	const issues: RoomIssue[] = [];
	if (!isSimplePolygon(room.polygon) || walls(room.polygon).some((w) => w.length < 1)) {
		issues.push({ code: 'polygonInvalid', roomId: room.id, elementIds: [] });
	}
	for (const element of room.elements) {
		if (!elementFitsRoom(room, element)) {
			issues.push({ code: 'elementNotForRoomType', roomId: room.id, elementIds: [element.id] });
		}
		if (element.kind === 'ceilingLamp') {
			if (!pointInPolygon(element, room.polygon, 1)) {
				issues.push({ code: 'elementOutsideWall', roomId: room.id, elementIds: [element.id] });
			}
			continue;
		}
		if (isFreeElement(element)) {
			if (!convexInsidePolygon(freeElementShape(element), room.polygon, 2)) {
				issues.push({ code: 'elementOutsideWall', roomId: room.id, elementIds: [element.id] });
			}
			continue;
		}
		if (element.kind === 'roofWindow') {
			const placement = roofWindowPlacement(room, element);
			if (!placement || placement.top > room.height + 1) {
				issues.push({
					code: 'roofWindowOffSlope',
					roomId: room.id,
					elementIds: [element.id],
					wall: element.wall
				});
			}
			continue;
		}
		const target = wall(room.polygon, element.wall);
		if (!target || element.offset < 0 || element.offset + element.width > target.length + 1) {
			issues.push({
				code: 'elementOutsideWall',
				roomId: room.id,
				elementIds: [element.id],
				wall: element.wall
			});
		}
		const span = elementSpan(element);
		const clear = Math.min(
			wallHeightAt(room, element.wall, span.from),
			wallHeightAt(room, element.wall, span.to)
		);
		// A kitchen run is checked part by part, at the depth its tall and upper cabinets reach.
		const tooHigh =
			element.kind === 'kitchenRun'
				? elementVolumes(room, element).some(
						(volume) =>
							volume.top > Math.min(...volume.shape.map((p) => ceilingHeightAt(room, p))) + 1
					)
				: element.elevation + element.height > clear + 1;
		if (tooHigh) {
			issues.push({
				code: 'elementTooHigh',
				roomId: room.id,
				elementIds: [element.id],
				wall: element.wall
			});
		}
	}
	for (const target of walls(room.polygon)) {
		const onWall = wallElements(room, target.number);
		for (let i = 0; i < onWall.length; i++) {
			for (let j = i + 1; j < onWall.length; j++) {
				const a = onWall[i];
				const b = onWall[j];
				const clash = usesOpening(a) || usesOpening(b) || a.kind === b.kind || fixturesClash(a, b);
				const touches = wallBands(a).some((bandA) =>
					wallBands(b).some(
						(bandB) =>
							Math.min(bandA.to, bandB.to) - Math.max(bandA.from, bandB.from) > 1 &&
							verticalOverlap(bandA.bottom, bandA.top, bandB.bottom, bandB.top)
					)
				);
				if (touches && clash) {
					issues.push({
						code: 'elementOverlap',
						roomId: room.id,
						elementIds: [a.id, b.id],
						wall: target.number
					});
				}
			}
		}
	}
	return issues;
}

export function distanceToFootprint(point: Vec, shape: readonly Vec[]): number {
	if (pointInPolygon(point, shape)) return 0;
	let best = Infinity;
	for (let i = 0; i < shape.length; i++) {
		best = Math.min(best, pointOnSegmentDistance(point, shape[i], shape[(i + 1) % shape.length]));
	}
	return best;
}

export function socketDistance(
	room: Pick<Room, 'polygon'>,
	item: Item,
	elements: readonly RoomElement[]
): number | undefined {
	const shape = itemFootprint(item);
	let best: number | undefined;
	for (const element of elements) {
		if (element.kind !== 'socket') continue;
		const position = elementPosition(room.polygon, element);
		if (!position) continue;
		const d = distanceToFootprint(position, shape);
		if (best === undefined || d < best) best = d;
	}
	return best === undefined ? undefined : Math.round(best);
}

// stairZones: stairs and stairwells in this room (stairZonesForRoom), in projects with floors.
export function checkRoomItems(
	room: Room,
	allItems: readonly Item[],
	suggested: readonly RoomElement[] = [],
	stairZones: readonly StairZone[] = []
): ItemIssue[] {
	const issues: ItemIssue[] = [];
	const items = allItems.filter((item) => item.roomId === room.id);
	const shapes = new Map(items.map((item) => [item.id, itemFootprint(item)]));
	const top = (item: Item) => item.elevation + item.dims.h;
	const solid = (item: Item) => !FLAT_CATEGORIES.includes(item.category);

	for (const item of items) {
		const shape = shapes.get(item.id)!;
		if (!convexInsidePolygon(shape, room.polygon, 2)) {
			issues.push({ code: 'outsideRoom', severity: 'error', roomId: room.id, itemIds: [item.id] });
		}
		if (top(item) > room.height) {
			issues.push({ code: 'tooTall', severity: 'error', roomId: room.id, itemIds: [item.id] });
		} else if (top(item) > Math.min(...shape.map((corner) => ceilingHeightAt(room, corner))) + 1) {
			issues.push({ code: 'underSlope', severity: 'error', roomId: room.id, itemIds: [item.id] });
		}
		const stairZone = stairZones.find((candidate) => convexOverlap(shape, candidate.shape, 2));
		if (stairZone) {
			issues.push({
				code: stairZone.kind === 'stair' ? 'onStair' : 'inStairwell',
				severity: 'error',
				roomId: room.id,
				itemIds: [item.id]
			});
		}

		if (!solid(item)) continue;

		for (const element of room.elements) {
			const volumes = elementVolumes(room, element);
			if (
				volumes.some(
					(volume) =>
						convexOverlap(shape, volume.shape, 2) &&
						verticalOverlap(item.elevation, top(item), volume.bottom, volume.top)
				)
			) {
				issues.push({
					code: 'elementCollision',
					severity: 'error',
					roomId: room.id,
					itemIds: [item.id],
					elementId: element.id
				});
			}
			const zone = clearanceZone(room, element);
			if (
				zone &&
				convexOverlap(shape, zone.shape, 2) &&
				verticalOverlap(item.elevation, top(item), zone.bottom, zone.top)
			) {
				issues.push({
					code: zone.kind === 'fire' ? 'fireZone' : 'airflowBlocked',
					severity: zone.kind === 'fire' ? 'error' : 'warning',
					roomId: room.id,
					itemIds: [item.id],
					elementId: element.id
				});
			}
			if (!isWallElement(element)) continue;
			const elementTop = element.elevation + element.height;
			if (element.kind === 'door') {
				const swing = element.swing === 'in' ? doorSwing(room.polygon, element) : undefined;
				const zone = swing?.polygon ?? wallElementFootprint(room.polygon, element, DOOR_CLEARANCE);
				if (convexOverlap(shape, zone, 2) && item.elevation < elementTop) {
					issues.push({
						code: 'doorBlocked',
						severity: 'error',
						roomId: room.id,
						itemIds: [item.id],
						elementId: element.id
					});
				}
			} else if (element.kind === 'window') {
				const balcony = element.windowType === 'balconyDoor';
				const zone = wallElementFootprint(
					room.polygon,
					element,
					balcony ? DOOR_CLEARANCE : WINDOW_CLEARANCE
				);
				if (
					!WINDOW_FRIENDLY.includes(item.category) &&
					convexOverlap(shape, zone, 2) &&
					verticalOverlap(item.elevation, top(item), element.elevation, elementTop)
				) {
					issues.push({
						code: 'windowBlocked',
						severity: balcony ? 'error' : 'warning',
						roomId: room.id,
						itemIds: [item.id],
						elementId: element.id
					});
				}
			} else if (element.kind === 'radiator') {
				const zone = wallElementFootprint(
					room.polygon,
					element,
					element.depth + RADIATOR_CLEARANCE
				);
				if (
					convexOverlap(shape, zone, 2) &&
					verticalOverlap(item.elevation, top(item), element.elevation, elementTop)
				) {
					issues.push({
						code: 'radiatorBlocked',
						severity: 'warning',
						roomId: room.id,
						itemIds: [item.id],
						elementId: element.id
					});
				}
			}
		}

		if (item.power && item.power > 0) {
			const d = socketDistance(room, item, [...room.elements, ...suggested]);
			if (d === undefined || d > SOCKET_WARN_DISTANCE) {
				issues.push({
					code: 'socketFar',
					severity: 'warning',
					roomId: room.id,
					itemIds: [item.id],
					...(d !== undefined ? { distance: d } : {})
				});
			}
		}
	}

	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			const a = items[i];
			const b = items[j];
			if (!solid(a) || !solid(b)) continue;
			if (a.onItemId === b.id || b.onItemId === a.id) continue;
			if (!verticalOverlap(a.elevation, top(a), b.elevation, top(b))) continue;
			if (convexOverlap(shapes.get(a.id)!, shapes.get(b.id)!, 2)) {
				issues.push({
					code: 'collision',
					severity: 'error',
					roomId: room.id,
					itemIds: [a.id, b.id]
				});
			}
		}
	}
	return issues;
}
