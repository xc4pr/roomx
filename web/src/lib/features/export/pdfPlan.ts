import type { PDFPage } from 'pdf-lib';
import {
	add,
	cornerLabel,
	doorSwing,
	frontDirection,
	itemFootprint,
	rotate,
	scale as scaleVec,
	wallElementFootprint,
	wallElements,
	walls,
	wallPoint,
	freeWallSpans,
	type Vec,
	type Wall
} from '#lib/core/geometry.ts';
import {
	isWallElement,
	type Item,
	type Room,
	type RoomElement,
	type WallElement
} from '#lib/core/schema.ts';
import { elementKindNames } from '#lib/i18n/common.ts';
import {
	applyFit,
	boundsOf,
	fitBounds,
	hatchSegments,
	paperScale,
	type Box,
	type Fit
} from './layout.ts';
import {
	badge,
	circle,
	drawText,
	polygon,
	polyline,
	strokeLine,
	textWidth,
	wrapText,
	type PdfContext,
	type Point2
} from './pdfKit.ts';
import {
	drawPlanSlopes,
	drawProfileLabels,
	drawSlopeLabels,
	profileIsSloped,
	wallProfilePoints,
	type WallFrame
} from './pdfSlopes.ts';

const DIMENSION_OFFSET = 24;
const PLAN_PADDING = 46;

export interface PlanOptions {
	box: Box;
	align?: 'center' | 'top';
	items?: readonly Item[];
	extraElements?: readonly RoomElement[];
}

export interface PlanResult {
	fit: Fit;
	paperScale: number;
}

function toPage(fit: Fit, p: Vec): Point2 {
	return applyFit(fit, p);
}

function elementColor(ctx: PdfContext, element: RoomElement): string {
	if (element.status === 'suggested') return ctx.palette.suggested;
	switch (element.kind) {
		case 'window':
			return ctx.palette.window;
		case 'door':
			return ctx.palette.door;
		case 'builtin':
		case 'obstacle':
		case 'radiator':
			return ctx.palette.fixture;
		default:
			return ctx.palette.electric;
	}
}

function dashFor(element: RoomElement): number[] | undefined {
	return element.status === 'suggested' ? [2.5, 2] : undefined;
}

function drawFixture(
	page: PDFPage,
	ctx: PdfContext,
	room: Room,
	element: WallElement & { depth: number },
	fit: Fit
): void {
	const depth = Math.max(element.depth, 3 / fit.scale);
	const zone = wallElementFootprint(room.polygon, element, depth);
	if (zone.length < 4) return;
	const stroke = elementColor(ctx, element);
	polygon(
		page,
		zone.map((p) => toPage(fit, p)),
		{
			fill: stroke,
			fillOpacity: 0.22,
			color: stroke,
			width: 0.8,
			dash: dashFor(element)
		}
	);
	const target = walls(room.polygon).find((candidate) => candidate.number === element.wall);
	if (!target) return;
	for (const [u0, v0, u1, v1] of hatchSegments(element.width, depth, 5.5 / fit.scale)) {
		strokeLine(
			page,
			toPage(fit, wallPoint(target, element.offset + u0, v0)),
			toPage(fit, wallPoint(target, element.offset + u1, v1)),
			{ width: 0.4, color: stroke, opacity: 0.8 }
		);
	}
}

function drawOpening(
	page: PDFPage,
	ctx: PdfContext,
	room: Room,
	element: WallElement,
	target: Wall,
	fit: Fit
): void {
	const shared = ctx.links?.shared.has(element.id) ?? false;
	const stroke = elementColor(ctx, element);
	const start = toPage(fit, wallPoint(target, element.offset));
	const end = toPage(fit, wallPoint(target, element.offset + element.width));
	const inward = scaleVec(target.inward, 1);
	strokeLine(page, start, end, { width: 5, color: '#ffffff' });
	strokeLine(page, start, end, { width: 3.4, color: stroke, dash: dashFor(element) });
	if (element.kind === 'window') {
		const inner = (p: Point2): Point2 => ({
			x: p.x + inward.x * 3.2,
			y: p.y + inward.y * 3.2
		});
		strokeLine(page, inner(start), inner(end), { width: 0.8, color: stroke });
		return;
	}
	if (!isWallElement(element)) return;
	if (element.kind !== 'door') return;
	if (element.swing === 'sliding') {
		const inner = (p: Point2): Point2 => ({ x: p.x + inward.x * 3.2, y: p.y + inward.y * 3.2 });
		strokeLine(page, inner(start), inner(end), { width: 0.8, color: stroke, dash: [3, 2] });
		return;
	}
	if (shared && element.swing === 'out') return;
	const swing = doorSwing(room.polygon, element, 12);
	if (!swing) return;
	const arc = swing.polygon.map((p) => toPage(fit, p));
	strokeLine(page, arc[0], arc[arc.length - 1], { width: 1.1, color: stroke });
	polyline(page, arc.slice(1), { width: 0.6, color: stroke, dash: [2, 1.6] });
}

function drawElectrical(
	page: PDFPage,
	ctx: PdfContext,
	room: Room,
	element: RoomElement,
	fit: Fit
): void {
	const stroke = elementColor(ctx, element);
	const dash = dashFor(element);
	const filled = element.status !== 'suggested';
	const radius = 4.2;
	if (element.kind === 'ceilingLamp') {
		const center = toPage(fit, element);
		circle(page, center, 7, { color: stroke, width: 0.9, dash: [2.5, 2] });
		circle(page, center, 2.6, { fill: stroke, color: stroke, width: 0.6 });
		return;
	}
	if (!isWallElement(element)) return;
	const target = walls(room.polygon).find((candidate) => candidate.number === element.wall);
	if (!target) return;
	const along = element.offset + element.width / 2;
	const wallPos = toPage(fit, wallPoint(target, along));
	const center = {
		x: wallPos.x + target.inward.x * (radius + 1.6),
		y: wallPos.y + target.inward.y * (radius + 1.6)
	};
	const fill = filled ? stroke : '#ffffff';
	switch (element.kind) {
		case 'socket': {
			circle(page, center, radius, { fill, fillOpacity: filled ? 0.9 : 1, color: stroke, dash });
			if (element.gang > 1) {
				drawText(page, ctx, String(element.gang), center.x, center.y - 2, {
					size: 5.5,
					bold: true,
					align: 'center',
					color: filled ? '#ffffff' : stroke
				});
			}
			break;
		}
		case 'switch':
			polygon(
				page,
				[
					{ x: center.x - radius * 0.85, y: center.y - radius * 0.85 },
					{ x: center.x + radius * 0.85, y: center.y - radius * 0.85 },
					{ x: center.x + radius * 0.85, y: center.y + radius * 0.85 },
					{ x: center.x - radius * 0.85, y: center.y + radius * 0.85 }
				],
				{ fill, color: stroke, dash }
			);
			break;
		case 'wallLamp':
			circle(page, center, radius, { fill: '#ffffff', color: stroke, width: 1, dash });
			strokeLine(
				page,
				{ x: center.x - radius * 0.7, y: center.y - radius * 0.7 },
				{ x: center.x + radius * 0.7, y: center.y + radius * 0.7 },
				{ width: 0.9, color: stroke }
			);
			strokeLine(
				page,
				{ x: center.x - radius * 0.7, y: center.y + radius * 0.7 },
				{ x: center.x + radius * 0.7, y: center.y - radius * 0.7 },
				{ width: 0.9, color: stroke }
			);
			break;
		case 'dataPort':
			polygon(
				page,
				[
					{ x: center.x - radius, y: center.y - radius * 0.8 },
					{ x: center.x + radius, y: center.y - radius * 0.8 },
					{ x: center.x, y: center.y + radius },
					{ x: center.x - radius, y: center.y - radius * 0.8 }
				],
				{ fill, color: stroke, dash }
			);
			break;
		default:
			break;
	}
}

function drawItem(page: PDFPage, ctx: PdfContext, item: Item, number: number, fit: Fit): void {
	const shape = itemFootprint(item);
	const pts = shape.map((p) => toPage(fit, p));
	const wallMounted = item.mount === 'wall' || item.mount === 'ceiling';
	polygon(page, pts, {
		fill: ctx.palette.item,
		fillOpacity: item.category === 'rug' ? 0.45 : 0.85,
		color: ctx.palette.muted,
		width: 0.8,
		dash: wallMounted ? [3, 2] : undefined
	});
	const center = toPage(fit, item);
	const front = frontDirection(item.rotation);
	const side = rotate(front, -90);
	const tip = add(item, scaleVec(front, item.dims.d / 2));
	const arm = Math.min(item.dims.d / 2, 7 / fit.scale);
	const left = add(tip, add(scaleVec(front, -arm), scaleVec(side, arm * 0.7)));
	const right = add(tip, add(scaleVec(front, -arm), scaleVec(side, -arm * 0.7)));
	polyline(page, [toPage(fit, left), toPage(fit, tip), toPage(fit, right)], {
		width: 0.7,
		color: ctx.palette.muted
	});
	const small = Math.min(item.dims.w, item.dims.d) * fit.scale < 11;
	if (small) {
		drawText(page, ctx, String(number), center.x, center.y - 1.5, {
			size: 5.5,
			bold: true,
			align: 'center'
		});
	} else {
		drawText(page, ctx, String(number), center.x, center.y - 2.7, {
			size: 8,
			bold: true,
			align: 'center'
		});
	}
}

function outwardBisector(room: Room, index: number): Vec {
	const all = walls(room.polygon);
	const before = all[(index - 1 + all.length) % all.length];
	const after = all[index];
	const sum = add(before.inward, after.inward);
	const length = Math.hypot(sum.x, sum.y);
	if (length < 1e-6) return scaleVec(after.inward, -1);
	return { x: -sum.x / length, y: -sum.y / length };
}

function drawDimension(
	page: PDFPage,
	ctx: PdfContext,
	target: Wall,
	fit: Fit,
	label: string
): void {
	const out = scaleVec(target.inward, -1);
	const a = toPage(fit, target.start);
	const b = toPage(fit, target.end);
	const shift = (p: Point2, d: number): Point2 => ({ x: p.x + out.x * d, y: p.y + out.y * d });
	const a1 = shift(a, DIMENSION_OFFSET);
	const b1 = shift(b, DIMENSION_OFFSET);
	const color = ctx.palette.muted;
	strokeLine(page, shift(a, 15), shift(a, DIMENSION_OFFSET + 3), { width: 0.4, color });
	strokeLine(page, shift(b, 15), shift(b, DIMENSION_OFFSET + 3), { width: 0.4, color });
	strokeLine(page, a1, b1, { width: 0.5, color });
	const along = { x: b.x - a.x, y: b.y - a.y };
	const lengthPt = Math.hypot(along.x, along.y);
	if (lengthPt < 1) return;
	const unit = { x: along.x / lengthPt, y: along.y / lengthPt };
	for (const end of [a1, b1]) {
		strokeLine(
			page,
			{ x: end.x - unit.x * 2.5 - unit.y * 2.5, y: end.y - unit.y * 2.5 + unit.x * 2.5 },
			{ x: end.x + unit.x * 2.5 + unit.y * 2.5, y: end.y + unit.y * 2.5 - unit.x * 2.5 },
			{ width: 0.7, color }
		);
	}
	let angle = (Math.atan2(unit.y, unit.x) * 180) / Math.PI;
	let direction = unit;
	if (angle > 90 || angle <= -90) {
		angle += angle > 0 ? -180 : 180;
		direction = { x: -unit.x, y: -unit.y };
	}
	const size = 7.5;
	const width = textWidth(ctx, label, size);
	const up = { x: -direction.y, y: direction.x };
	const gap = up.x * out.x + up.y * out.y >= 0 ? 2 : -(size * 0.75 + 2);
	const mid = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
	drawText(
		page,
		ctx,
		label,
		mid.x - direction.x * (width / 2) + up.x * gap,
		mid.y - direction.y * (width / 2) + up.y * gap,
		{ size, angle, color: ctx.palette.ink }
	);
}

function drawNeighbours(
	page: PDFPage,
	ctx: PdfContext,
	room: Room,
	fit: Fit,
	roomWalls: readonly Wall[]
): void {
	const size = 7;
	const color = ctx.palette.muted;
	for (const entry of ctx.links?.neighbours.get(room.id) ?? []) {
		const target = roomWalls.find((candidate) => candidate.number === entry.wall);
		if (!target) continue;
		const out = scaleVec(target.inward, -1);
		const a = toPage(fit, target.start);
		const b = toPage(fit, target.end);
		const lengthPt = Math.hypot(b.x - a.x, b.y - a.y);
		if (lengthPt < 1) continue;
		const unit = { x: (b.x - a.x) / lengthPt, y: (b.y - a.y) / lengthPt };
		const at = (along: number, distance: number): Point2 => {
			const base = toPage(fit, wallPoint(target, along));
			return { x: base.x + out.x * distance, y: base.y + out.y * distance };
		};
		strokeLine(page, at(entry.from, DIMENSION_OFFSET + 9), at(entry.to, DIMENSION_OFFSET + 9), {
			width: 0.9,
			color
		});
		let angle = (Math.atan2(unit.y, unit.x) * 180) / Math.PI;
		let direction = unit;
		if (angle > 90 || angle <= -90) {
			angle += angle > 0 ? -180 : 180;
			direction = { x: -unit.x, y: -unit.y };
		}
		const label = ctx.tr('borders', { room: entry.name });
		const width = textWidth(ctx, label, size);
		const up = { x: -direction.y, y: direction.x };
		const lift = up.x * out.x + up.y * out.y >= 0 ? 0 : -size * 0.75;
		const middle = at((entry.from + entry.to) / 2, DIMENSION_OFFSET + 13 + (lift === 0 ? 0 : size));
		drawText(
			page,
			ctx,
			label,
			middle.x - direction.x * (width / 2) + up.x * lift,
			middle.y - direction.y * (width / 2) + up.y * lift,
			{ size, angle, color }
		);
	}
}

export function drawRoomPlan(
	page: PDFPage,
	ctx: PdfContext,
	room: Room,
	options: PlanOptions
): PlanResult {
	const shapes = (options.items ?? []).flatMap((item) => itemFootprint(item));
	const bounds = boundsOf([...room.polygon, ...shapes]);
	const bordering = (ctx.links?.neighbours.get(room.id)?.length ?? 0) > 0;
	const fit = fitBounds(bounds, options.box, PLAN_PADDING + (bordering ? 12 : 0), options.align);
	const roomWalls = walls(room.polygon);
	const outline = room.polygon.map((p) => toPage(fit, p));
	polygon(page, outline, { fill: '#ffffff', color: ctx.palette.ink, width: 0.1 });
	drawPlanSlopes(page, ctx, room, fit);

	const elements = [...room.elements, ...(options.extraElements ?? [])];
	for (const element of elements) {
		if (element.kind === 'builtin' || element.kind === 'obstacle' || element.kind === 'radiator') {
			drawFixture(page, ctx, room, element, fit);
		}
	}
	const sortedItems = [...(options.items ?? [])]
		.map((item, index) => ({ item, number: index + 1 }))
		.sort((a, b) => a.item.elevation - b.item.elevation || a.number - b.number);
	for (const { item, number } of sortedItems) drawItem(page, ctx, item, number, fit);

	polygon(page, outline, { color: ctx.palette.ink, width: 2 });
	drawSlopeLabels(page, ctx, room, fit);

	for (const element of elements) {
		if (!isWallElement(element)) continue;
		if (element.kind === 'door' || element.kind === 'window') {
			const target = roomWalls.find((candidate) => candidate.number === element.wall);
			if (target) drawOpening(page, ctx, room, element, target, fit);
		}
	}
	for (const element of elements) {
		if (
			!isWallElement(element) ||
			element.kind === 'socket' ||
			element.kind === 'switch' ||
			element.kind === 'wallLamp' ||
			element.kind === 'dataPort'
		) {
			drawElectrical(page, ctx, room, element, fit);
		}
	}

	for (const target of roomWalls) {
		drawDimension(page, ctx, target, fit, String(Math.round(target.length)));
	}
	drawNeighbours(page, ctx, room, fit, roomWalls);
	roomWalls.forEach((target) => {
		const mid = toPage(fit, wallPoint(target, target.length / 2));
		const at = { x: mid.x + target.inward.x * 15, y: mid.y + target.inward.y * 15 };
		badge(page, ctx, String(target.number), at, 5.6, true);
	});
	room.polygon.forEach((corner, index) => {
		const out = outwardBisector(room, index);
		const p = toPage(fit, corner);
		badge(page, ctx, cornerLabel(index), { x: p.x + out.x * 11, y: p.y + out.y * 11 }, 6.6, false);
	});
	return { fit, paperScale: paperScale(fit.scale) };
}

export interface LegendEntry {
	label: string;
	draw: (page: PDFPage, x: number, y: number) => void;
}

export function drawLegend(
	page: PDFPage,
	ctx: PdfContext,
	x: number,
	y: number,
	maxWidth: number,
	entries: readonly LegendEntry[]
): number {
	let cursorX = x;
	let cursorY = y;
	for (const entry of entries) {
		const width = 22 + textWidth(ctx, entry.label, 8) + 12;
		if (cursorX + width > x + maxWidth) {
			cursorX = x;
			cursorY -= 15;
		}
		entry.draw(page, cursorX, cursorY);
		drawText(page, ctx, entry.label, cursorX + 22, cursorY - 2.5, { size: 8 });
		cursorX += width;
	}
	return cursorY;
}

export function planLegend(ctx: PdfContext, withItems: boolean, withSlopes = false): LegendEntry[] {
	const p = ctx.palette;
	const tr = ctx.tr;
	const entries: LegendEntry[] = [
		{
			label: tr('legendWindow'),
			draw: (page, x, y) => {
				strokeLine(page, { x, y }, { x: x + 16, y }, { width: 3.4, color: p.window });
				strokeLine(page, { x, y: y + 3 }, { x: x + 16, y: y + 3 }, { width: 0.8, color: p.window });
			}
		},
		{
			label: tr('legendDoor'),
			draw: (page, x, y) => {
				strokeLine(page, { x, y }, { x: x + 16, y }, { width: 3.4, color: p.door });
				polyline(
					page,
					[
						{ x: x + 16, y },
						{ x: x + 16, y: y + 8 }
					],
					{ width: 0.8, color: p.door }
				);
			}
		},
		{
			label: tr('legendFixture'),
			draw: (page, x, y) => {
				const box = [
					{ x, y: y - 4 },
					{ x: x + 16, y: y - 4 },
					{ x: x + 16, y: y + 4 },
					{ x, y: y + 4 }
				];
				polygon(page, box, { fill: p.fixture, fillOpacity: 0.22, color: p.fixture });
				for (const [a, b, c, d] of hatchSegments(16, 8, 4)) {
					strokeLine(
						page,
						{ x: x + a, y: y - 4 + b },
						{ x: x + c, y: y - 4 + d },
						{
							width: 0.4,
							color: p.fixture
						}
					);
				}
			}
		},
		{
			label: tr('legendElectric'),
			draw: (page, x, y) => {
				circle(page, { x: x + 4, y }, 3.6, { fill: p.electric, color: p.electric });
				polygon(
					page,
					[
						{ x: x + 10, y: y - 3 },
						{ x: x + 16, y: y - 3 },
						{ x: x + 13, y: y + 3.5 },
						{ x: x + 10, y: y - 3 }
					],
					{ fill: p.electric, color: p.electric }
				);
			}
		},
		{
			label: tr('legendSuggested'),
			draw: (page, x, y) => {
				circle(page, { x: x + 8, y }, 4, { fill: '#ffffff', color: p.suggested, dash: [2, 1.6] });
			}
		}
	];
	if (withItems) {
		entries.push({
			label: tr('legendItem'),
			draw: (page, x, y) => {
				polygon(
					page,
					[
						{ x, y: y - 4 },
						{ x: x + 16, y: y - 4 },
						{ x: x + 16, y: y + 4 },
						{ x, y: y + 4 }
					],
					{ fill: p.item, fillOpacity: 0.85, color: p.muted }
				);
			}
		});
	}
	if (withSlopes) {
		entries.push(
			{
				label: tr('legendSlope'),
				draw: (page, x, y) => {
					const box = [
						{ x, y: y - 4 },
						{ x: x + 16, y: y - 4 },
						{ x: x + 16, y: y + 4 },
						{ x, y: y + 4 }
					];
					polygon(page, box, { color: p.muted, width: 0.4 });
					for (const [a, b, c, d] of hatchSegments(16, 8, 3.5)) {
						strokeLine(
							page,
							{ x: x + a, y: y - 4 + b },
							{ x: x + c, y: y - 4 + d },
							{ width: 0.3, color: p.muted, opacity: 0.8 }
						);
					}
					strokeLine(
						page,
						{ x, y: y - 4 },
						{ x: x + 16, y: y - 4 },
						{ width: 1.6, color: p.muted }
					);
				}
			},
			{
				label: tr('legendStanding'),
				draw: (page, x, y) => {
					strokeLine(page, { x, y }, { x: x + 16, y }, { width: 0.8, color: p.ink, dash: [3, 2] });
				}
			}
		);
	}
	entries.push({
		label: tr('legendWallNumber'),
		draw: (page, x, y) => badge(page, ctx, '1', { x: x + 8, y }, 5.2, true)
	});
	entries.push({
		label: tr('legendCorner'),
		draw: (page, x, y) => badge(page, ctx, 'A', { x: x + 8, y }, 5.8, false)
	});
	return entries;
}

function elementDescription(
	ctx: PdfContext,
	element: WallElement,
	length: number,
	startLabel: string,
	endLabel: string
): string {
	const tr = ctx.tr;
	const name = elementKindNames[ctx.language][element.kind];
	const parts = [
		`${name}${element.status === 'existing' ? '' : ` (${tr(`status_${element.status}`)})`}`,
		tr('elementOffsets', {
			a: startLabel,
			b: endLabel,
			from: Math.round(element.offset),
			to: Math.round(length - element.offset - element.width)
		}),
		tr('elementSize', { w: element.width, h: element.height }),
		tr('elementHeights', { sill: element.elevation, top: element.elevation + element.height })
	];
	if ('depth' in element) parts.push(tr('elementDepth', { d: element.depth }));
	if (element.kind === 'door') {
		parts.push(tr(`hinge_${element.hinge}`), tr(`swing_${element.swing}`));
	}
	if (element.kind === 'window') parts.push(tr(`window_${element.windowType}`));
	if (element.kind === 'socket') {
		parts.push(tr('elementGang', { n: element.gang }));
		if (element.usb) parts.push('USB');
	}
	if (element.kind === 'dataPort') parts.push(tr(`port_${element.portType}`));
	const source = ctx.links?.sources.get(element.id);
	if (source) parts.push(tr('sharedFrom', { room: source }));
	if (element.note) parts.push(element.note);
	return parts.join(' · ');
}

export interface WallBlock {
	height: number;
	draw: (page: PDFPage, top: number) => void;
}

const SIDE_DIM = 34;
const TOP_DIM = 26;
const BOTTOM_DIM = 22;
const MAX_WALL_DRAW_HEIGHT = 190;
const ROW_SIZE = 8;
const ROW_LEADING = 10.4;

export function buildWallBlock(
	ctx: PdfContext,
	room: Room,
	target: Wall,
	contentX: number,
	contentWidth: number
): WallBlock {
	const tr = ctx.tr;
	const length = Math.round(target.length);
	const startLabel = cornerLabel(target.startIndex);
	const endLabel = cornerLabel(target.endIndex);
	const onWall = wallElements(room, target.number);
	const scale = Math.min(
		(contentWidth - SIDE_DIM * 2) / length,
		MAX_WALL_DRAW_HEIGHT / room.height
	);
	const drawW = length * scale;
	const drawH = room.height * scale;
	const title = tr('wallTitle', {
		n: target.number,
		from: startLabel,
		to: endLabel,
		length,
		height: room.height
	});
	const rowWidth = contentWidth - 14;
	const rows = onWall.map((element, index) => ({
		element,
		lines: wrapText(
			ctx,
			`${index + 1}. ${elementDescription(ctx, element, length, startLabel, endLabel)}`,
			ROW_SIZE,
			rowWidth
		)
	}));
	const spans = freeWallSpans(room, target.number);
	const freeText = tr('wallFree', {
		spans: spans.length ? spans.map((span) => `${span.from}-${span.to}`).join(', ') : tr('none')
	});
	const freeLines = wrapText(ctx, freeText, ROW_SIZE, rowWidth);
	const tableLines = rows.reduce((sum, row) => sum + row.lines.length, 0) + freeLines.length;
	const height = 15 + TOP_DIM + drawH + BOTTOM_DIM + 6 + tableLines * ROW_LEADING + 12;

	const draw = (page: PDFPage, top: number): void => {
		const p = ctx.palette;
		drawText(page, ctx, title, contentX, top - 10, { size: 10, bold: true });
		const left = contentX + (contentWidth - drawW) / 2;
		const right = left + drawW;
		const topY = top - 15 - TOP_DIM;
		const floorY = topY - drawH;
		const xAt = (along: number) => right - along * scale;
		const yAt = (elevation: number) => floorY + elevation * scale;

		const frame: WallFrame = { left, right, floorY, topY, scale };
		const sloped = profileIsSloped(room, target);
		if (sloped) {
			polygon(
				page,
				[
					{ x: left, y: floorY },
					{ x: right, y: floorY },
					...wallProfilePoints(room, target, frame)
				],
				{
					fill: '#ffffff',
					color: p.ink,
					width: 1
				}
			);
			strokeLine(
				page,
				{ x: left, y: topY },
				{ x: right, y: topY },
				{
					width: 0.5,
					color: p.muted,
					dash: [3, 2]
				}
			);
			drawProfileLabels(page, ctx, room, target, frame);
		} else {
			polygon(
				page,
				[
					{ x: left, y: floorY },
					{ x: right, y: floorY },
					{ x: right, y: topY },
					{ x: left, y: topY }
				],
				{ fill: '#ffffff', color: p.ink, width: 1 }
			);
		}
		strokeLine(
			page,
			{ x: left - 6, y: floorY },
			{ x: right + 6, y: floorY },
			{ width: 1.8, color: p.ink }
		);
		badge(page, ctx, startLabel, { x: right, y: topY + 11 }, 6.4, false);
		badge(page, ctx, endLabel, { x: left, y: topY + 11 }, 6.4, false);
		strokeLine(
			page,
			{ x: left - 14, y: floorY },
			{ x: left - 14, y: topY },
			{ width: 0.5, color: p.muted }
		);
		for (const y of [floorY, topY]) {
			strokeLine(
				page,
				{ x: left - 17, y: y - 2 },
				{ x: left - 11, y: y + 2 },
				{ width: 0.7, color: p.muted }
			);
		}
		drawText(page, ctx, String(room.height), left - 16, floorY + drawH / 2 - 4, {
			size: 7.5,
			angle: 90,
			align: 'center',
			color: p.ink
		});
		const bottomDim = floorY - 11;
		strokeLine(
			page,
			{ x: left, y: bottomDim },
			{ x: right, y: bottomDim },
			{ width: 0.5, color: p.muted }
		);
		for (const x of [left, right]) {
			strokeLine(
				page,
				{ x: x - 2, y: bottomDim - 2 },
				{ x: x + 2, y: bottomDim + 2 },
				{ width: 0.7, color: p.muted }
			);
		}
		drawText(page, ctx, String(length), (left + right) / 2, bottomDim - 9, {
			size: 7.5,
			align: 'center'
		});

		onWall.forEach((element, index) => {
			const x1 = xAt(element.offset + element.width);
			const x2 = xAt(element.offset);
			const y1 = yAt(element.elevation);
			const y2 = yAt(element.elevation + element.height);
			const stroke = elementColor(ctx, element);
			const dash = dashFor(element);
			const box = [
				{ x: x1, y: y1 },
				{ x: x2, y: y1 },
				{ x: x2, y: y2 },
				{ x: x1, y: y2 }
			];
			const solid = element.kind === 'window' || element.kind === 'door';
			polygon(page, box, {
				fill: stroke,
				fillOpacity: solid ? 0.18 : 0.3,
				color: stroke,
				width: 1,
				dash
			});
			if (
				element.kind === 'builtin' ||
				element.kind === 'obstacle' ||
				element.kind === 'radiator'
			) {
				for (const [a, b, c, d] of hatchSegments(x2 - x1, y2 - y1, 5)) {
					strokeLine(
						page,
						{ x: x1 + a, y: y1 + b },
						{ x: x1 + c, y: y1 + d },
						{
							width: 0.35,
							color: stroke,
							opacity: 0.8
						}
					);
				}
			}
			if (element.kind === 'door' && element.swing !== 'sliding') {
				const hingeX = element.hinge === 'start' ? x2 : x1;
				const freeX = element.hinge === 'start' ? x1 : x2;
				polyline(
					page,
					[
						{ x: freeX, y: y1 },
						{ x: hingeX, y: (y1 + y2) / 2 },
						{ x: freeX, y: y2 }
					],
					{
						width: 0.5,
						color: stroke,
						dash: [2, 2]
					}
				);
			}
			if (element.kind === 'window') {
				strokeLine(
					page,
					{ x: (x1 + x2) / 2, y: y1 },
					{ x: (x1 + x2) / 2, y: y2 },
					{
						width: 0.5,
						color: stroke
					}
				);
			}
			const center = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
			const radius = 4.6;
			badge(page, ctx, String(index + 1), center, radius, true);
			const top = element.elevation + element.height;
			const topLabel = String(top);
			const bottomLabel = String(element.elevation);
			if (top < room.height - 1) {
				drawText(page, ctx, topLabel, center.x, y2 + 2, {
					size: 6.2,
					align: 'center',
					color: p.muted
				});
			}
			if (element.elevation > 0) {
				drawText(page, ctx, bottomLabel, center.x, y1 - 7, {
					size: 6.2,
					align: 'center',
					color: p.muted
				});
			}
		});

		let y = floorY - BOTTOM_DIM - 6;
		for (const row of rows) {
			for (const line of row.lines) {
				y -= ROW_LEADING;
				drawText(page, ctx, line, contentX + 7, y + 2, { size: ROW_SIZE });
			}
		}
		for (const line of freeLines) {
			y -= ROW_LEADING;
			drawText(page, ctx, line, contentX + 7, y + 2, { size: ROW_SIZE, color: p.muted });
		}
	};
	return { height, draw };
}
