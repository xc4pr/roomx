import type { PDFPage } from 'pdf-lib';
import { slopeRun, wall, wallPoint, walls, type Vec, type Wall } from '#lib/core/geometry.ts';
import { STANDING_HEIGHT } from '#lib/core/export.ts';
import type { Room, Slope } from '#lib/core/schema.ts';
import {
	clipSegmentToPolygon,
	longestSegment,
	slopeShapes,
	type Segment
} from '#lib/features/board/slopes.ts';
import { profileSegments, wallProfile } from '#lib/features/elements/profile.ts';
import type { Fit } from './layout.ts';
import { applyFit } from './layout.ts';
import { drawText, strokeLine, textWidth, type PdfContext, type Point2 } from './pdfKit.ts';

export function hasSlopes(room: Pick<Room, 'slopes'>): boolean {
	return (room.slopes?.length ?? 0) > 0;
}

export function zoneHatch(zone: readonly Vec[], spacing: number): Segment[] {
	if (zone.length < 3 || spacing <= 0) return [];
	const xs = zone.map((p) => p.x);
	const ys = zone.map((p) => p.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const from = Math.min(...ys) - maxX;
	const to = Math.max(...ys) - minX;
	const step = spacing * Math.SQRT2;
	const lines: Segment[] = [];
	for (let c = from + step / 2; c < to; c += step) {
		lines.push(
			...clipSegmentToPolygon(
				{ x: minX - 1, y: minX - 1 + c },
				{ x: maxX + 1, y: maxX + 1 + c },
				zone
			)
		);
	}
	return lines;
}

export function slopeCaption(ctx: PdfContext, slope: Slope): string {
	return ctx.tr('slopeCaption', {
		n: slope.wall,
		knee: Math.round(slope.kneeHeight),
		angle: Math.round(slope.angle * 10) / 10
	});
}

export function slopeSummary(ctx: PdfContext, room: Room): string | undefined {
	if (!room.slopes || room.slopes.length === 0) return undefined;
	const parts = room.slopes.map((slope) => {
		const full = Math.round(slopeRun(room, slope));
		const standing = STANDING_HEIGHT - slope.kneeHeight;
		const tangent = Math.tan((slope.angle * Math.PI) / 180);
		const base = ctx.tr('slopeEntry', {
			n: slope.wall,
			knee: Math.round(slope.kneeHeight),
			angle: Math.round(slope.angle * 10) / 10,
			full
		});
		if (STANDING_HEIGHT > room.height) return base;
		if (standing <= 0) return `${base}, ${ctx.tr('slopeStandingAtWall')}`;
		return `${base}, ${ctx.tr('slopeStanding', { standing: Math.round(standing / tangent) })}`;
	});
	return ctx.tr('slopeRoomLine', { list: parts.join(' · ') });
}

function toPage(fit: Fit, p: Vec): Point2 {
	return applyFit(fit, p);
}

export function drawPlanSlopes(page: PDFPage, ctx: PdfContext, room: Room, fit: Fit): void {
	const p = ctx.palette;
	for (const shape of slopeShapes(room)) {
		for (const [a, b] of zoneHatch(shape.zone, 4.5 / fit.scale)) {
			strokeLine(page, toPage(fit, a), toPage(fit, b), {
				width: 0.3,
				color: p.muted,
				opacity: 0.6
			});
		}
		for (const [a, b] of shape.full) {
			strokeLine(page, toPage(fit, a), toPage(fit, b), { width: 0.5, color: p.muted });
		}
		for (const [a, b] of shape.standing) {
			strokeLine(page, toPage(fit, a), toPage(fit, b), {
				width: 0.8,
				color: p.ink,
				dash: [3, 2]
			});
		}
		const target = wall(room.polygon, shape.slope.wall);
		if (!target) continue;
		const inset = 2 / fit.scale;
		strokeLine(
			page,
			toPage(fit, wallPoint(target, 0, inset)),
			toPage(fit, wallPoint(target, target.length, inset)),
			{ width: 1.6, color: p.muted }
		);
	}
}

function alongText(
	page: PDFPage,
	ctx: PdfContext,
	text: string,
	mid: Point2,
	direction: Point2,
	inward: Point2,
	size: number,
	color: string
): void {
	let unit = direction;
	let angle = (Math.atan2(unit.y, unit.x) * 180) / Math.PI;
	if (angle > 90 || angle <= -90) {
		angle += angle > 0 ? -180 : 180;
		unit = { x: -unit.x, y: -unit.y };
	}
	const up = { x: -unit.y, y: unit.x };
	const distance = up.x * inward.x + up.y * inward.y >= 0 ? 7 : size * 0.75 + 7;
	const width = textWidth(ctx, text, size);
	drawText(
		page,
		ctx,
		text,
		mid.x - unit.x * (width / 2) + inward.x * distance,
		mid.y - unit.y * (width / 2) + inward.y * distance,
		{ size, angle, color }
	);
}

export function drawSlopeLabels(page: PDFPage, ctx: PdfContext, room: Room, fit: Fit): void {
	const p = ctx.palette;
	const sides = walls(room.polygon);
	for (const shape of slopeShapes(room)) {
		const target = sides[shape.slope.wall - 1];
		if (!target) continue;
		const start = toPage(fit, wallPoint(target, 0));
		const end = toPage(fit, wallPoint(target, target.length));
		const lengthPt = Math.hypot(end.x - start.x, end.y - start.y);
		if (lengthPt > 20) {
			const text = slopeCaption(ctx, shape.slope);
			const available = Math.max(8, lengthPt * 0.5 - 8);
			const size = Math.max(4.6, Math.min(6.8, (6.8 * available) / textWidth(ctx, text, 6.8)));
			alongText(
				page,
				ctx,
				text,
				{ x: start.x + (end.x - start.x) * 0.27, y: start.y + (end.y - start.y) * 0.27 },
				{ x: target.direction.x, y: target.direction.y },
				target.inward,
				size,
				p.ink
			);
		}
		const best = longestSegment(shape.standing);
		if (!best) continue;
		const a = toPage(fit, best[0]);
		const b = toPage(fit, best[1]);
		if (Math.hypot(b.x - a.x, b.y - a.y) < 24) continue;
		const label = ctx.tr('standingMark');
		const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
		const labelWidth = textWidth(ctx, label, 6, true);
		const vertical = Math.abs(target.inward.x) > Math.abs(target.inward.y);
		drawText(
			page,
			ctx,
			label,
			vertical ? mid.x + target.inward.x * (labelWidth / 2 + 3) : mid.x,
			vertical ? mid.y - 2 : mid.y + (target.inward.y >= 0 ? 2.5 : -8.5),
			{ size: 6, align: 'center', color: p.ink, bold: true }
		);
	}
}

export interface WallFrame {
	left: number;
	right: number;
	floorY: number;
	topY: number;
	scale: number;
}

export function wallXAt(frame: WallFrame, along: number): number {
	return frame.right - along * frame.scale;
}

export function wallYAt(frame: WallFrame, height: number): number {
	return frame.floorY + height * frame.scale;
}

export function profileIsSloped(room: Room, target: Wall): boolean {
	if (!hasSlopes(room)) return false;
	return wallProfile(room, target.number).some((point) => point.height < room.height - 0.5);
}

export function wallProfilePoints(room: Room, target: Wall, frame: WallFrame): Point2[] {
	return wallProfile(room, target.number).map((point) => ({
		x: wallXAt(frame, point.along),
		y: wallYAt(frame, point.height)
	}));
}

export function drawProfileLabels(
	page: PDFPage,
	ctx: PdfContext,
	room: Room,
	target: Wall,
	frame: WallFrame
): void {
	const p = ctx.palette;
	const points = wallProfile(room, target.number);
	points.forEach((point, index) => {
		if (point.height >= room.height - 1) return;
		const x = wallXAt(frame, point.along);
		const y = wallYAt(frame, point.height);
		const label = String(Math.round(point.height));
		if (index === 0) {
			drawText(page, ctx, label, x - 3, y - 8, { size: 6.2, align: 'right', color: p.muted });
		} else if (index === points.length - 1) {
			drawText(page, ctx, label, x + 3, y - 8, { size: 6.2, color: p.muted });
		} else {
			const peak =
				point.height > points[index - 1].height && point.height > points[index + 1].height;
			drawText(page, ctx, label, x, peak ? y + 3 : y - 8, {
				size: 6.2,
				align: 'center',
				color: p.muted
			});
		}
	});
	const own = room.slopes?.find((slope) => slope.wall === target.number);
	if (own) {
		const top = Math.max(...points.map((point) => point.height));
		drawText(
			page,
			ctx,
			ctx.tr('wallKnee', {
				knee: Math.round(own.kneeHeight),
				angle: Math.round(own.angle * 10) / 10
			}),
			(frame.left + frame.right) / 2,
			wallYAt(frame, top) + 5,
			{ size: 7.5, align: 'center', color: p.ink, bold: true }
		);
		return;
	}
	for (const segment of profileSegments(room, target.number)) {
		if (!segment.slope) continue;
		const x = wallXAt(frame, (segment.from.along + segment.to.along) / 2);
		const y = wallYAt(frame, (segment.from.height + segment.to.height) / 2);
		if (Math.abs(wallXAt(frame, segment.from.along) - wallXAt(frame, segment.to.along)) < 22)
			continue;
		drawText(page, ctx, `${Math.round(segment.slope.angle * 10) / 10}°`, x, y + 4, {
			size: 6.8,
			align: 'center',
			color: p.muted
		});
	}
}
