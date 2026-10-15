import { dot, signedArea, walls, type Vec } from '#lib/core/geometry.ts';
import { WALL_THICKNESS } from '#lib/core/defaults.ts';
import type { WallSection } from '../types.ts';
import { isWallElement, type Door, type Point, type Room, type Window } from '#lib/core/schema.ts';

export interface FrameSection {
	from: number;
	to: number;
	full: number;
	body: number;
}

export interface WallFrame {
	number: number;
	start: Vec;
	end: Vec;
	direction: Vec;
	inward: Vec;
	length: number;
	thickness: number;
	sections: FrameSection[];
	outerStart: Vec;
	outerEnd: Vec;
	outerFrom: number;
	outerTo: number;
}

export interface WallOpening {
	id: string;
	from: number;
	to: number;
	bottom: number;
	top: number;
	pushed?: boolean;
}

const MIN_MITRE_DENOMINATOR = 0.15;

function sectionsOf(wall: number, sections: readonly WallSection[]): FrameSection[] {
	const result: FrameSection[] = [];
	let reached = -Infinity;
	for (const section of sections
		.filter((entry) => entry.wall === wall)
		.sort((a, b) => a.from - b.from)) {
		const from = Math.max(section.from, reached);
		if (section.to - from < 1) continue;
		result.push({ from, to: section.to, full: section.thickness, body: section.thickness / 2 });
		reached = section.to;
	}
	return result;
}

export function thicknessAt(frame: WallFrame, u: number): number {
	const section = frame.sections.find((entry) => u > entry.from && u < entry.to);
	return section ? section.body : frame.thickness;
}

export function fullThicknessAt(frame: WallFrame, u: number): number {
	const section = frame.sections.find((entry) => u > entry.from && u < entry.to);
	return section ? section.full : frame.thickness;
}

export function wallFrames(
	polygon: readonly Point[],
	thickness: number = WALL_THICKNESS,
	sections: readonly WallSection[] = []
): WallFrame[] {
	const orientation = signedArea(polygon) < 0 ? -1 : 1;
	const base = walls(polygon).map((wall) => ({
		...wall,
		inward: { x: wall.inward.x * orientation, y: wall.inward.y * orientation }
	}));
	const count = base.length;
	const outerCorners: Vec[] = base.map((wall, index) => {
		const previous = base[(index - 1 + count) % count];
		const denominator = Math.max(MIN_MITRE_DENOMINATOR, 1 + dot(previous.inward, wall.inward));
		return {
			x: wall.start.x - (thickness * (previous.inward.x + wall.inward.x)) / denominator,
			y: wall.start.y - (thickness * (previous.inward.y + wall.inward.y)) / denominator
		};
	});
	return base.map((wall, index) => {
		const outerStart = outerCorners[index];
		const outerEnd = outerCorners[(index + 1) % count];
		const along = (point: Vec) =>
			(point.x - wall.start.x) * wall.direction.x + (point.y - wall.start.y) * wall.direction.y;
		return {
			number: wall.number,
			start: wall.start,
			end: wall.end,
			direction: wall.direction,
			inward: wall.inward,
			length: wall.length,
			thickness,
			sections: sectionsOf(wall.number, sections),
			outerStart,
			outerEnd,
			outerFrom: along(outerStart),
			outerTo: along(outerEnd)
		};
	});
}

export function wallOpenings(
	room: Room,
	frame: WallFrame,
	covered: ReadonlySet<string> = new Set()
): WallOpening[] {
	const lo = Math.max(0, frame.outerFrom);
	const hi = Math.min(frame.length, frame.outerTo);
	const result: WallOpening[] = [];
	for (const element of room.elements) {
		if (!isWallElement(element) || element.wall !== frame.number) continue;
		if (element.kind !== 'door' && element.kind !== 'window') continue;
		const opening = element satisfies Door | Window;
		const from = Math.max(lo, opening.offset);
		const to = Math.min(hi, opening.offset + opening.width);
		const bottom = Math.max(0, opening.elevation);
		const top = Math.min(room.height, opening.elevation + opening.height);
		if (to - from < 1 || top - bottom < 1) continue;
		result.push({ id: opening.id, from, to, bottom, top, pushed: covered.has(opening.id) });
	}
	return result;
}
