import { createElement } from '#lib/core/defaults.ts';
import { slopeAngleFromDepth, slopeRun, type Span } from '#lib/core/geometry.ts';
import type { IdFactory } from '#lib/core/ids.ts';
import type { Dormer, Room, Slope, Window as WindowElement } from '#lib/core/schema.ts';
import { clampAngle } from './slopeInfo.ts';

export const MIN_SECTION = 300;
export const MIN_DORMER = 300;
export const DORMER_HEIGHT = 2100;
export const DORMER_WINDOW_MARGIN = 150;
export const DORMER_WINDOW_TOP_GAP = 100;
export const MIN_DORMER_WINDOW = 300;

type RoomHeight = Pick<Room, 'height'>;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(min, max), Math.max(min, value));
}

export function sectionSpan(slope: Slope, wallLength: number): Span {
	const length = Math.round(wallLength);
	if (slope.from === undefined && slope.to === undefined) return { from: 0, to: length };
	const from = clamp(Math.round(slope.from ?? 0), 0, length);
	return { from, to: clamp(Math.round(slope.to ?? length), from, length) };
}

export function isWholeWall(slope: Slope): boolean {
	return slope.from === undefined && slope.to === undefined;
}

function sorted(sections: readonly Slope[], wallLength: number): Slope[] {
	return [...sections].sort(
		(a, b) => sectionSpan(a, wallLength).from - sectionSpan(b, wallLength).from
	);
}

function withSpan(slope: Slope, span: Span, wallLength: number): Slope {
	const { from: _from, to: _to, ...rest } = slope;
	if (span.from <= 0 && span.to >= Math.round(wallLength)) return rest;
	return { ...rest, from: span.from, to: span.to };
}

export function sectionBounds(
	sections: readonly Slope[],
	id: string,
	wallLength: number
): { min: number; max: number } {
	const list = sorted(sections, wallLength);
	const index = list.findIndex((slope) => slope.id === id);
	const before = index > 0 ? sectionSpan(list[index - 1], wallLength).to : 0;
	const after =
		index >= 0 && index < list.length - 1
			? sectionSpan(list[index + 1], wallLength).from
			: Math.round(wallLength);
	return { min: before, max: after };
}

export function resizeSection(
	sections: readonly Slope[],
	id: string,
	patch: Partial<Span>,
	wallLength: number
): Slope[] {
	const { min, max } = sectionBounds(sections, id, wallLength);
	return sections.map((slope) => {
		if (slope.id !== id) return slope;
		const current = sectionSpan(slope, wallLength);
		const from = clamp(Math.round(patch.from ?? current.from), min, current.to - MIN_SECTION);
		const to = clamp(Math.round(patch.to ?? current.to), from + MIN_SECTION, max);
		const next = withSpan(slope, { from, to }, wallLength);
		return trimDormers(next, wallLength);
	});
}

function trimDormers(slope: Slope, wallLength: number): Slope {
	if (!slope.dormers) return slope;
	const span = sectionSpan(slope, wallLength);
	const dormers = slope.dormers
		.map((dormer) => ({
			...dormer,
			from: Math.max(span.from, dormer.from),
			to: Math.min(span.to, dormer.to)
		}))
		.filter((dormer) => dormer.to - dormer.from >= 1);
	const { dormers: _old, ...rest } = slope;
	return dormers.length > 0 ? { ...rest, dormers } : rest;
}

export function restrictToPart(slope: Slope, wallLength: number): Slope {
	return {
		...slope,
		from: 0,
		to: Math.round(wallLength / 2)
	};
}

export function widenToWholeWall(slope: Slope): Slope {
	const { from: _from, to: _to, ...rest } = slope;
	return rest;
}

function gaps(taken: readonly Span[], within: Span): Span[] {
	const free: Span[] = [];
	let cursor = within.from;
	for (const span of [...taken].sort((a, b) => a.from - b.from)) {
		if (span.from > cursor) free.push({ from: cursor, to: Math.min(span.from, within.to) });
		cursor = Math.max(cursor, span.to);
	}
	if (cursor < within.to) free.push({ from: cursor, to: within.to });
	return free;
}

function largest(spans: readonly Span[], minimum: number): Span | undefined {
	let best: Span | undefined;
	for (const span of spans) {
		if (span.to - span.from < minimum) continue;
		if (!best || span.to - span.from > best.to - best.from) best = span;
	}
	return best;
}

export function freeSectionGap(sections: readonly Slope[], wallLength: number): Span | undefined {
	return largest(
		gaps(
			sections.map((slope) => sectionSpan(slope, wallLength)),
			{ from: 0, to: Math.round(wallLength) }
		),
		MIN_SECTION
	);
}

export function addSection(
	sections: readonly Slope[],
	wallNumber: number,
	wallLength: number,
	newId: IdFactory
): Slope[] | undefined {
	const gap = freeSectionGap(sections, wallLength);
	if (!gap) return undefined;
	const template = sorted(sections, wallLength).at(-1);
	const added: Slope = {
		id: newId(),
		wall: wallNumber,
		kneeHeight: template?.kneeHeight ?? 1000,
		angle: template?.angle ?? 45,
		from: gap.from,
		to: gap.to
	};
	return [...sections, added];
}

export function freeDormerGap(slope: Slope, wallLength: number): Span | undefined {
	return largest(
		gaps(
			(slope.dormers ?? []).map((dormer) => ({ from: dormer.from, to: dormer.to })),
			sectionSpan(slope, wallLength)
		),
		MIN_DORMER
	);
}

export function addDormer(
	slope: Slope,
	wallLength: number,
	room: RoomHeight,
	newId: IdFactory
): Slope | undefined {
	const gap = freeDormerGap(slope, wallLength);
	if (!gap) return undefined;
	const width = Math.min(1500, gap.to - gap.from);
	const from = Math.round((gap.from + gap.to) / 2 - width / 2);
	const dormer: Dormer = {
		id: newId(),
		from,
		to: from + width,
		height: Math.min(DORMER_HEIGHT, room.height)
	};
	return { ...slope, dormers: [...(slope.dormers ?? []), dormer] };
}

export function resizeDormer(
	slope: Slope,
	id: string,
	patch: Partial<Span> & { height?: number },
	wallLength: number,
	room: RoomHeight
): Slope {
	const span = sectionSpan(slope, wallLength);
	const list = [...(slope.dormers ?? [])].sort((a, b) => a.from - b.from);
	const index = list.findIndex((dormer) => dormer.id === id);
	if (index < 0) return slope;
	const min = index > 0 ? list[index - 1].to : span.from;
	const max = index < list.length - 1 ? list[index + 1].from : span.to;
	const dormers = (slope.dormers ?? []).map((dormer) => {
		if (dormer.id !== id) return dormer;
		const from = clamp(Math.round(patch.from ?? dormer.from), min, dormer.to - MIN_DORMER);
		const to = clamp(Math.round(patch.to ?? dormer.to), from + MIN_DORMER, max);
		const height = clamp(Math.round(patch.height ?? dormer.height), 1, room.height);
		return { ...dormer, from, to, height };
	});
	return { ...slope, dormers };
}

export function removeDormer(slope: Slope, id: string): Slope {
	const dormers = (slope.dormers ?? []).filter((dormer) => dormer.id !== id);
	const { dormers: _old, ...rest } = slope;
	return dormers.length > 0 ? { ...rest, dormers } : rest;
}

export function dormerWidthForWindow(dormer: Pick<Dormer, 'from' | 'to'>): number {
	return dormer.to - dormer.from - 2 * DORMER_WINDOW_MARGIN;
}

export function dormerWindow(
	room: Pick<Room, 'polygon' | 'height'>,
	slope: Slope,
	dormer: Dormer,
	newId: IdFactory
): WindowElement | undefined {
	const width = dormerWidthForWindow(dormer);
	if (width < MIN_DORMER_WINDOW) return undefined;
	const top = Math.round(dormer.height - DORMER_WINDOW_TOP_GAP);
	if (top < 200) return undefined;
	const base = createElement('window', room, slope.wall, (dormer.from + dormer.to) / 2, newId);
	if (base.kind !== 'window') return undefined;
	const height = Math.min(base.height, top);
	return {
		...base,
		offset: Math.round(dormer.from + DORMER_WINDOW_MARGIN),
		width,
		height,
		elevation: top - height
	};
}

export function depthOf(room: RoomHeight, slope: Pick<Slope, 'kneeHeight' | 'angle'>): number {
	return Math.round(slopeRun(room, slope));
}

export function angleForDepth(room: RoomHeight, kneeHeight: number, depth: number): number {
	return clampAngle(slopeAngleFromDepth(room.height, kneeHeight, depth));
}
