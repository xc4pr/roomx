import type { PDFPage } from 'pdf-lib';
import {
	checkStairs,
	floorClearHeight,
	floorLevels,
	floorRooms,
	stairContext,
	type StairZone,
	type StairContext
} from '#lib/core/floors.ts';
import { centroid, roomToBoard, type Vec } from '#lib/core/geometry.ts';
import type { Floor, Project, Room, Stair } from '#lib/core/schema.ts';
import {
	CONTENT_BOTTOM,
	CONTENT_WIDTH,
	MARGIN,
	applyFit,
	boundsOf,
	fitBounds,
	type Box,
	type Fit
} from './layout.ts';
import {
	badge,
	drawText,
	Flow,
	polygon,
	polyline,
	safeText,
	strokeLine,
	textWidth,
	type PdfContext,
	type Point2
} from './pdfKit.ts';
import { drawLegend, legendRows, type LegendEntry } from './pdfPlan.ts';

const SECTION_HEIGHT = 120;
const SECTION_GAP = 14;
const SECTION_MARGIN_STEPS = 2;

type ShapeKey = 'shapeStraight' | 'shapeL' | 'shapeU' | 'shapeSpiral';

const SHAPE_KEYS: Record<Stair['shape'], ShapeKey> = {
	straight: 'shapeStraight',
	l: 'shapeL',
	u: 'shapeU',
	spiral: 'shapeSpiral'
};

export interface FloorGroup {
	floor: Floor;
	rooms: Room[];
}

// The included rooms grouped by storey, lowest first; storeys without an included room are left out.
export function floorGroups(project: Project, rooms: readonly Room[]): FloorGroup[] {
	const ids = new Set(rooms.map((room) => room.id));
	return (project.floors ?? [])
		.map((floor) => ({
			floor,
			rooms: floorRooms(project, floor.id).filter((room) => ids.has(room.id))
		}))
		.filter((group) => group.rooms.length > 0);
}

function stairNumber(project: Project, stair: Stair): number {
	return (project.stairs ?? []).findIndex((candidate) => candidate.id === stair.id) + 1;
}

function stairsFrom(project: Project, floor: Floor): StairContext[] {
	return (project.stairs ?? []).flatMap((stair) => {
		const context = stairContext(project, stair);
		return context && context.from.id === floor.id ? [context] : [];
	});
}

function stairsTo(project: Project, floor: Floor): StairContext[] {
	return (project.stairs ?? []).flatMap((stair) => {
		const context = stairContext(project, stair);
		return context && context.to.id === floor.id ? [context] : [];
	});
}

function toPage(fit: Fit, p: Vec): Point2 {
	return applyFit(fit, p);
}

function arrow(page: PDFPage, from: Point2, to: Point2, color: string): void {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const length = Math.hypot(dx, dy);
	if (length < 1) return;
	const ux = dx / length;
	const uy = dy / length;
	const size = Math.min(7, length / 2);
	polygon(
		page,
		[
			to,
			{ x: to.x - ux * size + uy * size * 0.45, y: to.y - uy * size - ux * size * 0.45 },
			{ x: to.x - ux * size - uy * size * 0.45, y: to.y - uy * size + ux * size * 0.45 }
		],
		{ fill: color, color, width: 0.4 }
	);
}

function drawStairs(
	page: PDFPage,
	ctx: PdfContext,
	project: Project,
	contexts: readonly StairContext[],
	fit: Fit
): void {
	const p = ctx.palette;
	for (const context of contexts) {
		for (const tread of context.layout.treads) {
			polygon(
				page,
				tread.polygon.map((point) => toPage(fit, point)),
				{
					fill: p.accent,
					fillOpacity: tread.landing ? 0.3 : 0.14,
					color: p.accent,
					width: 0.5
				}
			);
		}
		const walk = context.layout.treads.map((tread) => toPage(fit, centroid(tread.polygon)));
		const end = toPage(fit, {
			x: (context.layout.arrival.from.x + context.layout.arrival.to.x) / 2,
			y: (context.layout.arrival.from.y + context.layout.arrival.to.y) / 2
		});
		const line = [...walk, end];
		polyline(page, line, { width: 1.2, color: p.ink });
		if (line.length >= 2) arrow(page, line[line.length - 2], line[line.length - 1], p.ink);
		const foot = toPage(fit, { x: context.stair.x, y: context.stair.y });
		badge(page, ctx, String(stairNumber(project, context.stair)), foot, 5.6, true);
	}
}

function drawStairwells(
	page: PDFPage,
	ctx: PdfContext,
	contexts: readonly StairContext[],
	fit: Fit
): void {
	const p = ctx.palette;
	for (const context of contexts) {
		for (const tread of context.opening) {
			polygon(
				page,
				tread.polygon.map((point) => toPage(fit, point)),
				{ fill: p.fire, fillOpacity: 0.1, color: p.fire, width: 0.8, dash: [3, 2] }
			);
		}
	}
}

function drawFloorPlan(
	page: PDFPage,
	ctx: PdfContext,
	project: Project,
	group: FloorGroup,
	box: Box
): void {
	const p = ctx.palette;
	const up = stairsFrom(project, group.floor);
	const down = stairsTo(project, group.floor);
	const outlines = group.rooms.map((room) => ({
		room,
		points: room.polygon.map((corner) => roomToBoard(room, corner))
	}));
	const stairPoints = [...up, ...down].flatMap((context) =>
		context.layout.treads.flatMap((tread) => tread.polygon)
	);
	const bounds = boundsOf([...outlines.flatMap((entry) => entry.points), ...stairPoints]);
	const fit = fitBounds(bounds, box, 14, 'top');
	for (const { points } of outlines) {
		const outline = points.map((point) => toPage(fit, point));
		polygon(page, outline, { fill: '#ffffff', color: p.ink, width: 1.6 });
	}
	drawStairwells(page, ctx, down, fit);
	drawStairs(page, ctx, project, up, fit);
	for (const { room, points } of outlines) {
		const middle = toPage(fit, centroid(points));
		const label = safeText(ctx, room.name);
		const width = textWidth(ctx, label, 8, true);
		const x = Math.min(Math.max(middle.x, box.x + width / 2), box.x + box.w - width / 2);
		drawText(page, ctx, label, x, middle.y - 3, {
			size: 8,
			bold: true,
			align: 'center',
			color: p.muted
		});
	}
}

export function stairLegend(ctx: PdfContext, zones: readonly StairZone[]): LegendEntry[] {
	return floorLegend(
		ctx,
		zones.some((zone) => zone.kind === 'stair'),
		zones.some((zone) => zone.kind === 'stairwell')
	).filter((entry) => entry.label !== ctx.tr('legendLanding'));
}

function floorLegend(ctx: PdfContext, hasUp: boolean, hasDown: boolean): LegendEntry[] {
	const p = ctx.palette;
	const entries: LegendEntry[] = [];
	if (hasUp) {
		entries.push(
			{
				label: ctx.tr('legendStair'),
				draw: (page, x, y) => {
					polygon(
						page,
						[
							{ x, y: y - 4 },
							{ x: x + 16, y: y - 4 },
							{ x: x + 16, y: y + 4 },
							{ x, y: y + 4 }
						],
						{ fill: p.accent, fillOpacity: 0.14, color: p.accent, width: 0.5 }
					);
					strokeLine(page, { x: x + 2, y }, { x: x + 13, y }, { width: 1, color: p.ink });
					arrow(page, { x: x + 8, y }, { x: x + 15, y }, p.ink);
				}
			},
			{
				label: ctx.tr('legendLanding'),
				draw: (page, x, y) => {
					polygon(
						page,
						[
							{ x, y: y - 4 },
							{ x: x + 16, y: y - 4 },
							{ x: x + 16, y: y + 4 },
							{ x, y: y + 4 }
						],
						{ fill: p.accent, fillOpacity: 0.3, color: p.accent, width: 0.5 }
					);
				}
			}
		);
	}
	if (hasDown) {
		entries.push({
			label: ctx.tr('legendStairwell'),
			draw: (page, x, y) => {
				polygon(
					page,
					[
						{ x, y: y - 4 },
						{ x: x + 16, y: y - 4 },
						{ x: x + 16, y: y + 4 },
						{ x, y: y + 4 }
					],
					{ fill: p.fire, fillOpacity: 0.1, color: p.fire, width: 0.8, dash: [3, 2] }
				);
			}
		});
	}
	return entries;
}

// Side view of one stair, unrolled along its walking line: lower floor, steps, slab with the
// opening above the stairwell, ceiling of the lower storey.
// Distance along the unrolled stair where the opening in the slab above starts. The step number
// comes from the height like in the core, not from the position in the tread list.
export function openingStart(context: StairContext): number {
	const { risers } = context.layout;
	const run = Math.max(1, risers.count - 1) * risers.tread;
	const first = context.opening.reduce<number | undefined>(
		(lowest, tread) => (lowest === undefined || tread.height < lowest ? tread.height : lowest),
		undefined
	);
	if (first === undefined) return run;
	const step = Math.round(first / risers.riser);
	return Math.max(0, Math.min(run, (step - 1) * risers.tread));
}

function drawSection(
	page: PDFPage,
	ctx: PdfContext,
	project: Project,
	context: StairContext,
	headroom: { tread: number; headroom: number } | undefined,
	box: Box
): void {
	const p = ctx.palette;
	const { risers } = context.layout;
	const clear = floorClearHeight(project, context.from);
	const run = Math.max(1, risers.count - 1) * risers.tread;
	const margin = SECTION_MARGIN_STEPS * risers.tread;
	const bounds = { minX: -margin, minY: -80, maxX: run + margin, maxY: context.height + 160 };
	const fit = fitBounds(bounds, { x: box.x, y: box.y + 14, w: box.w, h: box.h - 28 }, 4, 'center');
	const at = (x: number, y: number): Point2 => applyFit(fit, { x, y });

	const steps: Point2[] = [at(-margin, 0), at(0, 0)];
	for (let k = 1; k < risers.count; k++) {
		steps.push(
			at((k - 1) * risers.tread, k * risers.riser),
			at(k * risers.tread, k * risers.riser)
		);
	}
	steps.push(at(run, context.height), at(run + margin, context.height));
	polyline(page, steps, { width: 1.4, color: p.accent });

	const openFrom = openingStart(context);
	const slabBottom = clear;
	const slabParts: [number, number][] = [
		[-margin, openFrom],
		[run, run + margin]
	];
	for (const [from, to] of slabParts) {
		if (to <= from) continue;
		const a = at(from, slabBottom);
		const b = at(to, context.height);
		polygon(
			page,
			[
				{ x: a.x, y: a.y },
				{ x: b.x, y: a.y },
				{ x: b.x, y: b.y },
				{ x: a.x, y: b.y }
			],
			{ fill: p.fixture, fillOpacity: 0.35, color: p.fixture, width: 0.5 }
		);
	}
	strokeLine(page, at(-margin, clear), at(openFrom, clear), {
		width: 0.7,
		color: p.muted,
		dash: [4, 2]
	});
	strokeLine(page, at(run, context.height), at(run + margin, context.height), {
		width: 0.7,
		color: p.muted
	});
	strokeLine(page, at(-margin, 0), at(0, 0), { width: 0.7, color: p.muted });

	drawText(page, ctx, ctx.tr('sectionLowerFloor'), at(-margin, 0).x, at(0, 0).y - 10, {
		size: 7,
		color: p.muted
	});
	drawText(
		page,
		ctx,
		ctx.tr('sectionUpperFloor'),
		at(run + margin, 0).x,
		at(0, context.height).y + 4,
		{
			size: 7,
			align: 'right',
			color: p.muted
		}
	);
	const label = headroom
		? ctx.tr('stairHeadroom', { headroom: headroom.headroom, tread: headroom.tread })
		: ctx.tr('stairHeadroomOk');
	drawText(page, ctx, label, box.x, box.y + box.h - 8, {
		size: 8,
		bold: headroom !== undefined,
		color: headroom ? p.fire : p.muted
	});
}

function stairInfo(ctx: PdfContext, project: Project, context: StairContext): string {
	const names = new Map((project.floors ?? []).map((floor) => [floor.id, floor.name]));
	return ctx.tr('stairLine', {
		n: stairNumber(project, context.stair),
		shape: ctx.tr(SHAPE_KEYS[context.stair.shape]),
		from: names.get(context.from.id) ?? '',
		to: names.get(context.to.id) ?? '',
		steps: context.layout.risers.count,
		riser: Math.round(context.layout.risers.riser * 10) / 10,
		tread: context.layout.risers.tread,
		height: Math.round(context.height),
		width: context.stair.width
	});
}

export function drawFloorPage(ctx: PdfContext, project: Project, group: FloorGroup): void {
	const tr = ctx.tr;
	const levels = floorLevels(project);
	const up = stairsFrom(project, group.floor);
	const down = stairsTo(project, group.floor);
	const flow = new Flow(
		ctx,
		tr('floorPlanTitle', { floor: group.floor.name }),
		tr('floorSubtitle', {
			rooms: group.rooms.length,
			level: Math.round(levels.get(group.floor.id) ?? 0),
			height: Math.round(floorClearHeight(project, group.floor)),
			slab: group.floor.slabThickness
		})
	);
	const names = new Map((project.floors ?? []).map((floor) => [floor.id, floor.name]));
	for (const context of up) flow.paragraph(stairInfo(ctx, project, context), { size: 8.5 });
	for (const context of down) {
		flow.paragraph(
			tr('stairwellLine', {
				n: stairNumber(project, context.stair),
				from: names.get(context.from.id) ?? ''
			}),
			{ size: 8.5 }
		);
	}
	flow.gap(4);
	const legend = floorLegend(ctx, up.length > 0, down.length > 0);
	const legendHeight = legend.length > 0 ? 20 + legendRows(ctx, CONTENT_WIDTH, legend) * 15 : 0;
	const issues = checkStairs(project);
	const sections = up.length > 0 ? SECTION_HEIGHT + SECTION_GAP : 0;
	const planBox: Box = {
		x: MARGIN,
		y: CONTENT_BOTTOM + legendHeight + sections,
		w: CONTENT_WIDTH,
		h: flow.y - (CONTENT_BOTTOM + legendHeight + sections)
	};
	drawFloorPlan(flow.page, ctx, project, group, planBox);
	if (up.length > 0) {
		const gap = 12;
		const shown = up.slice(0, 3);
		const width = (CONTENT_WIDTH - gap * (shown.length - 1)) / shown.length;
		shown.forEach((context, index) => {
			const box: Box = {
				x: MARGIN + index * (width + gap),
				y: CONTENT_BOTTOM + legendHeight,
				w: width,
				h: SECTION_HEIGHT
			};
			const issue = issues.find(
				(candidate) => candidate.code === 'stairHeadroom' && candidate.stairId === context.stair.id
			);
			const title = `${tr('stairSection', { n: stairNumber(project, context.stair) })}${
				context.stair.shape === 'straight' ? '' : ` (${tr('stairUnrolled')})`
			}`;
			drawText(flow.page, ctx, title, box.x, box.y + box.h + 2, { size: 8.5, bold: true });
			drawSection(
				flow.page,
				ctx,
				project,
				context,
				issue && issue.headroom !== undefined && issue.tread !== undefined
					? { tread: issue.tread, headroom: issue.headroom }
					: undefined,
				{ ...box, h: box.h - 4 }
			);
		});
	}
	if (legend.length > 0) {
		drawLegend(flow.page, ctx, MARGIN, CONTENT_BOTTOM + legendHeight - 8, CONTENT_WIDTH, legend);
	}
}
