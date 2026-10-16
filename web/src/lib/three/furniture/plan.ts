import type { Group } from 'three';
import type { Look, LookRow } from '#lib/core/catalog.ts';
import { mat, metalMat, mix, seeded, type Palette } from './kit.ts';

export type Row = Required<LookRow>;
export type Handle = NonNullable<Look['handle']>;
export type Fill = 'none' | 'books' | 'bins';

export interface CabinetOptions {
	x?: number;
	w: number;
	d: number;
	h: number;
	legH: number;
	rows: LookRow[];
	handle: Handle;
	fill?: Fill;
	look?: Look;
}

export interface Section {
	rows: Row[];
	x: number;
	w: number;
}

export interface Band {
	row: Row;
	index: number;
	y: number;
	h: number;
}

export interface Plan {
	g: Group;
	p: Palette;
	w: number;
	d: number;
	h: number;
	look: Look;
	rows: Row[];
	sections: Section[];
	handle: Handle;
	fill: Fill;
	randomBooks: boolean;
	rng: () => number;
	tubes: boolean;
	raised: boolean;
	ladder: boolean;
	hollow: boolean;
	slide: boolean;
	wheelsH: number;
	baseH: number;
	lift: number;
	plinthH: number;
	slabT: number;
	ins: number;
	sideT: number;
	lip: number;
	cw: number;
	span: number;
	fz: number;
	boardZ: number;
	backZ: number;
	yB: number;
	yT: number;
	metal: string;
	body: ReturnType<typeof mat>;
	fronts: ReturnType<typeof mat>;
	handles: ReturnType<typeof mat>;
	dark: ReturnType<typeof mat>;
}

export const GAP = 0.004;
export const BOARD = 0.018;
export const FRONT_T = 0.018;
export const CHROME = '#c9ccd0';
export const TUBE_R = 0.01;
export const TUBE_T = 0.014;
const FRAME_IN = 0.019;
const WHEEL = 0.05;
const OVERHANG = 0.012;
const PATCH = 0.001;
const SLIDE_DEPTH = 0.026;
const BASE_HEIGHT = { plinth: 0.06, feet: 0.03, legs: 0.15 } as const;
const HANDLE_LIP: Record<Handle, number> = {
	none: 0,
	bar: 0.014,
	knob: 0.014,
	recessTop: PATCH,
	hole: PATCH
};

function baseHeight(o: CabinetOptions, look: Look, wheelsH: number): number {
	const base = look.base;
	if (base === undefined) return o.legH;
	if (base === 'none' || base === 'frame') return 0;
	const mm = look.baseHeight;
	return Math.min(mm === undefined ? BASE_HEIGHT[base] : mm / 1000, (o.h - wheelsH) * 0.4);
}

function protrusion(rows: Row[], handle: Handle): number {
	const hardware = rows.some((r) => r.kind !== 'open' && r.kind !== 'slide');
	const own = hardware ? HANDLE_LIP[handle] : 0;
	return handle !== 'none' && rows.some((r) => r.kind === 'slide') ? Math.max(own, PATCH) : own;
}

function slabThickness(o: CabinetOptions, look: Look, tubes: boolean): number {
	if (tubes) return 0;
	if (look.top === 'overhang') return Math.min(0.028, o.h * 0.1);
	return look.accentColor ? Math.min(0.02, o.h * 0.08) : 0;
}

export function makePlan(g: Group, p: Palette, o: CabinetOptions): Plan {
	const look = o.look ?? {};
	const parts = (look.sections ?? [{ rows: look.rows ?? o.rows }]).map((s) => ({
		weight: 'weight' in s ? (s.weight ?? 1) : 1,
		rows: s.rows.map((r) => ({ kind: r.kind, cols: r.cols, weight: r.weight ?? 1 }))
	}));
	const rows = parts.flatMap((s) => s.rows);
	const handle = look.handle ?? o.handle;
	const tubes = look.base === 'frame';
	const ladder = look.sides === 'ladder';
	const hollow = ladder || rows.some((r) => r.kind === 'open' || r.kind === 'glass');
	const slide = rows.some((r) => r.kind === 'slide');
	const wheelsH = look.wheels ? Math.min(WHEEL, o.h * 0.2) : 0;
	const baseH = baseHeight(o, look, wheelsH);
	const ins = tubes ? FRAME_IN : 0;
	const lift = wheelsH + baseH + ins;
	const ov = look.top === 'overhang' && !tubes ? OVERHANG : 0;
	const slabT = slabThickness(o, look, tubes);
	const sideT = tubes ? 0.012 : ladder ? 0.03 : BOARD;
	const lip = protrusion(rows, handle);
	const cw = o.w - 2 * ins - 2 * ov;
	const fz = -o.d / 2 + ins + ov + lip;
	const plinthH = look.base === undefined && lift === 0 && !hollow ? Math.min(0.06, o.h * 0.04) : 0;
	const metal = look.frameColor ?? (tubes ? CHROME : p.metal);
	const mode = look.books === false ? 'none' : look.books === true ? 'books' : (o.fill ?? 'none');
	return {
		g,
		p,
		w: o.w,
		d: o.d,
		h: o.h,
		look,
		rows,
		sections: layout(parts, hollow ? cw - 2 * sideT : cw),
		handle,
		fill: mode === 'none' && look.books === true ? 'books' : mode,
		randomBooks: look.books === undefined && o.fill === 'books',
		rng: seeded(Math.round(o.w * 1000 + o.h * 7)),
		tubes,
		raised: look.frontStyle === 'frame',
		ladder,
		hollow,
		slide,
		wheelsH,
		baseH,
		lift,
		plinthH,
		slabT,
		ins,
		sideT,
		lip,
		cw,
		span: hollow ? cw - 2 * sideT : cw,
		fz,
		boardZ: fz + (slide ? SLIDE_DEPTH : 0.004),
		backZ: o.d / 2 - ins,
		yB: lift + plinthH,
		yT: o.h - slabT - ins,
		metal,
		body: mat('wood', look.bodyColor ?? p.main),
		fronts: mat('wood', p.light),
		handles: metalMat(metal),
		dark: mat('matte', mix(p.light, '#1c1a18', 0.72))
	};
}

function layout(parts: { weight: number; rows: Row[] }[], span: number): Section[] {
	const total = parts.reduce((sum, s) => sum + s.weight, 0);
	let x = span / 2;
	return parts.map((s) => {
		const w = (span * s.weight) / total;
		x -= w;
		return { rows: s.rows, x: x + w / 2, w };
	});
}

export function bands(c: Plan, rows: Row[] = c.rows): Band[] {
	const total = rows.reduce((sum, row) => sum + row.weight, 0);
	const usable = c.yT - c.yB;
	let top = c.yT;
	return rows.map((row, index) => {
		const h = (usable * row.weight) / total;
		const y = top - h;
		top = y;
		return { row, index, y, h };
	});
}

export function compartments(row: Row, h: number): number {
	if (row.kind === 'open') return Math.max(1, Math.round(h / 0.34));
	if (row.kind === 'glass') return Math.max(1, Math.round(h / 0.4));
	return 1;
}
