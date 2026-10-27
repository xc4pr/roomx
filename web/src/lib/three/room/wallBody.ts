import type { BufferGeometry } from 'three';
import { MM } from '../coords.ts';
import { GeometryBuilder, type V3 } from './builder.ts';
import { thicknessAt, type WallFrame, type WallOpening } from './frames.ts';
import { flatProfile, profileTop, type ProfilePoint } from './profile.ts';

export const BUCKET_INNER = 0;
export const BUCKET_OUTER = 1;
export const BUCKET_CAP = 2;
export const BUCKET_REVEAL = 3;
export const BUCKET_REVEAL_PUSHED = 4;

type Interval = readonly [number, number];

const TOP = Symbol('top');

interface Span {
	lo: number;
	hi: number | typeof TOP;
}

function spansOf(
	openings: readonly WallOpening[],
	from: number,
	to: number,
	height: number
): Span[] {
	const middle = (from + to) / 2;
	const voids = openings
		.filter((opening) => opening.from <= middle && opening.to >= middle)
		.map((opening): Interval => [opening.bottom, opening.top])
		.sort((a, b) => a[0] - b[0]);
	const spans: Span[] = [];
	let cursor = 0;
	for (const [bottom, top] of voids) {
		if (cursor >= height) break;
		if (bottom > cursor) spans.push({ lo: cursor, hi: bottom < height ? bottom : TOP });
		cursor = Math.max(cursor, top);
	}
	if (cursor < height) spans.push({ lo: cursor, hi: TOP });
	return spans.filter((span) => (span.hi === TOP ? height : span.hi) - span.lo > 0.5);
}

function resolve(spans: readonly Span[], top: number): Interval[] {
	return spans.map((span): Interval => [span.lo, span.hi === TOP ? top : span.hi]);
}

function subtract(a: readonly Interval[], b: readonly Interval[]): Interval[] {
	const result: Interval[] = [];
	for (const [from, to] of a) {
		let cursor = from;
		for (const [cutFrom, cutTo] of b) {
			if (cutTo <= cursor || cutFrom >= to) continue;
			if (cutFrom > cursor) result.push([cursor, cutFrom]);
			cursor = Math.max(cursor, cutTo);
		}
		if (cursor < to) result.push([cursor, to]);
	}
	return result.filter(([x, y]) => y - x > 0.5);
}

function breakpoints(
	frame: WallFrame,
	openings: readonly WallOpening[],
	profile: readonly ProfilePoint[]
): number[] {
	const lo = Math.max(0, frame.outerFrom);
	const hi = Math.min(frame.length, frame.outerTo);
	const values = [0, frame.length, frame.outerFrom, frame.outerTo, lo, hi];
	for (const opening of openings) values.push(opening.from, opening.to);
	for (const section of frame.sections) values.push(section.from, section.to);
	for (const point of profile) values.push(point.u);
	for (let i = 1; i < profile.length; i++) {
		const a = profile[i - 1];
		const b = profile[i];
		if (Math.abs(b.h - a.h) < 0.01) continue;
		for (const opening of openings) {
			for (const bound of [opening.bottom, opening.top]) {
				const t = (bound - a.h) / (b.h - a.h);
				if (t <= 0 || t >= 1) continue;
				const u = a.u + t * (b.u - a.u);
				if (u > opening.from && u < opening.to) values.push(u);
			}
		}
	}
	const sorted = values.map((value) => Math.round(value * 100) / 100).sort((a, b) => a - b);
	return sorted.filter((value, index) => index === 0 || value - sorted[index - 1] > 0.01);
}

// Local frame in metres: x along the wall, y up, z outwards; the inner face is z = 0, the outer face z = thickness.
// The wall top follows the profile (mm along the wall); beyond the wall ends it keeps the end height.
export function buildWallGeometry(
	frame: WallFrame,
	openings: readonly WallOpening[],
	heightOrProfile: number | readonly ProfilePoint[]
): BufferGeometry {
	const profile =
		typeof heightOrProfile === 'number'
			? flatProfile(frame.length, heightOrProfile)
			: heightOrProfile;
	const builder = new GeometryBuilder(5);
	const points = breakpoints(frame, openings, profile);
	const baseThickness = frame.thickness * MM;
	const strips = points.slice(0, -1).map((from, index) => ({ from, to: points[index + 1] }));
	const point = (u: number, h: number, z: number): V3 => [u * MM, h * MM, z];
	const topAt = (u: number, from: 'left' | 'right') => profileTop(profile, u, from);
	const topFrom = (strip: { from: number; to: number }) => topAt(strip.from, 'right');
	const topTo = (strip: { from: number; to: number }) => topAt(strip.to, 'left');
	const thicknessOf = (strip: { from: number; to: number }) =>
		thicknessAt(frame, (strip.from + strip.to) / 2) * MM;

	const allPushed = (list: readonly WallOpening[]) =>
		list.length > 0 && list.every((opening) => opening.pushed === true);
	const revealOf = (strip: { from: number; to: number }) => {
		const middle = (strip.from + strip.to) / 2;
		return allPushed(openings.filter((opening) => opening.from <= middle && opening.to >= middle))
			? BUCKET_REVEAL_PUSHED
			: BUCKET_REVEAL;
	};
	const jambOf = (u: number) =>
		allPushed(
			openings.filter(
				(opening) => Math.abs(opening.from - u) < 0.01 || Math.abs(opening.to - u) < 0.01
			)
		)
			? BUCKET_REVEAL_PUSHED
			: BUCKET_REVEAL;

	const inner = strips.filter((strip) => strip.from >= -0.01 && strip.to <= frame.length + 0.01);
	const outer = strips.filter(
		(strip) => strip.from >= frame.outerFrom - 0.01 && strip.to <= frame.outerTo + 0.01
	);
	const spansFor = (strip: { from: number; to: number }) =>
		spansOf(openings, strip.from, strip.to, (topFrom(strip) + topTo(strip)) / 2);

	for (const strip of inner) {
		const t0 = topFrom(strip);
		const t1 = topTo(strip);
		for (const span of spansFor(strip)) {
			builder.quad(
				BUCKET_INNER,
				point(strip.from, span.lo, 0),
				point(strip.to, span.lo, 0),
				point(strip.to, span.hi === TOP ? t1 : span.hi, 0),
				point(strip.from, span.hi === TOP ? t0 : span.hi, 0),
				[0, 0, -1]
			);
		}
	}
	for (const strip of outer) {
		const thickness = thicknessOf(strip);
		const t0 = topFrom(strip);
		const t1 = topTo(strip);
		const spans = spansFor(strip);
		for (const span of spans) {
			builder.quad(
				BUCKET_OUTER,
				point(strip.from, span.lo, thickness),
				point(strip.to, span.lo, thickness),
				point(strip.to, span.hi === TOP ? t1 : span.hi, thickness),
				point(strip.from, span.hi === TOP ? t0 : span.hi, thickness),
				[0, 0, 1]
			);
		}
		const middleTop = (t0 + t1) / 2;
		for (const { lo, hi } of spans) {
			if (lo > 0.5) {
				builder.quad(
					revealOf(strip),
					point(strip.from, lo, 0),
					point(strip.to, lo, 0),
					point(strip.to, lo, thickness),
					point(strip.from, lo, thickness),
					[0, -1, 0]
				);
			}
			if (hi !== TOP && hi < middleTop - 0.5) {
				builder.quad(
					revealOf(strip),
					point(strip.from, hi, 0),
					point(strip.to, hi, 0),
					point(strip.to, hi, thickness),
					point(strip.from, hi, thickness),
					[0, 1, 0]
				);
			}
		}
	}

	for (let index = 0; index < outer.length - 1; index++) {
		const u = outer[index].to;
		const left = resolve(spansFor(outer[index]), topAt(u, 'left'));
		const right = resolve(spansFor(outer[index + 1]), topAt(u, 'right'));
		const leftThickness = thicknessOf(outer[index]);
		const rightThickness = thicknessOf(outer[index + 1]);
		for (const [y0, y1] of subtract(left, right)) {
			builder.quad(
				jambOf(u),
				point(u, y0, 0),
				point(u, y0, leftThickness),
				point(u, y1, leftThickness),
				point(u, y1, 0),
				[1, 0, 0]
			);
		}
		for (const [y0, y1] of subtract(right, left)) {
			builder.quad(
				jambOf(u),
				point(u, y0, 0),
				point(u, y0, rightThickness),
				point(u, y1, rightThickness),
				point(u, y1, 0),
				[-1, 0, 0]
			);
		}
		if (Math.abs(leftThickness - rightThickness) > 1e-6) {
			const leftThicker = leftThickness > rightThickness;
			const z0 = Math.min(leftThickness, rightThickness);
			const z1 = Math.max(leftThickness, rightThickness);
			const thicker = leftThicker ? left : right;
			const both = subtract(thicker, subtract(thicker, leftThicker ? right : left));
			for (const [y0, y1] of both) {
				builder.quad(
					BUCKET_OUTER,
					point(u, y0, z0),
					point(u, y0, z1),
					point(u, y1, z1),
					point(u, y1, z0),
					[leftThicker ? 1 : -1, 0, 0]
				);
			}
		}
	}

	const mapStart = (u: number) => (Math.abs(u) < 0.01 ? frame.outerFrom : u);
	const mapEnd = (u: number) => (Math.abs(u - frame.length) < 0.01 ? frame.outerTo : u);
	let run: { start: number; gradient: number; thickness: number } | undefined;
	const closeRun = (end: number) => {
		if (!run) return;
		const { thickness } = run;
		const matches = Math.abs(thickness - baseThickness) < 1e-6;
		const startsAtEnd = Math.abs(run.start) < 0.01;
		const endsAtEnd = Math.abs(end - frame.length) < 0.01;
		builder.quad(
			BUCKET_CAP,
			point(run.start, topAt(run.start, 'right'), 0),
			point(end, topAt(end, 'left'), 0),
			point(matches ? mapEnd(end) : end, topAt(end, 'left'), thickness),
			point(matches ? mapStart(run.start) : run.start, topAt(run.start, 'right'), thickness),
			[0, 1, 0]
		);
		if (!matches && startsAtEnd && frame.outerFrom < -0.01) {
			builder.triangle(
				BUCKET_CAP,
				point(0, topAt(0, 'right'), 0),
				point(0, topAt(0, 'right'), baseThickness),
				point(frame.outerFrom, topAt(0, 'right'), baseThickness),
				[0, 1, 0]
			);
		}
		if (!matches && endsAtEnd && frame.outerTo > frame.length + 0.01) {
			builder.triangle(
				BUCKET_CAP,
				point(frame.length, topAt(end, 'left'), 0),
				point(frame.outerTo, topAt(end, 'left'), baseThickness),
				point(frame.length, topAt(end, 'left'), baseThickness),
				[0, 1, 0]
			);
		}
		run = undefined;
	};
	for (const strip of inner) {
		const reachesTop = spansFor(strip).some((span) => span.hi === TOP);
		const gradient = (topTo(strip) - topFrom(strip)) / (strip.to - strip.from);
		const thickness = thicknessOf(strip);
		if (reachesTop) {
			if (
				run &&
				(Math.abs(run.gradient - gradient) > 1e-6 ||
					Math.abs(run.thickness - thickness) > 1e-6 ||
					Math.abs(topAt(strip.from, 'left') - topAt(strip.from, 'right')) > 0.01)
			) {
				closeRun(strip.from);
			}
			run ??= { start: strip.from, gradient, thickness };
		} else closeRun(strip.from);
	}
	closeRun(inner.at(-1)?.to ?? frame.length);

	const first = inner[0];
	const last = inner.at(-1);
	if (first) {
		for (const [y0, y1] of resolve(spansFor(first), topAt(first.from, 'right'))) {
			builder.quad(
				BUCKET_OUTER,
				point(0, y0, 0),
				point(frame.outerFrom, y0, baseThickness),
				point(frame.outerFrom, y1, baseThickness),
				point(0, y1, 0),
				[-1, 0, 0]
			);
		}
	}
	if (last) {
		for (const [y0, y1] of resolve(spansFor(last), topAt(last.to, 'left'))) {
			builder.quad(
				BUCKET_OUTER,
				point(frame.length, y0, 0),
				point(frame.outerTo, y0, baseThickness),
				point(frame.outerTo, y1, baseThickness),
				point(frame.length, y1, 0),
				[1, 0, 0]
			);
		}
	}

	const geometry = builder.build();
	if (!geometry) throw new Error('empty wall');
	return geometry;
}
