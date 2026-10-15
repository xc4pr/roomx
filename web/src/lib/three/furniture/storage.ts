import { Group } from 'three';
import type { Look } from '#lib/core/catalog.ts';
import { cabinet, type Fill } from './cabinet.ts';
import { bookRow } from './fill.ts';
import { box, mat, mix, seeded, shade, split, type Palette } from './kit.ts';

type Build = (w: number, d: number, h: number, p: Palette, look?: Look) => Group;

const wardrobe: Build = (w, d, h, p, look) => {
	const g = new Group();
	cabinet(g, p, {
		w,
		d,
		h,
		legH: 0,
		rows: [{ kind: 'door', weight: 1, cols: Math.max(1, Math.round(w / 0.5)) }],
		handle: 'bar',
		look
	});
	return g;
};

const dresser: Build = (w, d, h, p, look) => {
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
		handle: 'bar',
		look
	});
	return g;
};

const sideboard: Build = (w, d, h, p, look) => {
	const g = new Group();
	const cols = Math.max(2, Math.min(5, Math.round(w / 0.5)));
	const rows: { kind: 'drawer' | 'door'; weight: number; cols: number }[] = [
		{ kind: 'door', weight: 2.4, cols }
	];
	if (w > 1.2 && h > 0.5) rows.unshift({ kind: 'drawer', weight: 1, cols: Math.min(cols, 4) });
	cabinet(g, p, { w, d, h, legH: h > 0.5 ? 0.12 : 0, rows, handle: 'bar', look });
	return g;
};

const nightstand: Build = (w, d, h, p, look) => {
	const g = new Group();
	const drawers = h > 0.5 ? 2 : 1;
	cabinet(g, p, {
		w,
		d,
		h,
		legH: Math.min(0.12, h * 0.2),
		rows: Array.from({ length: drawers }, () => ({ kind: 'drawer' as const, weight: 1, cols: 1 })),
		handle: 'knob',
		look
	});
	return g;
};

const STRUCTURE = [
	'rows',
	'sections',
	'base',
	'baseHeight',
	'baseMaterial',
	'sides',
	'wheels',
	'top',
	'accentColor',
	'bodyColor'
] as const;

function structural(look: Look): boolean {
	return STRUCTURE.some((key) => look[key] !== undefined);
}

function openRows(count: number, cols = 1): Look['rows'] {
	return Array.from({ length: count }, () => ({ kind: 'open' as const, cols }));
}

function furnish(
	g: Group,
	p: Palette,
	o: { w: number; d: number; h: number; rows: Look['rows']; fill: Fill; look: Look }
): Group {
	cabinet(g, p, {
		w: o.w,
		d: o.d,
		h: o.h,
		legH: 0,
		rows: o.rows ?? [],
		handle: 'bar',
		fill: o.fill,
		look: o.look
	});
	return g;
}

function plainShelf(w: number, d: number, h: number, p: Palette, books?: boolean): Group {
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
		if (i < levels - 1 && (books ?? rng() > 0.35)) {
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
}

const shelf: Build = (w, d, h, p, look = {}) => {
	if (!structural(look)) return plainShelf(w, d, h, p, look.books);
	const levels = Math.max(2, Math.min(8, Math.round(h / 0.38) + 1));
	const rows = look.rows ?? openRows(levels - 1);
	return furnish(new Group(), p, { w, d, h, rows, fill: 'books', look });
};

function plainCube(w: number, d: number, h: number, p: Palette): Group {
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
}

const cubeShelf: Build = (w, d, h, p, look = {}) => {
	if (!structural(look)) return plainCube(w, d, h, p);
	const rows =
		look.rows ?? openRows(Math.max(1, Math.round(h / 0.34)), Math.max(1, Math.round(w / 0.34)));
	return furnish(new Group(), p, { w, d, h, rows, fill: 'bins', look });
};

function plainWall(w: number, d: number, h: number, p: Palette): Group {
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
}

const wallShelf: Build = (w, d, h, p, look = {}) => {
	if (!structural(look)) return plainWall(w, d, h, p);
	return furnish(new Group(), p, { w, d, h, rows: look.rows ?? openRows(1), fill: 'none', look });
};

export const storage = { wardrobe, dresser, sideboard, nightstand, shelf, cubeShelf, wallShelf };
