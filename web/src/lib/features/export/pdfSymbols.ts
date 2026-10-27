import type { PDFPage } from 'pdf-lib';
import {
	add,
	rotate,
	roofWindowPlacement,
	walls,
	wallPoint,
	type Vec
} from '#lib/core/geometry.ts';
import { clearanceZone, kitchenModuleSpans, kitchenUpperSpans } from '#lib/core/elements.ts';
import {
	isFireElement,
	isFreeElement,
	isWallElement,
	type FreeElement,
	type KitchenRun,
	type RoomElement,
	type Room,
	type WallElement
} from '#lib/core/schema.ts';
import { elementKindNames } from '#lib/i18n/common.ts';
import { applyFit, hatchSegments, type Fit } from './layout.ts';
import { polygon, polyline, strokeLine, type PdfContext, type Point2 } from './pdfKit.ts';
import { symbolTranslator } from './pdfText.ts';

export const SYMBOL_KINDS = [
	'washbasin',
	'toilet',
	'shower',
	'bathtub',
	'kitchenRun',
	'acWall',
	'acFloor',
	'column',
	'freeObstacle',
	'fireplace',
	'stove',
	'tiledStove',
	'roofWindow'
] as const;
export type SymbolKind = (typeof SYMBOL_KINDS)[number];

export function isSymbolKind(kind: RoomElement['kind']): kind is SymbolKind {
	return (SYMBOL_KINDS as readonly string[]).includes(kind);
}

interface Prim {
	points: Vec[];
	closed: boolean;
	fill?: number;
	width?: number;
	dash?: number[];
}

type Mapper = (p: Vec) => Point2;

function rect(u0: number, v0: number, u1: number, v1: number): Vec[] {
	return [
		{ x: u0, y: v0 },
		{ x: u1, y: v0 },
		{ x: u1, y: v1 },
		{ x: u0, y: v1 }
	];
}

function ellipse(cu: number, cv: number, ru: number, rv: number, n = 18): Vec[] {
	return Array.from({ length: n }, (_, i) => {
		const angle = (2 * Math.PI * i) / n;
		return { x: cu + ru * Math.cos(angle), y: cv + rv * Math.sin(angle) };
	});
}

function line(a: Vec, b: Vec, width = 0.6, dash?: number[]): Prim {
	return { points: [a, b], closed: false, width, dash };
}

function diagonals(u0: number, v0: number, u1: number, v1: number): Prim[] {
	return [line({ x: u0, y: v0 }, { x: u1, y: v1 }), line({ x: u0, y: v1 }, { x: u1, y: v0 })];
}

function zigzag(w: number, d: number): Prim {
	const points = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((f, i) => ({
		x: w * f,
		y: d * (i % 2 === 0 ? 0.35 : 0.7)
	}));
	return { points, closed: false, width: 0.6 };
}

export interface KitchenSketch {
	width: number;
	depth: number;
	modules: { from: number; to: number; kind: string }[];
	upper?: { depth: number; spans: { from: number; to: number }[] };
}

export function kitchenSketch(run: KitchenRun): KitchenSketch {
	return {
		width: run.width,
		depth: run.depth,
		modules: kitchenModuleSpans(run).map((span) => ({
			from: span.from,
			to: span.to,
			kind: span.module.kind
		})),
		upper: run.upper ? { depth: run.upper.depth, spans: kitchenUpperSpans(run) } : undefined
	};
}

function kitchenPrims(sketch: KitchenSketch): Prim[] {
	const { width, depth } = sketch;
	const prims: Prim[] = [
		{ points: rect(0, 0, width, depth), closed: true, fill: 0.14, width: 0.9 }
	];
	for (const span of sketch.modules) {
		const mid = (span.from + span.to) / 2;
		const room = span.to - span.from;
		if (span.from > 0) prims.push(line({ x: span.from, y: 0 }, { x: span.from, y: depth }, 0.4));
		const inset = Math.min(room, depth) * 0.15;
		if (span.kind === 'sink') {
			prims.push({
				points: rect(span.from + inset, inset, span.to - inset, depth - inset),
				closed: true,
				width: 0.6
			});
			prims.push({ points: ellipse(mid, depth / 2, room * 0.06, depth * 0.06, 8), closed: true });
		} else if (span.kind === 'hob') {
			const r = Math.min(room, depth) * 0.14;
			const cu = [0.28, 0.72];
			const cv = [0.3, 0.7];
			for (const u of cu) {
				for (const v of cv) {
					prims.push({
						points: ellipse(span.from + room * u, depth * v, r, r, 10),
						closed: true,
						width: 0.6
					});
				}
			}
		} else if (span.kind === 'tall') {
			prims.push(...diagonals(span.from, 0, span.to, depth));
		} else if (span.kind === 'dishwasher') {
			prims.push(line({ x: span.from, y: depth * 0.5 }, { x: span.to, y: depth * 0.5 }, 0.5));
		} else if (span.kind === 'table') {
			prims.push({
				points: rect(span.from, 0, span.to, depth),
				closed: true,
				dash: [2, 1.6],
				width: 0.6
			});
		}
	}
	if (sketch.upper) {
		for (const span of sketch.upper.spans) {
			prims.push({
				points: rect(span.from, 0, span.to, sketch.upper.depth),
				closed: true,
				dash: [3, 2],
				width: 0.7
			});
		}
	}
	return prims;
}

export interface SymbolShape {
	w: number;
	d: number;
	step: number;
	round?: boolean;
	screen?: boolean;
	kitchen?: KitchenSketch;
}

function symbolPrims(kind: SymbolKind, shape: SymbolShape): Prim[] {
	const { w, d } = shape;
	const box: Prim = { points: rect(0, 0, w, d), closed: true, fill: 0.22, width: 0.9 };
	switch (kind) {
		case 'washbasin':
			return [
				box,
				{ points: ellipse(w / 2, d * 0.55, w * 0.38, d * 0.32), closed: true, width: 0.7 }
			];
		case 'toilet': {
			const tank = d * 0.28;
			return [
				{ points: rect(0, 0, w, tank), closed: true, fill: 0.22, width: 0.9 },
				{
					points: ellipse(w / 2, tank + (d - tank) / 2, w * 0.46, (d - tank) / 2),
					closed: true,
					fill: 0.12,
					width: 0.9
				}
			];
		}
		case 'shower': {
			const prims = [box, ...diagonals(0, 0, w, d)];
			if (shape.screen) prims.push(line({ x: 0, y: d }, { x: w, y: d }, 2.2));
			return prims;
		}
		case 'bathtub': {
			const inset = Math.min(w, d) * 0.12;
			return [
				box,
				{
					points: ellipse(w / 2, d / 2, w / 2 - inset, d / 2 - inset, 24),
					closed: true,
					width: 0.7
				},
				{
					points: ellipse(inset * 2.4, d / 2, inset * 0.5, inset * 0.5, 8),
					closed: true,
					width: 0.6
				}
			];
		}
		case 'kitchenRun':
			return kitchenPrims(shape.kitchen ?? { width: w, depth: d, modules: [] });
		case 'acWall':
		case 'acFloor':
			return [box, zigzag(w, d)];
		case 'column':
			return shape.round
				? [
						{
							points: ellipse(w / 2, d / 2, w / 2, d / 2, 20),
							closed: true,
							fill: 0.5,
							width: 0.9
						},
						...diagonals(w * 0.15, d * 0.15, w * 0.85, d * 0.85)
					]
				: [{ ...box, fill: 0.5 }, ...diagonals(0, 0, w, d)];
		case 'freeObstacle':
			return [
				box,
				...hatchSegments(w, d, shape.step).map(([a, b, c, e]) => ({
					points: [
						{ x: a, y: b },
						{ x: c, y: e }
					],
					closed: false,
					width: 0.4
				}))
			];
		case 'fireplace':
			return [
				box,
				{ points: rect(w * 0.18, d * 0.42, w * 0.82, d), closed: true, fill: 0.12, width: 0.7 },
				line({ x: w * 0.18, y: d }, { x: w * 0.82, y: d }, 2.2)
			];
		case 'stove': {
			const r = Math.min(w, d) * 0.3;
			return [
				box,
				{ points: ellipse(w / 2, d / 2, r, r, 14), closed: true, fill: 0.12, width: 0.8 },
				line({ x: w * 0.3, y: d }, { x: w * 0.7, y: d }, 2.2)
			];
		}
		case 'tiledStove':
			return [
				box,
				line({ x: w / 3, y: 0 }, { x: w / 3, y: d }, 0.4),
				line({ x: (2 * w) / 3, y: 0 }, { x: (2 * w) / 3, y: d }, 0.4),
				line({ x: 0, y: d / 2 }, { x: w, y: d / 2 }, 0.4),
				line({ x: w * 0.2, y: d }, { x: w * 0.8, y: d }, 2.2)
			];
		case 'roofWindow':
			return [
				{ points: rect(0, 0, w, d), closed: true, fill: 0.12, width: 0.9, dash: [3, 2] },
				...diagonals(0, 0, w, d)
			];
	}
}

function drawPrims(
	page: PDFPage,
	prims: readonly Prim[],
	map: Mapper,
	stroke: string,
	dashAll?: number[]
): void {
	for (const prim of prims) {
		const points = prim.points.map(map);
		const dash = dashAll ?? prim.dash;
		if (prim.closed) {
			polygon(page, points, {
				fill: prim.fill !== undefined ? stroke : undefined,
				fillOpacity: prim.fill,
				color: stroke,
				width: prim.width ?? 0.8,
				dash
			});
		} else {
			polyline(page, points, { width: prim.width ?? 0.6, color: stroke, dash });
		}
	}
}

export function symbolColor(ctx: PdfContext, element: RoomElement): string {
	if (element.status === 'suggested') return ctx.palette.suggested;
	if (isFireElement(element as FreeElement)) return ctx.palette.fire;
	if (element.kind === 'acWall' || element.kind === 'acFloor') return ctx.palette.air;
	if (element.kind === 'roofWindow') return ctx.palette.window;
	return ctx.palette.fixture;
}

function suggestedDash(element: RoomElement): number[] | undefined {
	return element.status === 'suggested' ? [2.5, 2] : undefined;
}

function drawZone(
	page: PDFPage,
	ctx: PdfContext,
	room: Room,
	element: RoomElement,
	fit: Fit
): void {
	const zone = clearanceZone(room, element);
	if (!zone || zone.shape.length < 3) return;
	const stroke = zone.kind === 'fire' ? ctx.palette.fire : ctx.palette.air;
	polygon(
		page,
		zone.shape.map((p) => applyFit(fit, p)),
		{ fill: stroke, fillOpacity: 0.08, color: stroke, width: 0.7, dash: [3, 2] }
	);
}

function drawWallSymbol(
	page: PDFPage,
	ctx: PdfContext,
	room: Room,
	element: WallElement,
	fit: Fit
): void {
	const target = walls(room.polygon).find((candidate) => candidate.number === element.wall);
	if (!target || !('depth' in element)) return;
	const depth = Math.max(element.depth, 3 / fit.scale);
	const map: Mapper = (p) => applyFit(fit, wallPoint(target, element.offset + p.x, p.y));
	const kind = element.kind as SymbolKind;
	const shape: SymbolShape = {
		w: element.width,
		d: depth,
		step: 5.5 / fit.scale,
		screen: element.kind === 'shower' ? element.screen === true : undefined,
		kitchen: element.kind === 'kitchenRun' ? kitchenSketch(element) : undefined
	};
	drawPrims(page, symbolPrims(kind, shape), map, symbolColor(ctx, element), suggestedDash(element));
}

function drawFreeSymbol(page: PDFPage, ctx: PdfContext, element: FreeElement, fit: Fit): void {
	const { width, depth } = element;
	const map: Mapper = (p) =>
		applyFit(
			fit,
			add(
				{ x: element.x, y: element.y },
				rotate({ x: p.x - width / 2, y: p.y - depth / 2 }, element.rotation)
			)
		);
	const shape: SymbolShape = {
		w: width,
		d: depth,
		step: 5.5 / fit.scale,
		round: element.kind === 'column' && element.shape === 'round'
	};
	drawPrims(
		page,
		symbolPrims(element.kind, shape),
		map,
		symbolColor(ctx, element),
		suggestedDash(element)
	);
}

function drawRoofWindow(
	page: PDFPage,
	ctx: PdfContext,
	room: Room,
	element: RoomElement,
	fit: Fit
): void {
	if (element.kind !== 'roofWindow') return;
	const placement = roofWindowPlacement(room, element);
	if (!placement || placement.corners.length < 4) return;
	const points = placement.corners.map((p) => applyFit(fit, p));
	const stroke = symbolColor(ctx, element);
	polygon(page, points, {
		fill: stroke,
		fillOpacity: 0.12,
		color: stroke,
		width: 0.9,
		dash: [3, 2]
	});
	strokeLine(page, points[0], points[2], { width: 0.6, color: stroke });
	strokeLine(page, points[1], points[3], { width: 0.6, color: stroke });
}

export function drawZones(
	page: PDFPage,
	ctx: PdfContext,
	room: Room,
	elements: readonly RoomElement[],
	fit: Fit
): void {
	for (const element of elements) drawZone(page, ctx, room, element, fit);
}

export function drawSymbols(
	page: PDFPage,
	ctx: PdfContext,
	room: Room,
	elements: readonly RoomElement[],
	fit: Fit
): void {
	for (const element of elements) {
		if (element.kind === 'roofWindow') drawRoofWindow(page, ctx, room, element, fit);
		else if (isFreeElement(element)) drawFreeSymbol(page, ctx, element, fit);
		else if (isWallElement(element) && isSymbolKind(element.kind)) {
			drawWallSymbol(page, ctx, room, element, fit);
		}
	}
}

interface SymbolEntry {
	label: string;
	draw: (page: PDFPage, x: number, y: number) => void;
}

const LEGEND_BOX = { w: 16, d: 8 };

function legendMapper(x: number, y: number, inset = 0): Mapper {
	return (p) => ({ x: x + inset + p.x, y: y - LEGEND_BOX.d / 2 + p.y });
}

export function symbolLegend(ctx: PdfContext, elements: readonly RoomElement[]): SymbolEntry[] {
	const kinds = new Set(elements.map((element) => element.kind));
	const tr = symbolTranslator(ctx.language);
	const names = elementKindNames[ctx.language];
	const entries: SymbolEntry[] = [];
	for (const kind of SYMBOL_KINDS) {
		if (!kinds.has(kind)) continue;
		const sample: RoomElement | undefined = elements.find((element) => element.kind === kind);
		const stroke = sample ? symbolColor(ctx, { ...sample, status: 'existing' } as RoomElement) : '';
		const box = kind === 'column' ? { w: 8, d: 8 } : LEGEND_BOX;
		const kitchen: KitchenSketch | undefined =
			kind === 'kitchenRun'
				? {
						width: 16,
						depth: 8,
						modules: [
							{ from: 0, to: 5.5, kind: 'sink' },
							{ from: 5.5, to: 10.5, kind: 'hob' },
							{ from: 10.5, to: 16, kind: 'tall' }
						]
					}
				: undefined;
		entries.push({
			label: names[kind],
			draw: (page, x, y) =>
				drawPrims(
					page,
					symbolPrims(kind, {
						w: box.w,
						d: box.d,
						step: 3.5,
						round: false,
						screen: kind === 'shower',
						kitchen
					}),
					legendMapper(x, y, kind === 'column' ? 4 : 0),
					stroke
				)
		});
	}
	const upperCabinets = elements.some((e) => e.kind === 'kitchenRun' && e.upper !== undefined);
	if (upperCabinets) {
		entries.push({
			label: tr('legendUpperCabinets'),
			draw: (page, x, y) =>
				polygon(page, rect(0, 0, 16, 5).map(legendMapper(x, y)), {
					color: ctx.palette.fixture,
					width: 0.7,
					dash: [3, 2]
				})
		});
	}
	const zoneKinds = new Set<'fire' | 'air'>();
	for (const element of elements) {
		if (isFreeElement(element) && 'clearance' in element && element.clearance > 0) {
			zoneKinds.add(isFireElement(element) ? 'fire' : 'air');
		} else if (element.kind === 'acWall' && element.clearance > 0) zoneKinds.add('air');
	}
	for (const zone of ['fire', 'air'] as const) {
		if (!zoneKinds.has(zone)) continue;
		const stroke = zone === 'fire' ? ctx.palette.fire : ctx.palette.air;
		entries.push({
			label: tr(zone === 'fire' ? 'legendFireZone' : 'legendAirZone'),
			draw: (page, x, y) =>
				polygon(page, rect(0, 0, 16, 8).map(legendMapper(x, y)), {
					fill: stroke,
					fillOpacity: 0.08,
					color: stroke,
					width: 0.7,
					dash: [3, 2]
				})
		});
	}
	return entries;
}

export function sizeLine(element: FreeElement, ctx: PdfContext): string {
	const tr = symbolTranslator(ctx.language);
	const parts = [
		`${elementKindNames[ctx.language][element.kind]}${element.status === 'existing' ? '' : ` (${ctx.tr(`status_${element.status}`)})`}`,
		tr('freePosition', { x: Math.round(element.x), y: Math.round(element.y) }),
		tr('freeSize', { w: element.width, d: element.depth, h: element.height })
	];
	if (element.kind === 'column') {
		parts.push(tr(element.shape === 'round' ? 'freeRound' : 'freeSquare'));
	}
	if (element.rotation) parts.push(tr('freeRotation', { r: Math.round(element.rotation) }));
	if (element.elevation > 0) parts.push(tr('freeElevation', { e: element.elevation }));
	if ((element.kind === 'column' || element.kind === 'freeObstacle') && element.toCeiling) {
		parts.push(tr('freeToCeiling'));
	}
	if ('clearance' in element) {
		parts.push(tr('elementClearance', { n: element.clearance }));
	}
	if (element.note) parts.push(element.note);
	return parts.join(' · ');
}

export function roomOnlyLines(ctx: PdfContext, elements: readonly RoomElement[]): string[] {
	const tr = symbolTranslator(ctx.language);
	const lines: string[] = [];
	for (const element of elements) {
		if (isFreeElement(element)) lines.push(sizeLine(element, ctx));
		else if (element.kind === 'roofWindow') {
			const name = elementKindNames[ctx.language].roofWindow;
			const status =
				element.status === 'existing' ? '' : ` (${ctx.tr(`status_${element.status}`)})`;
			lines.push(
				`${name}${status} · ${tr('roofWindowLine', {
					wall: element.wall,
					offset: Math.round(element.offset),
					w: element.width,
					l: element.length,
					e: element.elevation
				})}`
			);
		}
	}
	return lines;
}
