import { Group } from 'three';
import { box, mat, soft, split, type Palette } from './kit.ts';

export const bed = (w: number, d: number, h: number, p: Palette): Group => {
	const g = new Group();
	const frame = mat('wood', p.main);
	const legs = mat('wood', p.darkWood);
	const mattress = mat('fabric', '#ece8e0');
	const duvet = mat('fabric', '#9fb2c0');
	const duvetEdge = mat('fabric', '#8296a6');
	const pillow = mat('fabric', '#f6f3ee');

	const legH = Math.min(0.1, h * 0.12);
	const frameH = Math.min(0.17, h * 0.2);
	const mattH = Math.min(0.22, h * 0.26);
	const rail = 0.04;
	const top = legH + frameH;

	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			box(g, legs, 0.06, legH, 0.06, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05));
		}
	}
	box(g, frame, w, frameH, d, 0, legH, 0);
	box(g, frame, w, h - legH * 0.4, 0.07, 0, legH * 0.4, d / 2 - 0.035);
	box(g, frame, w, Math.min(h * 0.32, top + 0.1) - legH * 0.4, 0.05, 0, legH * 0.4, -d / 2 + 0.025);
	box(g, legs, w - 0.12, 0.05, 0.03, 0, h * 0.62, d / 2 - 0.085);

	const inner = w - rail * 2;
	const length = d - 0.07 - 0.05;
	const zMid = (d / 2 - 0.07 + -d / 2 + 0.05) / 2;
	soft(g, mattress, inner, mattH, length, 0, top, zMid, 0.15);

	const duvetLength = length * 0.68;
	const duvetZ = -d / 2 + 0.05 + duvetLength / 2 + 0.01;
	const duvetH = Math.min(0.08, h * 0.1);
	soft(g, duvet, inner + 0.02, duvetH, duvetLength, 0, top + mattH * 0.55, duvetZ, 0.4);
	box(
		g,
		duvetEdge,
		inner + 0.022,
		duvetH * 0.5,
		0.02,
		0,
		top + mattH * 0.55 + duvetH * 0.15,
		duvetZ + duvetLength / 2 - 0.05
	);

	const pillows = w > 1.3 ? 2 : 1;
	const pillowW = Math.min(0.62, (inner / pillows) * 0.82);
	const pillowH = Math.min(0.12, h * 0.14);
	for (const px of split(inner, pillows)) {
		soft(g, pillow, pillowW, pillowH, 0.36, px, top + mattH, d / 2 - 0.07 - 0.25, 0.5);
	}
	return g;
};
