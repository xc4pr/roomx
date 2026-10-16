import { bead, box, cyl, mat, metalMat, tube } from './kit.ts';
import { bands, TUBE_R, TUBE_T, type Plan } from './plan.ts';

function corners(c: Plan, inset: number): [number, number][] {
	return [-1, 1].flatMap((sx) =>
		[-1, 1].map((sz): [number, number] => [sx * (c.w / 2 - inset), sz * (c.d / 2 - inset)])
	);
}

function legacyLegs(c: Plan): void {
	const legs = mat('wood', c.p.darkWood);
	for (const [x, z] of corners(c, 0.05)) box(c.g, legs, 0.04, c.baseH, 0.04, x, c.wheelsH, z);
}

function legs(c: Plan, inset: number, size: number, taper: number): void {
	const metal = c.look.baseMaterial === 'metal';
	const material = metal ? metalMat(c.metal) : mat('wood', c.p.darkWood);
	const dia = metal ? size * 0.55 : size;
	for (const [x, z] of corners(c, inset)) {
		cyl(c.g, material, dia, c.baseH, dia, x, c.wheelsH, z, metal ? 1 : taper, 10);
	}
}

function plinth(c: Plan): void {
	const front = c.fz + 0.04;
	const back = c.backZ - 0.02;
	box(
		c.g,
		mat('matte', c.p.darkWood),
		c.cw - 0.04,
		c.baseH,
		back - front,
		0,
		c.wheelsH,
		(front + back) / 2
	);
}

function frame(c: Plan): void {
	const metal = metalMat(c.metal);
	const lo = c.wheelsH + TUBE_R;
	const hi = c.h - TUBE_R;
	const levels = [
		lo,
		...bands(c)
			.slice(0, -1)
			.map((b) => b.y),
		hi
	];
	const nodes = corners(c, TUBE_R);
	for (const y of levels) {
		for (const [x, z] of nodes) {
			bead(c.g, metal, TUBE_R * 2, x, y, z);
		}
		for (const sz of [-1, 1])
			tube(c.g, metal, 'x', c.w - TUBE_R * 2, TUBE_T, 0, y, sz * (c.d / 2 - TUBE_R));
		for (const sx of [-1, 1])
			tube(c.g, metal, 'z', c.d - TUBE_R * 2, TUBE_T, sx * (c.w / 2 - TUBE_R), y, 0);
	}
	for (const [x, z] of nodes) tube(c.g, metal, 'y', hi - lo, TUBE_T, x, (lo + hi) / 2, z);
}

function wheels(c: Plan): void {
	const dia = c.wheelsH * 0.72;
	const rubber = mat('plastic', c.p.darkMetal);
	const inset = c.tubes ? dia / 2 + 0.002 : 0.04;
	for (const [x, z] of corners(c, inset)) {
		tube(c.g, rubber, 'x', 0.016, dia, x, dia / 2, z);
		cyl(c.g, metalMat(c.metal), 0.014, c.wheelsH - dia, 0.014, x, dia, z, 1, 8);
	}
}

export function support(c: Plan): void {
	switch (c.look.base) {
		case undefined:
			if (c.baseH > 0) legacyLegs(c);
			break;
		case 'legs':
			legs(c, 0.05, 0.04, 1.5);
			break;
		case 'feet':
			legs(c, 0.04, 0.045, 1.3);
			break;
		case 'plinth':
			plinth(c);
			break;
		case 'frame':
			frame(c);
			break;
		default:
			break;
	}
	if (c.wheelsH > 0) wheels(c);
}
