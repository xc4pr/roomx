import { Matrix4 } from 'three';
import { MM } from '../coords.ts';
import type { WallFrame, WallOpening } from './frames.ts';
import { PALETTE, type MaterialSpec } from './materials.ts';
import type { Parts } from './parts.ts';
import { profileTop, type ProfilePoint } from './profile.ts';

export const GLASS_THICKNESS = 50;

export const GLASS: MaterialSpec = {
	color: PALETTE.glass,
	opacity: 0.22,
	roughness: 0.1
};

const BAR: MaterialSpec = { color: PALETTE.alu, roughness: 0.5, metalness: 0.3 };
const POST_SPACING = 1400;
const BAR_WIDTH = 0.05;
const BAR_DEPTH = 0.07;
const KICK = 0.08;

type Interval = readonly [number, number];

function without(from: number, to: number, cuts: readonly Interval[]): Interval[] {
	const result: Interval[] = [];
	let cursor = from;
	for (const [a, b] of [...cuts].sort((x, y) => x[0] - y[0])) {
		if (b <= cursor || a >= to) continue;
		if (a > cursor) result.push([cursor, a]);
		cursor = Math.max(cursor, b);
	}
	if (cursor < to) result.push([cursor, to]);
	return result.filter(([a, b]) => b - a > 0.005);
}

// Slim aluminium frame of a glass wall in the wall's local frame (x along the wall, y up, z outwards).
export function addGlassFrame(
	parts: Parts,
	frame: WallFrame,
	openings: readonly WallOpening[],
	profile: readonly ProfilePoint[]
): void {
	const zc = (frame.thickness * MM) / 2;
	const z0 = zc - BAR_DEPTH / 2;
	const z1 = zc + BAR_DEPTH / 2;
	const length = frame.length * MM;
	const cuts: Interval[] = openings.map((o) => [o.from * MM, o.to * MM]);
	const inside = (u: number) => cuts.some(([a, b]) => u > a + 0.001 && u < b - 0.001);

	const count = Math.max(1, Math.ceil(length / (POST_SPACING * MM)));
	const stops = new Set<number>();
	for (let i = 0; i <= count; i++) stops.add(Math.round(((i * length) / count) * 1000) / 1000);
	for (const [a, b] of cuts) {
		stops.add(Math.round(a * 1000) / 1000);
		stops.add(Math.round(b * 1000) / 1000);
	}
	for (const u of stops) {
		if (u < -0.001 || u > length + 0.001 || inside(u)) continue;
		const top = profileTop(profile, Math.min(frame.length, Math.max(0, u / MM)), 'left') * MM;
		parts.box(BAR, [u - BAR_WIDTH / 2, 0, z0], [u + BAR_WIDTH / 2, top, z1]);
	}

	const kickCuts = openings
		.filter((o) => o.bottom < KICK / MM)
		.map((o): Interval => [o.from * MM, o.to * MM]);
	for (const [a, b] of without(0, length, kickCuts)) {
		parts.box(BAR, [a, 0, z0], [b, KICK, z1]);
	}

	for (let i = 1; i < profile.length; i++) {
		const p = profile[i - 1];
		const q = profile[i];
		if (q.u - p.u < 1) continue;
		const slope = (q.h - p.h) / (q.u - p.u);
		const heightAt = (u: number) => p.h + slope * (u - p.u);
		const reach = openings
			.filter(
				(o) => o.top >= (heightAt(Math.max(o.from, p.u)) + heightAt(Math.min(o.to, q.u))) / 2 - 60
			)
			.map((o): Interval => [o.from * MM, o.to * MM]);
		for (const [a, b] of without(p.u * MM, q.u * MM, reach)) {
			const ua = a / MM;
			const ub = b / MM;
			const ha = heightAt(ua) * MM;
			const hb = heightAt(ub) * MM;
			const run = Math.hypot(b - a, hb - ha);
			const angle = Math.atan2(hb - ha, b - a);
			const matrix = new Matrix4()
				.makeTranslation((a + b) / 2, (ha + hb) / 2 - BAR_WIDTH / 2, zc)
				.multiply(new Matrix4().makeRotationZ(angle));
			parts.box(
				BAR,
				[-run / 2, -BAR_WIDTH / 2, -BAR_DEPTH / 2],
				[run / 2, BAR_WIDTH / 2, BAR_DEPTH / 2],
				matrix
			);
		}
	}
}
