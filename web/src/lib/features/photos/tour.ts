import {
	add,
	centroid,
	cornerLabel,
	cross,
	distance,
	dot,
	interiorAngle,
	isConvexCorner,
	length,
	pointInPolygon,
	scale,
	sub,
	walls,
	wallPoint,
	type Vec,
	type Wall
} from '#lib/core/geometry.ts';
import {
	isElectrical,
	isWallElement,
	type Perspective,
	type Room,
	type WallElement
} from '#lib/core/schema.ts';
import { elementKindNames } from '#lib/i18n/common.ts';

export interface TourStep {
	key: string;
	perspective: Perspective;
	optional: boolean;
	// Camera position and viewing direction in room coordinates for the mini plan.
	position: Vec;
	direction: Vec;
}

const CORNER_OFFSET = 350;
const WALL_MARGIN = 300;
const FLAT_CORNER_TOLERANCE = 1;
const ELECTRIC_GROUP_GAP = 800;
const DETAIL_DISTANCE = 1800;
const ELECTRIC_DISTANCE = 1200;

function unit(v: Vec, fallback: Vec = { x: 0, y: 1 }): Vec {
	const len = length(v);
	return len < 1e-9 ? fallback : scale(v, 1 / len);
}

function rayDistance(polygon: readonly Vec[], origin: Vec, direction: Vec): number {
	let best = Infinity;
	const n = polygon.length;
	for (let i = 0; i < n; i++) {
		const a = polygon[i];
		const edge = sub(polygon[(i + 1) % n], a);
		const denominator = cross(direction, edge);
		if (Math.abs(denominator) < 1e-9) continue;
		const toStart = sub(a, origin);
		const t = cross(toStart, edge) / denominator;
		const u = cross(toStart, direction) / denominator;
		if (t > 1 && u >= -1e-9 && u <= 1 + 1e-9 && t < best) best = t;
	}
	return best;
}

function standBack(
	polygon: readonly Vec[],
	origin: Vec,
	inward: Vec,
	desired: number
): { position: Vec; distance: number } {
	const hit = rayDistance(polygon, origin, inward);
	let reach = Number.isFinite(hit) ? hit - WALL_MARGIN : desired;
	if (Number.isFinite(hit) && hit < WALL_MARGIN * 2) reach = hit / 2;
	let travel = Math.max(1, Math.min(desired, reach));
	let position = add(origin, scale(inward, travel));
	for (let i = 0; i < 12 && !pointInPolygon(position, polygon); i++) {
		travel *= 0.7;
		position = add(origin, scale(inward, travel));
	}
	return { position, distance: travel };
}

function insidePoint(polygon: readonly Vec[]): Vec {
	const middle = centroid(polygon);
	if (pointInPolygon(middle, polygon)) return middle;
	let best = polygon[0];
	let bestScore = -1;
	const xs = polygon.map((p) => p.x);
	const ys = polygon.map((p) => p.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	for (let i = 1; i < 24; i++) {
		for (let j = 1; j < 24; j++) {
			const p = { x: minX + ((maxX - minX) * i) / 24, y: minY + ((maxY - minY) * j) / 24 };
			if (!pointInPolygon(p, polygon)) continue;
			let nearest = Infinity;
			for (let k = 0; k < polygon.length; k++) {
				const a = polygon[k];
				const b = polygon[(k + 1) % polygon.length];
				const edge = sub(b, a);
				const lenSq = dot(edge, edge) || 1;
				const t = Math.max(0, Math.min(1, dot(sub(p, a), edge) / lenSq));
				nearest = Math.min(nearest, distance(p, add(a, scale(edge, t))));
			}
			if (nearest > bestScore) {
				bestScore = nearest;
				best = p;
			}
		}
	}
	return best;
}

function cornerPosition(polygon: readonly Vec[], corner: Vec, bisector: Vec): Vec {
	for (const offset of [CORNER_OFFSET, 200, 100]) {
		const p = add(corner, scale(bisector, offset));
		if (pointInPolygon(p, polygon)) return p;
	}
	return corner;
}

function targetCorner(polygon: readonly Vec[], index: number, from: Vec, direction: Vec): number {
	let best = -1;
	let bestAngle = Infinity;
	let bestDistance = 0;
	polygon.forEach((corner, i) => {
		if (i === index) return;
		const delta = sub(corner, from);
		const len = length(delta);
		if (len < 1) return;
		const angle = Math.acos(Math.max(-1, Math.min(1, dot(unit(delta), direction))));
		const reach = distance(corner, from);
		if (angle < bestAngle - 1e-6 || (Math.abs(angle - bestAngle) <= 1e-6 && reach > bestDistance)) {
			best = i;
			bestAngle = angle;
			bestDistance = reach;
		}
	});
	return best;
}

function cornerSteps(room: Room, wallList: Wall[]): TourStep[] {
	const polygon = room.polygon;
	const n = polygon.length;
	const steps: TourStep[] = [];
	for (let i = 0; i < n; i++) {
		const label = cornerLabel(i);
		const angle = interiorAngle(polygon, i);
		if (Math.abs(angle - 180) < FLAT_CORNER_TOLERANCE) continue;
		const incoming = wallList[(i - 1 + n) % n];
		const outgoing = wallList[i];
		const bisector = unit(add(incoming.inward, outgoing.inward), outgoing.inward);
		const position = cornerPosition(polygon, polygon[i], bisector);
		if (isConvexCorner(polygon, i)) {
			const target = targetCorner(polygon, i, position, bisector);
			const targetLabel = target >= 0 ? cornerLabel(target) : label;
			steps.push({
				key: `corner:${label}`,
				optional: false,
				position,
				direction: bisector,
				perspective: {
					kind: 'corner',
					ref: label,
					stepKey: `corner:${label}`,
					caption: {
						de: `Ecke ${label}, Blick Richtung ${targetLabel}`,
						en: `Corner ${label}, looking towards ${targetLabel}`
					}
				}
			});
			continue;
		}
		const variants = [
			{ suffix: '1', wall: incoming, direction: scale(incoming.direction, -1) },
			{ suffix: '2', wall: outgoing, direction: outgoing.direction }
		];
		for (const variant of variants) {
			const key = `corner:${label}:${variant.suffix}`;
			steps.push({
				key,
				optional: false,
				position,
				direction: variant.direction,
				perspective: {
					kind: 'corner',
					ref: label,
					stepKey: key,
					caption: {
						de: `Ecke ${label} (einspringend), entlang Wand ${variant.wall.number}`,
						en: `Corner ${label} (reflex), along wall ${variant.wall.number}`
					}
				}
			});
		}
	}
	return steps;
}

function wallSteps(room: Room, wallList: Wall[]): TourStep[] {
	return wallList.map((target) => {
		const origin = wallPoint(target, target.length / 2);
		const { position } = standBack(room.polygon, origin, target.inward, Infinity);
		const key = `wall:${target.number}`;
		return {
			key,
			optional: false,
			position,
			direction: scale(target.inward, -1),
			perspective: {
				kind: 'wall' as const,
				ref: String(target.number),
				stepKey: key,
				caption: { de: `Wand ${target.number} frontal`, en: `Wall ${target.number}, head-on` }
			}
		};
	});
}

function surfaceSteps(room: Room, first: Wall | undefined): TourStep[] {
	const position = insidePoint(room.polygon);
	const direction = first ? first.inward : { x: 0, y: 1 };
	return [
		{
			key: 'ceiling',
			optional: false,
			position,
			direction,
			perspective: {
				kind: 'ceiling',
				stepKey: 'ceiling',
				caption: { de: 'Decke mit Lampenauslässen', en: 'Ceiling with light outlets' }
			}
		},
		{
			key: 'floor',
			optional: false,
			position,
			direction,
			perspective: {
				kind: 'floor',
				stepKey: 'floor',
				caption: { de: 'Boden', en: 'Floor' }
			}
		}
	];
}

function detailStep(
	room: Room,
	target: Wall,
	along: number,
	desired: number,
	key: string,
	ref: string,
	caption: { de: string; en: string }
): TourStep {
	const origin = wallPoint(target, along);
	const { position } = standBack(room.polygon, origin, target.inward, desired);
	return {
		key,
		optional: true,
		position,
		direction: scale(target.inward, -1),
		perspective: { kind: 'element', ref, stepKey: key, caption }
	};
}

function elementSteps(room: Room, wallList: Wall[]): TourStep[] {
	const steps: TourStep[] = [];
	for (const target of wallList) {
		const onWall = room.elements
			.filter(isWallElement)
			.filter((element) => element.wall === target.number)
			.sort((a, b) => a.offset - b.offset);
		for (const element of onWall) {
			if (element.kind !== 'door' && element.kind !== 'window' && element.kind !== 'builtin') {
				continue;
			}
			const names = elementKindNames;
			steps.push(
				detailStep(
					room,
					target,
					element.offset + element.width / 2,
					DETAIL_DISTANCE,
					`element:${element.id}`,
					element.id,
					{
						de: `${names.de[element.kind]}, Wand ${target.number}`,
						en: `${names.en[element.kind]}, wall ${target.number}`
					}
				)
			);
		}
		const groups: WallElement[][] = [];
		for (const element of onWall.filter(isElectrical)) {
			const group = groups[groups.length - 1];
			const last = group?.[group.length - 1];
			if (group && last && element.offset - (last.offset + last.width) <= ELECTRIC_GROUP_GAP) {
				group.push(element);
			} else {
				groups.push([element]);
			}
		}
		for (const group of groups) {
			const from = Math.min(...group.map((element) => element.offset));
			const to = Math.max(...group.map((element) => element.offset + element.width));
			steps.push(
				detailStep(
					room,
					target,
					(from + to) / 2,
					ELECTRIC_DISTANCE,
					`electric:${group[0].id}`,
					group[0].id,
					{
						de: `Elektro, Wand ${target.number}`,
						en: `Electrical, wall ${target.number}`
					}
				)
			);
		}
	}
	return steps;
}

export function generateTour(room: Room): TourStep[] {
	if (room.polygon.length < 3) return [];
	const wallList = walls(room.polygon);
	return [
		...cornerSteps(room, wallList),
		...wallSteps(room, wallList),
		...surfaceSteps(room, wallList[0]),
		...elementSteps(room, wallList)
	];
}

export function tourProgress(room: Room): { done: number; total: number } {
	const required = generateTour(room).filter((step) => !step.optional);
	const taken = new Set(room.photos.map((photo) => photo.perspective.stepKey));
	return { done: required.filter((step) => taken.has(step.key)).length, total: required.length };
}
