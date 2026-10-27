import { createElement } from '#lib/core/defaults.ts';
import type { IdFactory } from '#lib/core/ids.ts';
import {
	cornerLabel,
	dot,
	elementSpan,
	pointInPolygon,
	pointOnSegmentDistance,
	sub,
	wall,
	wallElements,
	walls,
	type Span,
	type Vec,
	type Wall
} from '#lib/core/geometry.ts';
import {
	isFreeElement,
	isWallElement,
	type Point,
	type Room,
	type RoomElement,
	type WallElement
} from '#lib/core/schema.ts';
import { clampRoofOffset, pickSlopeWall } from './roof.ts';

export const SNAP_STEP = 10;
export const MIN_WIDTH = 20;
export const RADIATOR_SILL_GAP = 50;
export const SNAP_PX = 8;
export const SWITCH_WORKTOP_CENTER = 1150;

export type SnapKind = 'grid' | 'start' | 'end' | 'center' | 'neighbor';

export interface Snap {
	value: number;
	kind: SnapKind;
}

export function roundStep(value: number, step = SNAP_STEP): number {
	return Math.round(value / step) * step;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(min, max), Math.max(min, value));
}

export function clampOffset(offset: number, width: number, wallLength: number): number {
	return clamp(Math.round(offset), 0, Math.max(0, Math.round(wallLength) - width));
}

export function distanceFromEnd(offset: number, width: number, wallLength: number): number {
	return Math.round(wallLength) - offset - width;
}

export function offsetFromEndDistance(fromEnd: number, width: number, wallLength: number): number {
	return Math.round(wallLength) - width - fromEnd;
}

export function centerHeight(elevation: number, height: number): number {
	return Math.round(elevation + height / 2);
}

export function elevationForCenter(center: number, height: number): number {
	return Math.round(center - height / 2);
}

export function thresholdMm(pxPerMm: number, px = SNAP_PX): number {
	return pxPerMm > 0 ? px / pxPerMm : 0;
}

function nearest(value: number, candidates: readonly Snap[], threshold: number): Snap | undefined {
	let best: Snap | undefined;
	let bestDistance = threshold;
	for (const candidate of candidates) {
		const distance = Math.abs(candidate.value - value);
		if (distance <= bestDistance) {
			best = candidate;
			bestDistance = distance;
		}
	}
	return best;
}

export interface SnapOffsetOptions {
	offset: number;
	width: number;
	wallLength: number;
	neighbors: readonly Span[];
	threshold: number;
	step?: number;
}

export function snapOffset(options: SnapOffsetOptions): Snap {
	const { width, neighbors, threshold, step = SNAP_STEP } = options;
	const length = Math.round(options.wallLength);
	const max = Math.max(0, length - width);
	const candidates: Snap[] = [
		{ value: 0, kind: 'start' },
		{ value: max, kind: 'end' },
		{ value: Math.round(max / 2), kind: 'center' }
	];
	for (const span of neighbors) {
		candidates.push(
			{ value: span.to, kind: 'neighbor' },
			{ value: span.from - width, kind: 'neighbor' },
			{ value: span.from, kind: 'neighbor' },
			{ value: span.to - width, kind: 'neighbor' }
		);
	}
	const hit = nearest(options.offset, candidates, threshold);
	if (hit) return { value: clamp(hit.value, 0, max), kind: hit.kind };
	return { value: clamp(roundStep(options.offset, step), 0, max), kind: 'grid' };
}

export interface SnapElevationOptions {
	elevation: number;
	height: number;
	roomHeight: number;
	neighbors: readonly { elevation: number; height: number }[];
	threshold: number;
	step?: number;
}

export function snapElevation(options: SnapElevationOptions): Snap {
	const { height, roomHeight, neighbors, threshold, step = SNAP_STEP } = options;
	const max = Math.max(0, roomHeight - height);
	const candidates: Snap[] = [
		{ value: 0, kind: 'start' },
		{ value: max, kind: 'end' }
	];
	for (const other of neighbors) {
		const top = other.elevation + other.height;
		candidates.push(
			{ value: other.elevation, kind: 'neighbor' },
			{ value: top, kind: 'neighbor' },
			{ value: top - height, kind: 'neighbor' },
			{ value: other.elevation - height, kind: 'neighbor' }
		);
	}
	const hit = nearest(options.elevation, candidates, threshold);
	if (hit) return { value: clamp(hit.value, 0, max), kind: hit.kind };
	return { value: clamp(roundStep(options.elevation, step), 0, max), kind: 'grid' };
}

export function snapCeilingPoint(
	point: Vec,
	reference: Vec,
	threshold: number,
	step = SNAP_STEP
): { x: number; y: number; snappedX: boolean; snappedY: boolean } {
	const snappedX = Math.abs(point.x - reference.x) <= threshold;
	const snappedY = Math.abs(point.y - reference.y) <= threshold;
	return {
		x: snappedX ? Math.round(reference.x) : roundStep(point.x, step),
		y: snappedY ? Math.round(reference.y) : roundStep(point.y, step),
		snappedX,
		snappedY
	};
}

export interface WallHit {
	wall: Wall;
	along: number;
	distance: number;
}

function projectOnWall(target: Wall, point: Vec): WallHit {
	const along = clamp(dot(sub(point, target.start), target.direction), 0, target.length);
	return {
		wall: target,
		along,
		distance: pointOnSegmentDistance(point, target.start, target.end)
	};
}

export function pickWall(
	polygon: readonly Point[],
	point: Vec,
	currentWall?: number,
	stickiness = 0
): WallHit | undefined {
	let best: WallHit | undefined;
	for (const candidate of walls(polygon)) {
		const hit = projectOnWall(candidate, point);
		if (!best || hit.distance < best.distance) best = hit;
	}
	if (!best) return undefined;
	if (currentWall !== undefined && currentWall !== best.wall.number) {
		const current = wall(polygon, currentWall);
		if (current) {
			const hit = projectOnWall(current, point);
			if (hit.distance <= best.distance + stickiness) return hit;
		}
	}
	return best;
}

export interface DragOffsetOptions {
	startOffset: number;
	startAlong: number;
	along: number;
	width: number;
	sameWall: boolean;
}

export function dragOffset(options: DragOffsetOptions): number {
	if (options.sameWall) return options.startOffset + (options.along - options.startAlong);
	return options.along - options.width / 2;
}

export function neighborSpans(
	room: Pick<Room, 'elements'>,
	wallNumber: number,
	excludeId?: string
): Span[] {
	return wallElements(room, wallNumber)
		.filter((element) => element.id !== excludeId)
		.map(elementSpan);
}

export function windowsOnWall(room: Pick<Room, 'elements'>, wallNumber: number): WallElement[] {
	return wallElements(room, wallNumber).filter((element) => element.kind === 'window');
}

export function nearestWindow(
	windows: readonly WallElement[],
	element: Pick<WallElement, 'offset' | 'width'>
): WallElement | undefined {
	const center = element.offset + element.width / 2;
	let best: WallElement | undefined;
	let bestDistance = Infinity;
	for (const candidate of windows) {
		const distance = Math.abs(candidate.offset + candidate.width / 2 - center);
		if (distance < bestDistance) {
			best = candidate;
			bestDistance = distance;
		}
	}
	return best;
}

export function radiatorUnderWindow(
	radiator: Pick<WallElement, 'width' | 'height' | 'elevation'>,
	window: Pick<WallElement, 'offset' | 'width' | 'elevation'>,
	wallLength: number
): { offset: number; elevation: number } {
	const centered = window.offset + window.width / 2 - radiator.width / 2;
	const room = window.elevation - RADIATOR_SILL_GAP - radiator.height;
	return {
		offset: clampOffset(centered, radiator.width, wallLength),
		elevation: Math.max(0, Math.min(radiator.elevation, room))
	};
}

export function switchAboveWorktop(height: number, center = SWITCH_WORKTOP_CENTER): number {
	return elevationForCenter(center, height);
}

export function placementAt(
	kind: RoomElement['kind'],
	room: Pick<Room, 'polygon' | 'height' | 'elements'> & Partial<Pick<Room, 'slopes'>>,
	point: Vec,
	newId: IdFactory,
	threshold: number
): RoomElement | undefined {
	if (kind === 'ceilingLamp') {
		const base = createElement(kind, room, 1, 0, newId);
		if (base.kind === 'ceilingLamp' && pointInPolygon(point, room.polygon, 1)) {
			return { ...base, x: roundStep(point.x), y: roundStep(point.y) };
		}
		return base;
	}
	if (kind === 'roofWindow') {
		const hit = pickSlopeWall(room, point);
		if (!hit) return undefined;
		const created = createElement(kind, room, hit.wall, hit.along, newId);
		if (created.kind !== 'roofWindow') return created;
		return {
			...created,
			offset: clampRoofOffset(room, hit.wall, created.offset, created.width)
		};
	}
	const hit = pickWall(room.polygon, point);
	if (!hit) return undefined;
	const created = createElement(kind, room, hit.wall.number, hit.along, newId);
	if (isFreeElement(created)) {
		const inside = hit.distance > created.depth && pointInPolygon(point, room.polygon, 1);
		return inside ? { ...created, x: roundStep(point.x), y: roundStep(point.y) } : created;
	}
	if (!isWallElement(created)) return created;
	const snapped = snapOffset({
		offset: hit.along - created.width / 2,
		width: created.width,
		wallLength: hit.wall.length,
		neighbors: neighborSpans(room, hit.wall.number),
		threshold
	});
	return { ...created, offset: snapped.value };
}

export function duplicateOffset(
	element: Pick<WallElement, 'offset' | 'width'>,
	wallLength: number
): number {
	const length = Math.round(wallLength);
	const right = element.offset + element.width;
	if (right + element.width <= length) return right;
	const left = element.offset - element.width;
	if (left >= 0) return left;
	return clampOffset(element.offset, element.width, length);
}

export function wallCorners(polygon: readonly Point[], wallNumber: number): string {
	const target = wall(polygon, wallNumber);
	return target ? `${cornerLabel(target.startIndex)}–${cornerLabel(target.endIndex)}` : '';
}

export function nudgeDelta(
	key: string,
	shift: boolean,
	vertical: boolean
): { along: number; up: number } | undefined {
	const step = shift ? 100 : 10;
	switch (key) {
		case 'ArrowLeft':
			return { along: vertical ? step : -step, up: 0 };
		case 'ArrowRight':
			return { along: vertical ? -step : step, up: 0 };
		case 'ArrowUp':
			return vertical ? { along: 0, up: step } : { along: -step, up: 0 };
		case 'ArrowDown':
			return vertical ? { along: 0, up: -step } : { along: step, up: 0 };
		default:
			return undefined;
	}
}

export function hasCenterHeight(kind: RoomElement['kind']): boolean {
	return kind === 'socket' || kind === 'switch' || kind === 'wallLamp' || kind === 'dataPort';
}

export function alongToScreen(along: number, length: number, scale: number, pad: number): number {
	return pad + (length - along) * scale;
}

export function screenDeltaToAlong(deltaPx: number, scale: number): number {
	return -deltaPx / scale;
}
