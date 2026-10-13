import { Group } from 'three';
import { box, cyl, mat, mix, seeded, shade, split, type Palette } from './kit.ts';

type Build = (w: number, d: number, h: number, p: Palette) => Group;

export interface FrontRow {
	kind: 'drawer' | 'door';
	weight: number;
	cols: number;
}

export interface CabinetOptions {
	x?: number;
	w: number;
	d: number;
	h: number;
	legH: number;
	rows: FrontRow[];
	handle: 'bar' | 'knob';
}

const GAP = 0.004;
const LIP = 0.014;

export function cabinet(g: Group, p: Palette, o: CabinetOptions): void {
	const body = mat('wood', p.main);
	const seam = mat('matte', shade(p.main, -0.3));
	const fronts = mat('wood', p.light);
	const handles = mat('metal', p.metal);
	const x = o.x ?? 0;
	const front = -o.d / 2 + LIP;
	const bodyH = o.h - o.legH;
	const backZ = o.d / 2;
	const carcassFront = front + 0.012;

	box(g, body, o.w, bodyH, backZ - carcassFront, x, o.legH, (backZ + carcassFront) / 2);
	if (o.legH > 0) {
		const legs = mat('wood', p.darkWood);
		for (const sx of [-1, 1]) {
			for (const sz of [-1, 1]) {
				box(g, legs, 0.04, o.legH, 0.04, x + sx * (o.w / 2 - 0.05), 0, sz * (o.d / 2 - 0.05));
			}
		}
	}
	const plinth = o.legH > 0 ? 0 : Math.min(0.06, o.h * 0.04);
	const usable = bodyH - plinth;
	const total = o.rows.reduce((sum, row) => sum + row.weight, 0);
	box(g, seam, o.w - 0.006, usable - 0.006, 0.01, x, o.legH + plinth + 0.003, front + 0.009);
	if (plinth > 0) box(g, mat('matte', p.darkWood), o.w - 0.04, plinth, o.d - 0.06, x, 0, 0);

	let top = o.legH + bodyH;
	for (const row of o.rows) {
		const rowH = (usable * row.weight) / total;
		const y = top - rowH;
		const colW = o.w / row.cols;
		for (let c = 0; c < row.cols; c++) {
			const cx = x - o.w / 2 + colW * (c + 0.5);
			box(g, fronts, colW - GAP, rowH - GAP, 0.018, cx, y + GAP / 2, front + 0.009);
			let hx = cx;
			let hy = y + rowH * 0.62;
			let barW = Math.min(0.14, colW * 0.4);
			let barH = 0.012;
			if (row.kind === 'door') {
				const side = c + 0.5 < row.cols / 2 ? 1 : -1;
				hx = cx + side * (colW / 2 - 0.035);
				barW = 0.012;
				barH = Math.min(0.14, rowH * 0.3);
				hy = y + rowH * 0.5;
			}
			if (o.handle === 'knob') {
				cyl(g, handles, 0.03, LIP, 0.03, hx, hy - LIP / 2, front - LIP / 2, 1, 12).rotation.x =
					Math.PI / 2;
			} else {
				box(g, handles, barW, barH, LIP, hx, hy - barH / 2, front - LIP / 2);
			}
		}
		top = y;
	}
}

const wardrobe: Build = (w, d, h, p) => {
	const g = new Group();
	cabinet(g, p, {
		w,
		d,
		h,
		legH: 0,
		rows: [{ kind: 'door', weight: 1, cols: Math.max(1, Math.round(w / 0.5)) }],
		handle: 'bar'
	});
	return g;
};

const dresser: Build = (w, d, h, p) => {
	const g = new Group();
	const rows = Math.max(2, Math.min(6, Math.round(h / 0.24)));
	cabinet(g, p, {
		w,
		d,
		h,
		legH: h > 0.5 ? Math.min(0.1, h * 0.09) : 0,
		rows: Array.from({ length: rows }, () => ({
			kind: 'drawer' as const,
			weight: 1,
			cols: w > 1.2 ? 2 : 1
		})),
		handle: 'bar'
	});
	return g;
};

const sideboard: Build = (w, d, h, p) => {
	const g = new Group();
	const cols = Math.max(2, Math.min(5, Math.round(w / 0.5)));
	const rows: FrontRow[] = [{ kind: 'door', weight: 2.4, cols }];
	if (w > 1.2 && h > 0.5) rows.unshift({ kind: 'drawer', weight: 1, cols: Math.min(cols, 4) });
	cabinet(g, p, { w, d, h, legH: h > 0.5 ? 0.12 : 0, rows, handle: 'bar' });
	return g;
};

const nightstand: Build = (w, d, h, p) => {
	const g = new Group();
	const drawers = h > 0.5 ? 2 : 1;
	cabinet(g, p, {
		w,
		d,
		h,
		legH: Math.min(0.12, h * 0.2),
		rows: Array.from({ length: drawers }, () => ({ kind: 'drawer' as const, weight: 1, cols: 1 })),
		handle: 'knob'
	});
	return g;
};

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

const shelf: Build = (w, d, h, p) => {
	const g = new Group();
	const wood = mat('wood', p.main);
	const back = mat('matte', shade(p.main, -0.1));
	const t = Math.min(0.025, w * 0.05);
	const levels = Math.max(2, Math.min(8, Math.round(h / 0.38) + 1));
	const plinth = Math.min(0.04, h * 0.03);
	const rng = seeded(Math.round(w * 1000 + h * 7));
	for (const sx of [-1, 1]) box(g, wood, t, h, d, sx * (w / 2 - t / 2), 0, 0);
	box(g, back, w - t * 2, h - plinth, 0.008, 0, plinth, d / 2 - 0.004);
	const span = h - t - plinth;
	for (let i = 0; i < levels; i++) {
		const y = plinth + (span * i) / (levels - 1);
		box(g, wood, w - t * 2, t, d - 0.008, 0, y, -0.004);
		if (i < levels - 1 && rng() > 0.35) {
			const gap = span / (levels - 1) - t;
			const x0 = -w / 2 + t + 0.02 + rng() * 0.1;
			bookRow(
				g,
				rng,
				x0,
				w / 2 - t - 0.02 - rng() * 0.15,
				y + t,
				0.02,
				d * 0.7,
				Math.min(gap * 0.8, 0.3),
				p.main
			);
		}
	}
	return g;
};

const cubeShelf: Build = (w, d, h, p) => {
	const g = new Group();
	const wood = mat('wood', p.main);
	const back = mat('matte', shade(p.main, -0.1));
	const t = Math.min(0.018, w * 0.04);
	const nx = Math.max(1, Math.round(w / 0.34));
	const ny = Math.max(1, Math.round(h / 0.34));
	const stepX = (w - t) / nx;
	const stepY = (h - t) / ny;
	box(g, back, w - t, h - t, 0.006, 0, t / 2, d / 2 - 0.003);
	for (let i = 0; i <= nx; i++) box(g, wood, t, h, d, -w / 2 + t / 2 + i * stepX, 0, 0);
	for (let j = 0; j <= ny; j++) box(g, wood, w, t, d, 0, j * stepY, 0);
	const bin = mat('fabric', mix(p.main, '#c8a572', 0.5));
	const binDark = mat('fabric', shade(mix(p.main, '#4f7f9a', 0.55), -0.05));
	for (let i = 0; i < nx; i++) {
		for (let j = 0; j < ny; j++) {
			const pick = (i * 3 + j * 2) % 7;
			if (pick !== 0 && pick !== 4) continue;
			box(
				g,
				pick === 0 ? bin : binDark,
				stepX - t - 0.03,
				stepY - t - 0.05,
				d - 0.06,
				-w / 2 + t / 2 + (i + 0.5) * stepX + t / 2,
				j * stepY + t,
				-0.01
			);
		}
	}
	return g;
};

const wallShelf: Build = (w, d, h, p) => {
	const g = new Group();
	const wood = mat('wood', p.main);
	const board = h <= 0.06 ? h : 0.03;
	box(g, wood, w, board, d, 0, h - board, 0);
	if (h > 0.06) {
		const metal = mat('metal', p.metal);
		for (const x of split(w * 0.7, 2)) {
			box(g, metal, 0.02, h - board, 0.02, x, 0, d / 2 - 0.02);
			box(g, metal, 0.02, 0.02, d * 0.8, x, h - board - 0.02, d * 0.1);
		}
	}
	return g;
};

export const storage = { wardrobe, dresser, sideboard, nightstand, shelf, cubeShelf, wallShelf };
