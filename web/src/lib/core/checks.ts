import { SOCKET_WARN_DISTANCE } from './defaults.ts';
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
	wall,
	wallElementFootprint,
	wallElements,
	wallHeightAt,
	walls,
	type Vec
} from './geometry.ts';
import { isWallElement, type Item, type Room, type RoomElement } from './schema.ts';

export type RoomIssueCode =
	'polygonInvalid' | 'elementOutsideWall' | 'elementTooHigh' | 'elementOverlap';

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

export function validateRoom(room: Room): RoomIssue[] {
	const issues: RoomIssue[] = [];
	if (!isSimplePolygon(room.polygon) || walls(room.polygon).some((w) => w.length < 1)) {
		issues.push({ code: 'polygonInvalid', roomId: room.id, elementIds: [] });
	}
	for (const element of room.elements) {
		if (!isWallElement(element)) {
			if (!pointInPolygon(element, room.polygon, 1)) {
				issues.push({ code: 'elementOutsideWall', roomId: room.id, elementIds: [element.id] });
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
		if (element.elevation + element.height > clear + 1) {
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
				const spanA = elementSpan(a);
				const spanB = elementSpan(b);
				const horizontal = Math.min(spanA.to, spanB.to) - Math.max(spanA.from, spanB.from) > 1;
				const vertical = verticalOverlap(
					a.elevation,
					a.elevation + a.height,
					b.elevation,
					b.elevation + b.height
				);
				if (horizontal && vertical && (usesOpening(a) || usesOpening(b) || a.kind === b.kind)) {
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

export function checkRoomItems(
	room: Room,
	allItems: readonly Item[],
	suggested: readonly RoomElement[] = []
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
		if (!solid(item)) continue;

		for (const element of room.elements) {
			if (!isWallElement(element)) continue;
			const elementTop = element.elevation + element.height;
			if (element.kind === 'builtin' || element.kind === 'obstacle') {
				const zone = wallElementFootprint(room.polygon, element, element.depth);
				if (
					convexOverlap(shape, zone, 2) &&
					verticalOverlap(item.elevation, top(item), element.elevation, elementTop)
				) {
					issues.push({
						code: 'elementCollision',
						severity: 'error',
						roomId: room.id,
						itemIds: [item.id],
						elementId: element.id
					});
				}
			} else if (element.kind === 'door') {
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
