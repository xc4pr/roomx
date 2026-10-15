import { Group } from 'three';
import { cabinet } from './cabinet.ts';
import { box, cyl, mat, type Palette } from './kit.ts';

type Build = (w: number, d: number, h: number, p: Palette) => Group;

const table: Build = (w, d, h, p) => {
	const g = new Group();
	const top = mat('wood', p.main);
	const legs = mat('wood', p.darkWood);
	const t = Math.min(0.035, h * 0.12);
	const leg = Math.min(0.06, w * 0.12, d * 0.12);
	const inset = Math.min(0.05, w * 0.08);
	box(g, top, w, t, d, 0, h - t, 0);
	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			box(
				g,
				legs,
				leg,
				h - t,
				leg,
				sx * (w / 2 - inset - leg / 2),
				0,
				sz * (d / 2 - inset - leg / 2)
			);
		}
	}
	const apron = Math.min(0.08, h * 0.12);
	box(g, legs, w - inset * 2 - leg * 2, apron, 0.02, 0, h - t - apron, d / 2 - inset - leg / 2);
	box(g, legs, w - inset * 2 - leg * 2, apron, 0.02, 0, h - t - apron, -(d / 2 - inset - leg / 2));
	box(g, legs, 0.02, apron, d - inset * 2 - leg * 2, w / 2 - inset - leg / 2, h - t - apron, 0);
	box(g, legs, 0.02, apron, d - inset * 2 - leg * 2, -(w / 2 - inset - leg / 2), h - t - apron, 0);
	return g;
};

const roundTable: Build = (w, d, h, p) => {
	const g = new Group();
	const top = mat('wood', p.main);
	const base = mat('wood', p.darkWood);
	const t = Math.min(0.035, h * 0.12);
	cyl(g, top, w, t, d, 0, h - t, 0, 1, 28);
	cyl(g, base, w * 0.1, h - t - 0.03, d * 0.1, 0, 0.03, 0);
	cyl(g, base, w * 0.45, 0.03, d * 0.45, 0, 0, 0, 0.85, 20);
	return g;
};

const desk: Build = (w, d, h, p) => {
	const g = new Group();
	const top = mat('wood', p.main);
	const legs = mat('wood', p.darkWood);
	const t = Math.min(0.03, h * 0.06);
	box(g, top, w, t, d, 0, h - t, 0);
	const under = h - t;
	const panel = 0.025;
	const modesty = Math.min(0.25, under * 0.35);
	if (w >= 1.1) {
		const unitW = Math.min(0.42, w * 0.32);
		cabinet(g, p, {
			x: w / 2 - unitW / 2 - 0.02,
			w: unitW,
			d: d - 0.03,
			h: under,
			legH: 0,
			rows: [
				{ kind: 'drawer', weight: 1, cols: 1 },
				{ kind: 'drawer', weight: 1.3, cols: 1 }
			],
			handle: 'bar'
		});
		box(g, legs, panel, under, d - 0.06, -w / 2 + 0.04, 0, 0);
		box(
			g,
			top,
			w - unitW - 0.1,
			modesty,
			0.015,
			-(unitW / 2) + 0.01,
			under - modesty,
			d / 2 - 0.05
		);
	} else {
		for (const sx of [-1, 1]) box(g, legs, panel, under, d - 0.06, sx * (w / 2 - 0.04), 0, 0);
		box(g, top, w - 0.1, modesty, 0.015, 0, under - modesty, d / 2 - 0.05);
	}
	return g;
};

export const tables = { table, roundTable, desk };
