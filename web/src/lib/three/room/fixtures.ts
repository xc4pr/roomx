import { Matrix4, Vector3 } from 'three';
import { degToRad, MM } from '../coords.ts';
import type { Builtin, Door, Obstacle, Radiator, Window } from '#lib/core/schema.ts';
import { PALETTE, type MaterialSpec } from './materials.ts';
import { tinted, type Parts } from './parts.ts';
import type { V3 } from './builder.ts';

export interface WallContext {
	parts: Parts;
	length: number;
	thickness: number;
	height: number;
}

const OPEN_ANGLE = degToRad(22);

function bounds(element: { elevation: number; height: number }, ctx: WallContext) {
	const bottom = Math.max(0, element.elevation) * MM;
	const top = Math.min(ctx.height, (element.elevation + element.height) * MM);
	return { bottom, top };
}

function frameBars(
	ctx: WallContext,
	spec: MaterialSpec,
	u0: number,
	u1: number,
	y0: number,
	y1: number,
	z0: number,
	z1: number,
	bar: number
): void {
	const { parts } = ctx;
	parts.box(spec, [u0, y0, z0], [u0 + bar, y1, z1]);
	parts.box(spec, [u1 - bar, y0, z0], [u1, y1, z1]);
	parts.box(spec, [u0 + bar, y0, z0], [u1 - bar, y0 + bar, z1]);
	parts.box(spec, [u0 + bar, y1 - bar, z0], [u1 - bar, y1, z1]);
}

export function addDoor(ctx: WallContext, door: Door): void {
	const { parts, thickness: T } = ctx;
	const a = door.offset * MM;
	const b = (door.offset + door.width) * MM;
	const { bottom, top } = bounds(door, ctx);
	const lining = tinted({ color: PALETTE.frame }, door.status);
	const leafSpec = tinted({ color: PALETTE.door, roughness: 0.7 }, door.status);
	const handleSpec = tinted({ color: PALETTE.handle, roughness: 0.4, metalness: 0.4 }, door.status);
	const liningWidth = 0.04;
	const reveal = 0.008;
	parts.box(lining, [a, bottom, -reveal], [a + liningWidth, top, T + reveal]);
	parts.box(lining, [b - liningWidth, bottom, -reveal], [b, top, T + reveal]);
	parts.box(
		lining,
		[a + liningWidth, top - liningWidth, -reveal],
		[b - liningWidth, top, T + reveal]
	);
	const cl = Math.max(0, a - 0.06);
	const cr = Math.min(ctx.length * MM, b + 0.06);
	const ct = Math.min(ctx.height, top + 0.06);
	for (const [z0, z1] of [
		[-0.014, 0],
		[T, T + 0.014]
	] as const) {
		parts.box(lining, [cl, bottom, z0], [a, ct, z1]);
		parts.box(lining, [b, bottom, z0], [cr, ct, z1]);
		parts.box(lining, [a, top, z0], [b, ct, z1]);
	}
	const leafWidth = b - a - 2 * liningWidth;
	const leafTop = top - liningWidth;
	if (door.swing === 'sliding') {
		const roomLength = ctx.length * MM;
		const toStart = door.hinge === 'start' ? a - leafWidth >= -0.01 : b + leafWidth > roomLength;
		const from = toStart ? a - leafWidth + 0.06 : b - 0.06;
		const clampedFrom = Math.max(0, Math.min(roomLength - leafWidth, from));
		parts.box(leafSpec, [clampedFrom, bottom, -0.09], [clampedFrom + leafWidth, leafTop, -0.05]);
		const handleU = toStart ? clampedFrom + leafWidth - 0.1 : clampedFrom + 0.1;
		parts.box(
			handleSpec,
			[handleU - 0.01, bottom + 0.95, -0.105],
			[handleU + 0.01, bottom + 1.12, -0.09]
		);
		parts.box(
			handleSpec,
			[Math.min(clampedFrom, a), top, -0.1],
			[Math.max(clampedFrom + leafWidth, b), Math.min(ctx.height, top + 0.04), -0.04]
		);
		return;
	}
	const atStart = door.hinge === 'start';
	const direction = (door.swing === 'in' ? 1 : -1) * (atStart ? 1 : -1);
	const hinge = new Vector3(atStart ? a + liningWidth : b - liningWidth, 0, T / 2);
	const matrix = new Matrix4()
		.makeTranslation(hinge.x, hinge.y, hinge.z)
		.multiply(new Matrix4().makeRotationY(direction * OPEN_ANGLE));
	const x0 = atStart ? 0 : -leafWidth;
	const x1 = atStart ? leafWidth : 0;
	parts.box(leafSpec, [x0, bottom, -0.02], [x1, leafTop, 0.02], matrix);
	const grip = atStart ? leafWidth - 0.09 : -leafWidth + 0.09;
	parts.box(
		handleSpec,
		[grip - 0.06, bottom + 1.0, -0.045],
		[grip + 0.06, bottom + 1.03, 0.045],
		matrix
	);
}

export function addWindow(ctx: WallContext, window: Window): void {
	const { parts, thickness: T } = ctx;
	const a = window.offset * MM;
	const b = (window.offset + window.width) * MM;
	const { bottom, top } = bounds(window, ctx);
	const frame = tinted({ color: PALETTE.frame, roughness: 0.6 }, window.status);
	const glass = tinted({ color: PALETTE.glass, opacity: 0.3, roughness: 0.1 }, window.status);
	const handle = tinted({ color: PALETTE.handle, roughness: 0.4, metalness: 0.4 }, window.status);
	const zc = T / 2;
	const outer = 0.055;
	frameBars(ctx, frame, a, b, bottom, top, zc - 0.04, zc + 0.04, outer);
	const innerA = a + outer;
	const innerB = b - outer;
	const innerBottom = bottom + outer;
	const innerTop = top - outer;
	const double = window.windowType === 'sliding' || (window.windowType !== 'fixed' && b - a > 1.1);
	const mullion = 0.05;
	const middle = (innerA + innerB) / 2;
	const regions: [number, number][] = double
		? [
				[innerA, middle - mullion / 2],
				[middle + mullion / 2, innerB]
			]
		: [[innerA, innerB]];
	if (double) {
		parts.box(
			frame,
			[middle - mullion / 2, innerBottom, zc - 0.04],
			[middle + mullion / 2, innerTop, zc + 0.04]
		);
	}
	regions.forEach(([u0, u1], index) => {
		let shift = 0;
		if (window.windowType === 'sliding') shift = index === 0 ? -0.018 : 0.018;
		if (window.windowType === 'fixed') {
			parts.box(glass, [u0, innerBottom, zc - 0.004], [u1, innerTop, zc + 0.004]);
			return;
		}
		const bar = 0.04;
		frameBars(ctx, frame, u0, u1, innerBottom, innerTop, zc - 0.03 + shift, zc + 0.03 + shift, bar);
		parts.box(
			glass,
			[u0 + bar, innerBottom + bar, zc - 0.004 + shift],
			[u1 - bar, innerTop - bar, zc + 0.004 + shift]
		);
		if (window.windowType !== 'sliding') {
			const handleU = double ? (index === 0 ? u1 - 0.03 : u0 + 0.03) : u1 - 0.03;
			const handleY = (innerBottom + innerTop) / 2;
			parts.box(
				handle,
				[handleU - 0.011, handleY - 0.05, zc - 0.075],
				[handleU + 0.011, handleY + 0.05, zc - 0.03]
			);
		}
	});
	if (bottom > 0.25) {
		const roomLength = ctx.length * MM;
		const su0 = Math.max(0, a - 0.04);
		const su1 = Math.min(roomLength, b + 0.04);
		// The sill lies on the reveal up to the frame, not in its plane.
		parts.box(frame, [su0, bottom - 0.025, -0.05], [su1, bottom + 0.002, zc - 0.04]);
		parts.box(frame, [su0, bottom - 0.02, T], [su1, bottom, T + 0.04]);
	}
}

function boxFront(ctx: WallContext, element: Builtin | Obstacle) {
	const a = element.offset * MM;
	const b = (element.offset + element.width) * MM;
	const { bottom, top } = bounds(element, ctx);
	return { a, b, bottom, top, depth: element.depth * MM };
}

export function addBuiltin(ctx: WallContext, element: Builtin): void {
	const { parts } = ctx;
	const { a, b, bottom, top, depth } = boxFront(ctx, element);
	const carcass = tinted({ color: PALETTE.builtinCarcass }, element.status);
	const front = tinted({ color: PALETTE.builtin, roughness: 0.6 }, element.status);
	const handleSpec = tinted(
		{ color: PALETTE.handle, roughness: 0.4, metalness: 0.4 },
		element.status
	);
	const panel = 0.02;
	const gap = 0.004;
	parts.box(carcass, [a, bottom, -depth + panel], [b, top, 0]);
	const count = Math.max(1, Math.min(6, Math.round((b - a) / 0.5)));
	const width = (b - a) / count;
	const handleY = top - bottom > 1.8 ? bottom + 1.0 : top - 0.12;
	for (let i = 0; i < count; i++) {
		const u0 = a + i * width + gap / 2;
		const u1 = a + (i + 1) * width - gap / 2;
		parts.box(front, [u0, bottom + gap, -depth], [u1, top - gap, -depth + panel]);
		const handleU = i % 2 === 0 ? u1 - 0.05 : u0 + 0.05;
		parts.box(
			handleSpec,
			[handleU - 0.007, handleY - 0.09, -depth - 0.022],
			[handleU + 0.007, handleY + 0.09, -depth]
		);
	}
}

export function addObstacle(ctx: WallContext, element: Obstacle): void {
	const { a, b, bottom, top, depth } = boxFront(ctx, element);
	ctx.parts.box(
		tinted({ color: PALETTE.obstacle }, element.status),
		[a, bottom, -depth],
		[b, top, 0]
	);
}

export function addRadiator(ctx: WallContext, element: Radiator): void {
	const { parts } = ctx;
	const a = element.offset * MM;
	const b = (element.offset + element.width) * MM;
	const { bottom, top } = bounds(element, ctx);
	const depth = Math.max(0.05, element.depth * MM);
	const body = tinted({ color: PALETTE.radiator, roughness: 0.5 }, element.status);
	const bracket = tinted({ color: PALETTE.handle }, element.status);
	const gapToWall = 0.025;
	const count = Math.max(3, Math.round((b - a) / 0.07));
	const pitch = (b - a - 0.06) / count;
	for (let i = 0; i < count; i++) {
		const u0 = a + 0.03 + i * pitch;
		const ribs: V3 = [u0 + pitch * 0.14, bottom + 0.03, -depth];
		const ribe: V3 = [u0 + pitch * 0.86, top - 0.035, -gapToWall];
		parts.box(body, ribs, ribe);
	}
	parts.box(body, [a, top - 0.035, -depth], [b, top, -gapToWall]);
	parts.box(body, [a, bottom, -depth * 0.9], [b, bottom + 0.03, -gapToWall]);
	parts.box(body, [a, bottom, -depth], [a + 0.025, top, -gapToWall]);
	parts.box(body, [b - 0.025, bottom, -depth], [b, top, -gapToWall]);
	parts.box(bracket, [a + 0.08, bottom + 0.1, -gapToWall], [a + 0.1, bottom + 0.14, 0]);
	parts.box(bracket, [b - 0.1, bottom + 0.1, -gapToWall], [b - 0.08, bottom + 0.14, 0]);
}
