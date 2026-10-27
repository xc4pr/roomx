import type { WallLink } from '#lib/core/adjacency.ts';
import { WALL_THICKNESS } from '#lib/core/defaults.ts';
import { wallPoint, walls, type Vec } from '#lib/core/geometry.ts';
import { pathOf } from './shape.ts';

export interface WallPiece {
	wall: number;
	from: number;
	to: number;
	thickness: number;
}

// Splits every wall into stretches: the shared part of a linked wall gets the real thickness
// (the gap to the neighbour), the rest keeps the default.
export function wallPieces(
	polygon: readonly Vec[],
	links: readonly WallLink[],
	base = WALL_THICKNESS
): WallPiece[] {
	const pieces: WallPiece[] = [];
	for (const side of walls(polygon)) {
		const shared = links
			.filter((link) => link.wall === side.number)
			.map((link) => ({
				from: Math.max(0, Math.min(link.from, side.length)),
				to: Math.max(0, Math.min(link.to, side.length)),
				thickness: link.thickness
			}))
			.filter((span) => span.to - span.from > 1)
			.sort((a, b) => a.from - b.from);
		let at = 0;
		const add = (from: number, to: number, thickness: number): void => {
			if (to - from < 1e-6) return;
			const last = pieces[pieces.length - 1];
			if (last && last.wall === side.number && last.thickness === thickness && last.to === from) {
				last.to = to;
			} else {
				pieces.push({ wall: side.number, from, to, thickness });
			}
		};
		for (const span of shared) {
			if (span.from < at) continue;
			add(at, span.from, base);
			add(span.from, span.to, span.thickness);
			at = span.to;
		}
		add(at, side.length, base);
	}
	return pieces;
}

// Outer edge of the wall band. Where thickness changes along one wall the edge steps;
// at corners the two offset lines are intersected.
export function bandOutline(polygon: readonly Vec[], pieces: readonly WallPiece[]): Vec[] {
	const sides = walls(polygon);
	const edges = pieces.map((piece) => {
		const side = sides[piece.wall - 1];
		const out = { x: -side.inward.x, y: -side.inward.y };
		return {
			start: {
				x: side.start.x + side.direction.x * piece.from,
				y: side.start.y + side.direction.y * piece.from
			},
			end: {
				x: side.start.x + side.direction.x * piece.to,
				y: side.start.y + side.direction.y * piece.to
			},
			out,
			d: piece.thickness
		};
	});
	const result: Vec[] = [];
	edges.forEach((next, i) => {
		const prev = edges[(i - 1 + edges.length) % edges.length];
		const corner = next.start;
		const det = prev.out.x * next.out.y - prev.out.y * next.out.x;
		if (Math.abs(det) < 1e-3) {
			const a = { x: corner.x + prev.out.x * prev.d, y: corner.y + prev.out.y * prev.d };
			const b = { x: corner.x + next.out.x * next.d, y: corner.y + next.out.y * next.d };
			result.push(a);
			if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-6) result.push(b);
			return;
		}
		const x = (prev.d * next.out.y - next.d * prev.out.y) / det;
		const y = (prev.out.x * next.d - next.out.x * prev.d) / det;
		const reach = 4 * Math.max(prev.d, next.d);
		const length = Math.hypot(x, y);
		const k = length > reach ? reach / length : 1;
		result.push({ x: corner.x + x * k, y: corner.y + y * k });
	});
	return result;
}

export function bandPaths(
	polygon: readonly Vec[],
	links: readonly WallLink[],
	base = WALL_THICKNESS
): { band: string; outline: string } {
	const outer = bandOutline(polygon, wallPieces(polygon, links, base));
	return {
		band: `${pathOf(outer)} ${pathOf([...polygon].reverse())}`,
		outline: pathOf(outer)
	};
}

// Thickness of the wall behind an element: the shared stretch it sits in, else the default.
export function thicknessAt(
	links: readonly WallLink[],
	wall: number,
	offset: number,
	width: number,
	base = WALL_THICKNESS
): number {
	const centre = offset + width / 2;
	const link = links.find(
		(entry) => entry.wall === wall && centre >= entry.from && centre <= entry.to
	);
	return link?.thickness ?? base;
}

export interface BadgePlacement {
	along: number;
	inside: boolean;
}

export interface BadgeLabel {
	along: number;
	half: number;
}

export function wallBadgePlacement(
	length: number,
	shared: readonly { from: number; to: number }[],
	badgeSize: number,
	label: BadgeLabel | null
): BadgePlacement {
	const spans = shared
		.map((span) => ({ from: Math.max(0, span.from), to: Math.min(length, span.to) }))
		.filter((span) => span.to > span.from)
		.sort((a, b) => a.from - b.from);
	const free: { from: number; to: number }[] = [];
	let at = 0;
	for (const span of spans) {
		if (span.from > at) free.push({ from: at, to: span.from });
		at = Math.max(at, span.to);
	}
	if (at < length) free.push({ from: at, to: length });
	const mid = length / 2;
	const fits = free.filter((stretch) => stretch.to - stretch.from >= badgeSize);
	if (fits.length > 0) {
		const half = badgeSize / 2;
		const here = fits.find((stretch) => mid >= stretch.from + half && mid <= stretch.to - half);
		if (here) return { along: mid, inside: false };
		const centre = (stretch: { from: number; to: number }): number =>
			(stretch.from + stretch.to) / 2;
		const nearest = fits.reduce((best, stretch) =>
			Math.abs(centre(stretch) - mid) < Math.abs(centre(best) - mid) ? stretch : best
		);
		return { along: centre(nearest), inside: false };
	}
	if (!label) return { along: mid, inside: true };
	const reach = label.half + badgeSize / 2 + badgeSize / 8;
	const lo = badgeSize / 2;
	const hi = length - badgeSize / 2;
	const after = label.along + reach;
	const before = label.along - reach;
	const along =
		after <= hi && (after - mid <= mid - before || before < lo)
			? after
			: before >= lo
				? before
				: Math.min(hi, Math.max(lo, mid));
	return { along, inside: true };
}

// Glass band of a conservatory: only the edges that do not border the house. On a shared wall the
// house draws the wall.
export function glassBandPath(
	polygon: readonly Vec[],
	links: readonly WallLink[],
	thickness = WALL_THICKNESS
): string {
	const parts: string[] = [];
	for (const side of walls(polygon)) {
		const shared = links
			.filter((link) => link.wall === side.number)
			.map((link) => ({ from: Math.max(0, link.from), to: Math.min(side.length, link.to) }))
			.filter((span) => span.to - span.from > 1)
			.sort((a, b) => a.from - b.from);
		let at = 0;
		const add = (from: number, to: number): void => {
			if (to - from < 1) return;
			parts.push(
				pathOf([
					wallPoint(side, from, 0),
					wallPoint(side, to, 0),
					wallPoint(side, to, -thickness),
					wallPoint(side, from, -thickness)
				])
			);
		};
		for (const span of shared) {
			add(at, span.from);
			at = Math.max(at, span.to);
		}
		add(at, side.length);
	}
	return parts.join(' ');
}
