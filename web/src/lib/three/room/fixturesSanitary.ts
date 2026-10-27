import { Matrix4 } from 'three';
import { MM } from '../coords.ts';
import type { AcWall, Bathtub, Shower, Toilet, Washbasin } from '#lib/core/schema.ts';
import type { Draw } from './draw.ts';
import { PALETTE, type MaterialSpec } from './materials.ts';
import { tinted } from './parts.ts';

const CORNER_TOLERANCE = 1;

export interface SanitaryStyle {
	ceramic: MaterialSpec;
	chrome: MaterialSpec;
	glass: MaterialSpec;
	white: MaterialSpec;
	dark: MaterialSpec;
}

export function sanitaryStyle(status: Washbasin['status']): SanitaryStyle {
	return {
		ceramic: tinted({ color: PALETTE.ceramic, roughness: 0.3 }, status),
		chrome: tinted({ color: PALETTE.chrome, roughness: 0.25, metalness: 0.7 }, status),
		glass: tinted({ color: PALETTE.glass, opacity: 0.28, roughness: 0.08 }, status),
		white: tinted({ color: PALETTE.radiator, roughness: 0.5 }, status),
		dark: tinted({ color: PALETTE.appliance, roughness: 0.5 }, status)
	};
}

function tap(draw: Draw, style: SanitaryStyle, u: number, y: number, z: number): void {
	draw.cylinder(style.chrome, [u, y + 0.045, z], 0.014, 0.09, 'y', 8);
	draw.box(style.chrome, [u - 0.008, y + 0.075, z - 0.09], [u + 0.008, y + 0.092, z]);
}

export function addWashbasin(draw: Draw, element: Washbasin): void {
	const style = sanitaryStyle(element.status);
	const a = element.offset * MM;
	const b = (element.offset + element.width) * MM;
	const depth = element.depth * MM;
	const bottom = element.elevation * MM;
	const top = (element.elevation + element.height) * MM;
	const mid = (a + b) / 2;
	const slab = Math.min(0.14, Math.max(0.05, top - bottom));
	draw.box(style.ceramic, [a, top - slab, -depth], [b, top, 0]);
	const pedestal = top - slab - bottom;
	if (pedestal > 0.05) {
		const half = Math.min(0.07, (b - a) / 4);
		draw.box(style.ceramic, [mid - half, bottom, -depth * 0.55], [mid + half, top - slab, -0.01]);
	}
	const bowl = Math.min((b - a) * 0.38, depth * 0.36);
	draw.cylinder(style.white, [mid, top + 0.0015, -depth * 0.52], bowl, 0.003, 'y', 14);
	draw.cylinder(style.dark, [mid, top + 0.0035, -depth * 0.52], 0.02, 0.001, 'y', 8);
	tap(draw, style, mid, top, -0.05);
}

export function addToilet(draw: Draw, element: Toilet): void {
	const style = sanitaryStyle(element.status);
	const a = element.offset * MM;
	const b = (element.offset + element.width) * MM;
	const depth = element.depth * MM;
	const top = (element.elevation + element.height) * MM;
	const lift = element.height * MM > 0.3 ? 0.08 : 0;
	const bottom = element.elevation * MM + lift;
	const mid = (a + b) / 2;
	const radius = (b - a) / 2;
	const seatTop = top;
	const pan = seatTop - 0.035;
	draw.box(style.ceramic, [a, bottom, -(depth - radius)], [b, pan, 0]);
	draw.cylinder(
		style.ceramic,
		[mid, (bottom + pan) / 2, -(depth - radius)],
		radius,
		pan - bottom,
		'y',
		14
	);
	draw.box(style.white, [a, pan, -(depth - radius)], [b, seatTop, -0.12]);
	draw.cylinder(
		style.white,
		[mid, (pan + seatTop) / 2, -(depth - radius)],
		radius,
		seatTop - pan,
		'y',
		14
	);
	draw.box(style.white, [a + 0.02, pan, -0.12], [b - 0.02, seatTop + 0.02, -0.02]);
	const plateY = Math.max(seatTop + 0.4, 0.95);
	draw.box(style.white, [mid - 0.1, plateY, -0.012], [mid + 0.1, plateY + 0.14, 0]);
	draw.box(style.chrome, [mid - 0.06, plateY + 0.05, -0.014], [mid + 0.06, plateY + 0.065, -0.012]);
}

export function addShower(draw: Draw, element: Shower, wallLength: number): void {
	const style = sanitaryStyle(element.status);
	const a = element.offset * MM;
	const b = (element.offset + element.width) * MM;
	const depth = element.depth * MM;
	const bottom = element.elevation * MM;
	const top = (element.elevation + element.height) * MM;
	const tray = 0.035;
	draw.box(style.ceramic, [a, bottom, -depth], [b, bottom + tray, 0]);
	draw.cylinder(
		style.chrome,
		[(a + b) / 2, bottom + tray + 0.001, -depth / 2],
		0.04,
		0.002,
		'y',
		10
	);
	const rodU = a + 0.1;
	draw.cylinder(
		style.chrome,
		[rodU, (bottom + 0.9 + top - 0.15) / 2, -0.02],
		0.012,
		top - 0.15 - bottom - 0.9,
		'y',
		8
	);
	draw.box(style.chrome, [rodU - 0.09, top - 0.2, -0.28], [rodU + 0.09, top - 0.185, -0.03]);
	if (!element.screen) return;
	const pane = 0.008;
	const startCorner = element.offset <= CORNER_TOLERANCE;
	const endCorner = element.offset + element.width >= wallLength - CORNER_TOLERANCE;
	const glassTop = Math.min(top, bottom + 2.0);
	const base = bottom + tray;
	// The pane sits between the profiles: overlapping faces would flicker.
	draw.box(style.glass, [a, base + 0.02, -depth], [b, glassTop - 0.02, -depth + pane]);
	draw.box(style.chrome, [a, base, -depth], [b, base + 0.02, -depth + pane]);
	draw.box(style.chrome, [a, glassTop - 0.02, -depth], [b, glassTop, -depth + pane]);
	if (!startCorner) draw.box(style.glass, [a, base, -depth + pane], [a + pane, glassTop, 0]);
	if (!endCorner) draw.box(style.glass, [b - pane, base, -depth + pane], [b, glassTop, 0]);
}

export function addBathtub(draw: Draw, element: Bathtub): void {
	const style = sanitaryStyle(element.status);
	const a = element.offset * MM;
	const b = (element.offset + element.width) * MM;
	const depth = element.depth * MM;
	const bottom = element.elevation * MM;
	const top = (element.elevation + element.height) * MM;
	const wall = 0.06;
	const floor = Math.min(0.15, (top - bottom) / 2);
	draw.box(style.ceramic, [a, bottom, -depth], [b, bottom + floor, 0]);
	draw.box(style.ceramic, [a, bottom + floor, -depth], [a + wall, top, 0]);
	draw.box(style.ceramic, [b - wall, bottom + floor, -depth], [b, top, 0]);
	draw.box(style.ceramic, [a + wall, bottom + floor, -depth], [b - wall, top, -depth + wall]);
	draw.box(style.ceramic, [a + wall, bottom + floor, -wall], [b - wall, top, 0]);
	draw.cylinder(style.chrome, [a + 0.18, bottom + floor + 0.001, -depth / 2], 0.03, 0.002, 'y', 8);
	tap(draw, style, b - wall - 0.15, top - 0.04, -0.03);
}

export function addAcWall(draw: Draw, element: AcWall): void {
	const style = sanitaryStyle(element.status);
	const a = element.offset * MM;
	const b = (element.offset + element.width) * MM;
	const depth = element.depth * MM;
	const bottom = element.elevation * MM;
	const top = (element.elevation + element.height) * MM;
	const outlet = Math.min(0.05, (top - bottom) / 4);
	draw.box(style.white, [a, bottom + outlet, -depth], [b, top, 0]);
	draw.box(style.dark, [a + 0.03, bottom, -depth + 0.03], [b - 0.03, bottom + outlet, -0.03]);
	const tilt = new Matrix4().makeRotationX(-0.6);
	const pivot = new Matrix4().makeTranslation(0, bottom + 0.03, -depth + 0.05);
	const lamella = pivot.clone().multiply(tilt);
	draw.box(style.white, [a + 0.05, 0, -0.035], [b - 0.05, 0.004, 0.035], lamella);
}
