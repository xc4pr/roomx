import type { Group } from 'three';
import { box, mat, mix, shade } from './kit.ts';
import type { Plan } from './plan.ts';

export function bookRow(
	g: Group,
	rng: () => number,
	x0: number,
	x1: number,
	y: number,
	z: number,
	depth: number,
	maxH: number,
	base: string
): void {
	let x = x0;
	let index = 0;
	while (x < x1 - 0.02) {
		const width = Math.min(0.02 + rng() * 0.02, x1 - x);
		const height = maxH * (0.7 + rng() * 0.3);
		const hue = [
			mix(base, '#b9694a', 0.7),
			mix(base, '#4f7f9a', 0.7),
			mix(base, '#d8c9a8', 0.6),
			mix(base, '#6b8f5e', 0.6),
			mix(base, '#8a5a7a', 0.6)
		][(index + Math.floor(rng() * 3)) % 5];
		box(g, mat('matte', hue), width, height, depth * (0.85 + rng() * 0.15), x + width / 2, y, z);
		x += width + 0.002;
		index++;
	}
}

export interface Pocket {
	left: number;
	right: number;
	y: number;
	gap: number;
	col: number;
	level: number;
}

export function fillPocket(c: Plan, k: Pocket): void {
	if (c.fill === 'books') return books(c, k);
	if (c.fill === 'bins') bin(c, k);
}

function books(c: Plan, k: Pocket): void {
	if (c.randomBooks && c.rng() <= 0.35) return;
	const x0 = k.left + 0.015 + c.rng() * 0.06;
	const x1 = k.right - 0.015 - c.rng() * 0.1;
	if (x1 - x0 < 0.05) return;
	const depth = c.backZ - c.fz;
	const z = (c.fz + c.backZ) / 2 + 0.02;
	bookRow(c.g, c.rng, x0, x1, k.y, z, depth * 0.7, Math.min(k.gap * 0.8, 0.3), c.p.main);
}

function bin(c: Plan, k: Pocket): void {
	const pick = (k.col * 3 + k.level * 2) % 7;
	if (pick !== 0 && pick !== 4) return;
	const color =
		pick === 0 ? mix(c.p.main, '#c8a572', 0.5) : shade(mix(c.p.main, '#4f7f9a', 0.55), -0.05);
	const wide = k.right - k.left - 0.03;
	const depth = c.backZ - c.boardZ - 0.04;
	box(
		c.g,
		mat('fabric', color),
		wide,
		k.gap - 0.03,
		depth,
		(k.left + k.right) / 2,
		k.y,
		(c.boardZ + c.backZ) / 2 - 0.005
	);
}
