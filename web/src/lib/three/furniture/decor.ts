import { Group } from 'three';
import type { Look } from '#lib/core/catalog.ts';
import {
	accent,
	ball,
	box,
	cyl,
	disc,
	lathe,
	mat,
	mix,
	ring,
	seeded,
	shade,
	sheet,
	soft,
	type Palette
} from './kit.ts';
import { framedMirror, shaped } from './mirror.ts';

type Build = (w: number, d: number, h: number, p: Palette, look?: Look) => Group;

function leafTones(color: string): string[] {
	return [color, shade(color, 0.07), shade(color, -0.08)];
}

const plant: Build = (w, d, h, p) => {
	const g = new Group();
	const [a, b, c] = leafTones(p.main).map((tone) => mat('leaf', tone));
	const pot = mat('matte', '#d9d2c5');
	const soil = mat('matte', '#3b2f27');
	const tall = h > 1.1;
	const potH = Math.min(h * 0.28, 0.4);
	const potTop = Math.min(w, d) * (tall ? 0.5 : 0.78);
	const potBottom = potTop * 0.72;
	cyl(g, pot, potBottom, potH, potBottom * (d / w), 0, 0, 0, potTop / potBottom, 16).material = [
		pot,
		soil,
		pot
	];
	const span = h - potH;
	if (tall) cyl(g, mat('wood', '#6b5440'), 0.04, span * 0.6, 0.04, 0, potH, 0, 0.7, 8);
	const lumps: [number, number, number, number, number, number][] = [
		[0, 0, 0.36, 1, 0.36, 0],
		[0.14, -0.12, 0.58, 0.68, 0.3, 1],
		[-0.14, 0.12, 0.6, 0.62, 0.28, 2],
		[0.02, 0.02, 0.8, 0.5, 0.2, 0]
	];
	for (const [fx, fz, fy, fw, fh, tone] of lumps) {
		const material = [a, b, c][tone];
		ball(
			g,
			material,
			w * fw,
			span * fh * 2,
			d * fw,
			w * fx * 0.5,
			potH + span * fy - span * fh,
			d * fz * 0.5
		);
	}
	return g;
};

const hangingPlant: Build = (w, d, h, p) => {
	const g = new Group();
	const [a, b, c] = leafTones(p.main).map((tone) => mat('leaf', tone));
	const pot = mat('matte', '#d9d2c5');
	const soil = mat('matte', '#3b2f27');
	const cord = mat('matte', '#b9a98a');
	const potH = Math.min(h * 0.22, 0.16);
	const potTop = Math.min(w, d) * 0.62;
	const potBottom = potTop * 0.7;
	const potY = h * 0.34;
	cyl(g, pot, potBottom, potH, potBottom, 0, potY, 0, potTop / potBottom, 16).material = [
		pot,
		soil,
		pot
	];
	const rng = seeded(Math.round(h * 1000));
	const vines = 7;
	for (let i = 0; i < vines; i++) {
		const angle = (i / vines) * Math.PI * 2 + 0.4;
		const reach = i === 0 ? potY + 0.02 : (potY + 0.02) * (0.35 + rng() * 0.5);
		const rx = Math.cos(angle) * Math.min(w, d) * 0.3;
		const rz = Math.sin(angle) * Math.min(w, d) * 0.3;
		ball(g, [a, b, c][i % 3], 0.07, reach, 0.07, rx, potY + 0.02 - reach, rz);
	}
	const topLump = h * 0.2;
	ball(g, a, w, topLump * 1.1, d, 0, potY + potH - 0.02, 0);
	const cordFrom = potY + potH + topLump * 0.6;
	cyl(g, cord, 0.008, h - cordFrom, 0.008, 0, cordFrom, 0, 1, 8);
	ball(g, mat('metal', '#8a8d90'), 0.025, 0.025, 0.025, 0, h - 0.025, 0, false);
	return g;
};

const rug: Build = (w, d, h, p) => {
	const g = new Group();
	const border = mat('fabric', shade(p.main, -0.06));
	const field = mat('fabric', p.main);
	const band = mat('fabric', accent(p.main, 0.16));
	const inset = Math.min(0.08, w * 0.06);
	box(g, border, w, h * 0.7, d, 0, 0, 0);
	box(g, field, w - inset * 2, h * 0.9, d - inset * 2, 0, 0, 0);
	const b = inset * 1.8;
	const t = 0.012;
	box(g, band, w - b * 2, h, t, 0, 0, d / 2 - b);
	box(g, band, w - b * 2, h, t, 0, 0, -d / 2 + b);
	box(g, band, t, h, d - b * 2 + t, w / 2 - b, 0, 0);
	box(g, band, t, h, d - b * 2 + t, -w / 2 + b, 0, 0);
	return g;
};

const roundRug: Build = (w, d, h, p) => {
	const g = new Group();
	const inset = Math.min(0.08, w * 0.06);
	cyl(g, mat('fabric', shade(p.main, -0.06)), w, h * 0.7, d, 0, 0, 0, 1, 40);
	cyl(g, mat('fabric', p.main), w - inset * 2, h * 0.9, d - inset * 2, 0, 0, 0, 1, 40);
	cyl(g, mat('fabric', accent(p.main, 0.16)), w * 0.62, h * 0.95, d * 0.62, 0, 0, 0, 1, 40);
	cyl(g, mat('fabric', p.main), w * 0.62 - 0.03, h, d * 0.62 - 0.03, 0, 0, 0, 1, 40);
	return g;
};

const ART = ['#d9b98a', '#b9694a', '#4f7f9a', '#6b8f5e', '#e8dfcf', '#8a5a7a'];

const picture: Build = (w, d, h, p) => {
	const g = new Group();
	const frame = mat('wood', p.main);
	const paper = mat('matte', '#f4f1ea');
	const fw = Math.min(0.035, w * 0.09);
	const rng = seeded(Math.round(w * 977 + h * 131));
	const pick = () => mat('matte', ART[Math.floor(rng() * ART.length)]);
	const backT = Math.min(0.01, d * 0.4);
	const zp = -d / 2 + d * 0.35;
	box(g, mat('matte', '#6b5f55'), w, h, backT, 0, 0, d / 2 - backT / 2);
	box(g, frame, w, fw, d, 0, h - fw, 0);
	box(g, frame, w, fw, d, 0, 0, 0);
	box(g, frame, fw, h - fw * 2, d, -w / 2 + fw / 2, fw, 0);
	box(g, frame, fw, h - fw * 2, d, w / 2 - fw / 2, fw, 0);
	const matW = Math.min(0.07, w * 0.14);
	const iw = w - fw * 2;
	const ih = h - fw * 2;
	const paperDepth = d / 2 - backT - zp;
	box(g, paper, iw, ih, paperDepth, 0, fw, zp + paperDepth / 2);
	const ax = iw - matW * 2;
	const ay = ih - matW * 2;
	const y0 = fw + matW;
	const layer = (n: number) => zp - 0.001 - 0.002 * n;
	box(g, pick(), ax, ay, 0.002, 0, y0, layer(0));
	box(g, pick(), ax, ay * 0.4, 0.002, 0, y0, layer(1));
	box(g, pick(), ax * (0.5 + rng() * 0.2), ay * 0.28, 0.002, -ax * 0.15, y0, layer(2));
	ball(g, pick(), ax * 0.28, ax * 0.28, 0.002, ax * 0.18, y0 + ay * 0.5, layer(2), false);
	return g;
};

const mirror: Build = (w, d, h, p, look) => {
	if (look && shaped(look)) return framedMirror(w, d, h, p, look);
	const g = new Group();
	const frame = mat('wood', p.main);
	const glass = mat('metal', '#cfdde6');
	const standing = d > 0.12;
	const round = !standing && Math.abs(w - h) < 0.02;
	const fw = Math.min(0.03, w * 0.07);
	const depth = standing ? 0.035 : d;
	const panel = new Group();
	if (round) {
		ring(panel, frame, w, h, depth, 0, 0, 0, 0.05);
		disc(panel, glass, w - fw * 1.6, h - fw * 1.6, depth * 0.3, 0, h / 2, depth * 0.35);
		g.add(panel);
		return g;
	}
	const ph = standing ? Math.max(h - 0.03, 0.01) : h;
	box(panel, frame, w, fw, depth, 0, ph - fw, 0);
	box(panel, frame, w, fw, depth, 0, 0, 0);
	box(panel, frame, fw, ph - fw * 2, depth, -w / 2 + fw / 2, fw, 0);
	box(panel, frame, fw, ph - fw * 2, depth, w / 2 - fw / 2, fw, 0);
	box(panel, glass, w - fw * 2, ph - fw * 2, depth * 0.3, 0, fw, depth * 0.3);
	if (standing) {
		panel.rotation.x = Math.asin(Math.max(0, Math.min(0.9, (d - 0.12) / ph)));
		panel.position.set(0, 0.03, -d / 2 + 0.06 + depth / 2);
		g.add(panel);
		for (const sx of [-1, 1]) box(g, frame, 0.04, 0.03, d * 0.7, sx * (w / 2 - 0.05), 0, -d * 0.15);
	} else {
		g.add(panel);
	}
	return g;
};

const curtain: Build = (w, d, h, p) => {
	const g = new Group();
	const cloth = mat('cloth', p.main);
	const rodMaterial = mat('metal', '#8a8d90');
	const rodD = Math.min(0.025, d * 0.4);
	const waves = Math.max(2, Math.round(w / 0.28));
	const rodY = h - rodD;
	sheet(g, cloth, waves, w - 0.06, h - rodD * 0.5, d, 0, 0, 0);
	const rod = cyl(g, rodMaterial, rodD, w - rodD * 2, rodD, 0, 0, 0, 1, 8);
	rod.rotation.z = Math.PI / 2;
	rod.position.y = rodY + rodD / 2;
	for (const sx of [-1, 1]) {
		ball(
			g,
			rodMaterial,
			rodD * 1.6,
			rodD * 1.6,
			rodD * 1.6,
			sx * (w / 2 - rodD * 0.8),
			rodY - rodD * 0.1,
			0,
			false
		);
	}
	return g;
};

const cushion: Build = (w, d, h, p) => {
	const g = new Group();
	soft(g, mat('fabric', p.main), w, h, d, 0, 0, 0, 0.9);
	ball(g, mat('fabric', accent(p.main, 0.2)), 0.03, 0.03, 0.03, 0, h * 0.5 - 0.015, 0, false);
	return g;
};

const throwBlanket: Build = (w, d, h, p) => {
	const g = new Group();
	const main = mat('fabric', p.main);
	const stripe = mat('fabric', accent(p.main, 0.2));
	soft(g, main, w, h * 0.7, d, 0, 0, 0, 0.5);
	soft(g, main, w * 0.96, h * 0.7, d * 0.7, 0, h * 0.3, d * 0.1, 0.5);
	for (const z of [0.06, 0.1]) box(g, stripe, w * 0.94, h * 0.72, 0.02, 0, 0, -d / 2 + z);
	return g;
};

const VASE_PROFILE: readonly (readonly [number, number])[] = [
	[0.34, 0],
	[0.8, 0.12],
	[1, 0.38],
	[0.8, 0.64],
	[0.4, 0.84],
	[0.36, 0.94],
	[0.5, 1]
];

const vase: Build = (w, d, h, p) => {
	const g = new Group();
	const body = mat('ceramic', p.main);
	const flowers = h > 0.25;
	const bodyH = flowers ? h * 0.55 : h;
	lathe(g, body, 'vase', VASE_PROFILE, w, bodyH, d, 0, 0, 0);
	if (flowers) {
		const stem = mat('leaf', '#5f8a4f');
		const blooms = ['#e7c26a', '#c76a5c', '#e8dfcf'];
		const rng = seeded(Math.round(h * 997));
		const mouth = bodyH * 0.96;
		const reach = Math.asin(Math.min(1, (w * 0.4) / Math.max(0.01, h - mouth))) / 1.5;
		for (let i = 0; i < 4; i++) {
			const tilt = (i - 1.5) * Math.min(0.28, reach);
			const bloom = 0.05 + rng() * 0.03;
			const length =
				((h - mouth - bloom * 0.7) / Math.cos(tilt)) * (i === 1 ? 1 : 0.72 + rng() * 0.2);
			const mesh = cyl(g, stem, 0.012, length, 0.012, 0, 0, 0, 1, 8);
			mesh.rotation.z = -tilt;
			mesh.position.set(Math.sin(tilt) * length * 0.5, mouth + Math.cos(tilt) * length * 0.5, 0);
			ball(
				g,
				mat('leaf', blooms[i % 3]),
				bloom,
				bloom,
				bloom,
				Math.sin(tilt) * length,
				mouth + Math.cos(tilt) * length - bloom * 0.3,
				0
			);
		}
	}
	return g;
};

const basket: Build = (w, d, h, p) => {
	const g = new Group();
	const inside = mat('matte', shade(p.main, -0.35));
	const steps = 3;
	for (let i = 0; i < steps; i++) {
		const from = 0.72 + (0.28 * i) / steps;
		const to = 0.72 + (0.28 * (i + 1)) / steps;
		const material = mat('wood', i % 2 === 0 ? p.main : shade(p.main, -0.07));
		const mesh = cyl(
			g,
			material,
			w * from,
			h / steps,
			d * from,
			0,
			(h * i) / steps,
			0,
			to / from,
			16
		);
		if (i === steps - 1) mesh.material = [material, inside, material];
	}
	return g;
};

const BOOK_COLORS = ['#b9694a', '#4f7f9a', '#d8c9a8', '#6b8f5e', '#8a5a7a', '#c9a64a'];

const books: Build = (w, d, h, p) => {
	const g = new Group();
	const rng = seeded(Math.round(w * 1000 + h * 31));
	const count = Math.max(3, Math.min(14, Math.round(w / 0.032)));
	const widths = Array.from({ length: count }, () => 0.7 + rng() * 0.6);
	const sum = widths.reduce((a, b) => a + b, 0);
	const label = mat('matte', '#f2ecdf');
	const lip = 0.004;
	let x = -w / 2;
	widths.forEach((raw, index) => {
		const width = (raw / sum) * w;
		const first = index === 0;
		const height = first ? h : h * (0.72 + rng() * 0.28);
		const depth = first ? d : d * (0.85 + rng() * 0.15);
		const color = mix(BOOK_COLORS[(index * 5 + 1) % BOOK_COLORS.length], p.main, 0.25);
		const cx = x + width / 2;
		box(
			g,
			mat('matte', color),
			width - 0.002,
			height,
			depth - lip,
			cx,
			0,
			-d / 2 + lip + (depth - lip) / 2
		);
		for (const at of [0.2, 0.74]) {
			box(
				g,
				label,
				width - 0.002,
				Math.min(0.012, height * 0.08),
				lip,
				cx,
				height * at,
				-d / 2 + lip / 2
			);
		}
		x += width;
	});
	return g;
};

function hands(g: Group, cx: number, cy: number, z: number, size: number): void {
	const hand = mat('matte', '#1d1d1f');
	const specs: [number, number, number][] = [
		[size * 0.36, -0.5, 0.008],
		[size * 0.24, -3.4, 0.012]
	];
	specs.forEach(([length, angle, width], index) => {
		const mesh = box(g, hand, width, length, 0.003, 0, 0, z - 0.0015 - index * 0.003);
		mesh.rotation.z = angle;
		mesh.position.set(
			cx - Math.sin(angle) * length * 0.5,
			cy + Math.cos(angle) * length * 0.5,
			mesh.position.z
		);
	});
}

const clock: Build = (w, d, h, p) => {
	const g = new Group();
	const frame = mat('wood', p.main);
	const face = mat('matte', '#f4f1ea');
	const gold = mat('metal', '#c9a64a');
	if (d > 0.12 || h > w * 1.6) {
		const plinth = h * 0.12;
		const hoodH = h * 0.2;
		const trunkH = h - plinth - hoodH;
		box(g, frame, w, plinth, d, 0, 0, 0);
		box(g, frame, w * 0.82, trunkH, d * 0.82, 0, plinth, 0);
		box(g, frame, w, hoodH, d, 0, h - hoodH, 0);
		box(
			g,
			mat('glass', '#9fb4c0'),
			w * 0.5,
			trunkH * 0.6,
			0.006,
			0,
			plinth + trunkH * 0.25,
			-d * 0.41 - 0.003
		);
		disc(g, gold, 0.08, 0.08, 0.01, 0, plinth + trunkH * 0.4, -d * 0.4 + 0.02, 1, 14);
		const faceD = Math.min(w * 0.64, hoodH * 0.85);
		const cy = h - hoodH / 2;
		disc(g, face, faceD, faceD, 0.01, 0, cy, -d / 2 + 0.012, 1, 24);
		ring(g, gold, faceD * 1.14, faceD * 1.14, 0.012, 0, cy - faceD * 0.57, -d / 2 + 0.006, 0.05);
		hands(g, 0, cy, -d / 2 + 0.007, faceD);
		return g;
	}
	ring(g, frame, w, h, d, 0, 0, 0, 0.07);
	const size = Math.min(w, h);
	disc(g, face, size * 0.9, size * 0.9, 0.01, 0, h / 2, d / 2 - 0.005, 1, 28);
	const front = d / 2 - 0.01;
	hands(g, 0, h / 2, front, size);
	for (let i = 0; i < 4; i++) {
		const angle = (i * Math.PI) / 2;
		const r = size * 0.38;
		const tick = box(
			g,
			mat('matte', '#1d1d1f'),
			i % 2 ? 0.014 : 0.006,
			i % 2 ? 0.006 : 0.014,
			0.003,
			0,
			0,
			front - 0.002
		);
		tick.position.set(-Math.sin(angle) * r, h / 2 + Math.cos(angle) * r, front - 0.0025);
	}
	return g;
};

export const decor = {
	plant,
	hangingPlant,
	rug,
	roundRug,
	picture,
	mirror,
	curtain,
	cushion,
	throw: throwBlanket,
	vase,
	basket,
	books,
	clock
};
