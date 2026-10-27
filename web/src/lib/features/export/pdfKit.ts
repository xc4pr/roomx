import { degrees, PDFDocument, rgb, type Color, type PDFFont, type PDFPage } from 'pdf-lib';
import type { CatalogLookup } from '#lib/core/catalog.ts';
import type { Language } from '#lib/core/units.ts';
import {
	CONTENT_BOTTOM,
	CONTENT_TOP,
	CONTENT_WIDTH,
	MARGIN,
	PAGE_HEIGHT,
	PAGE_WIDTH
} from './layout.ts';
import type { messages } from './i18n.ts';
import type { Palette } from './palette.ts';
import type { Translate } from './text.ts';

export type PdfKey = keyof (typeof messages)['de'];

export interface PdfNeighbour {
	wall: number;
	from: number;
	to: number;
	name: string;
}

export interface PdfLinks {
	shared: ReadonlySet<string>;
	sources: ReadonlyMap<string, string>;
	neighbours: ReadonlyMap<string, readonly PdfNeighbour[]>;
}

export interface PdfContext {
	doc: PDFDocument;
	lookup: CatalogLookup;
	font: PDFFont;
	bold: PDFFont;
	palette: Palette;
	language: Language;
	tr: Translate<PdfKey>;
	known: ReadonlySet<number>;
	knownBold: ReadonlySet<number>;
	links?: PdfLinks;
	floorNames?: ReadonlyMap<string, string>;
	railings?: ReadonlyMap<string, readonly { wall: number; from: number; to: number }[]>;
}

export interface Point2 {
	x: number;
	y: number;
}

export function color(hex: string): Color {
	const value = Number.parseInt(hex.slice(1), 16);
	return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

export function safeText(ctx: PdfContext, text: string, bold = false): string {
	const known = bold ? ctx.knownBold : ctx.known;
	let out = '';
	for (const char of text.replace(/\t/g, ' ').replace(/\r/g, '')) {
		const code = char.codePointAt(0) ?? 0;
		if (char === '\n' || known.has(code)) out += char;
		else if (/\p{Mn}/u.test(char)) continue;
		else out += known.has(63) ? '?' : ' ';
	}
	return out;
}

export function textWidth(ctx: PdfContext, text: string, size: number, bold = false): number {
	return (bold ? ctx.bold : ctx.font).widthOfTextAtSize(safeText(ctx, text, bold), size);
}

export function wrapText(
	ctx: PdfContext,
	text: string,
	size: number,
	maxWidth: number,
	bold = false
): string[] {
	const lines: string[] = [];
	for (const paragraph of safeText(ctx, text, bold).split('\n')) {
		const words = paragraph.split(/ +/).filter((word) => word.length > 0);
		if (words.length === 0) {
			lines.push('');
			continue;
		}
		let line = '';
		const width = (value: string) => (bold ? ctx.bold : ctx.font).widthOfTextAtSize(value, size);
		for (let word of words) {
			while (width(word) > maxWidth && word.length > 1) {
				let cut = word.length - 1;
				while (cut > 1 && width(word.slice(0, cut)) > maxWidth) cut--;
				if (line) {
					lines.push(line);
					line = '';
				}
				lines.push(word.slice(0, cut));
				word = word.slice(cut);
			}
			const candidate = line ? `${line} ${word}` : word;
			if (line && width(candidate) > maxWidth) {
				lines.push(line);
				line = word;
			} else {
				line = candidate;
			}
		}
		if (line) lines.push(line);
	}
	return lines;
}

export interface TextOptions {
	size?: number;
	bold?: boolean;
	color?: string;
	align?: 'left' | 'center' | 'right';
	angle?: number;
}

export function drawText(
	page: PDFPage,
	ctx: PdfContext,
	text: string,
	x: number,
	y: number,
	options: TextOptions = {}
): void {
	const size = options.size ?? 9;
	const bold = options.bold ?? false;
	const clean = safeText(ctx, text, bold).replace(/\n/g, ' ');
	if (!clean) return;
	const font = bold ? ctx.bold : ctx.font;
	const width = font.widthOfTextAtSize(clean, size);
	const shift = options.align === 'center' ? width / 2 : options.align === 'right' ? width : 0;
	const angle = options.angle ?? 0;
	const radians = (angle * Math.PI) / 180;
	page.drawText(clean, {
		x: x - Math.cos(radians) * shift,
		y: y - Math.sin(radians) * shift,
		size,
		font,
		color: color(options.color ?? ctx.palette.ink),
		...(angle ? { rotate: degrees(angle) } : {})
	});
}

export interface StrokeOptions {
	width?: number;
	color?: string;
	dash?: number[];
	opacity?: number;
}

export function strokeLine(page: PDFPage, a: Point2, b: Point2, options: StrokeOptions = {}): void {
	page.drawLine({
		start: a,
		end: b,
		thickness: options.width ?? 0.8,
		color: color(options.color ?? '#1c1f23'),
		...(options.dash ? { dashArray: options.dash } : {}),
		...(options.opacity !== undefined ? { opacity: options.opacity } : {})
	});
}

export function polyline(
	page: PDFPage,
	points: readonly Point2[],
	options: StrokeOptions = {}
): void {
	for (let i = 0; i + 1 < points.length; i++) strokeLine(page, points[i], points[i + 1], options);
}

export interface FillOptions extends StrokeOptions {
	fill?: string;
	fillOpacity?: number;
}

export function polygon(page: PDFPage, points: readonly Point2[], options: FillOptions = {}): void {
	if (points.length < 3) return;
	const path = `${points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${-p.y}`).join(' ')} Z`;
	page.drawSvgPath(path, {
		x: 0,
		y: 0,
		...(options.fill ? { color: color(options.fill) } : {}),
		...(options.fillOpacity !== undefined ? { opacity: options.fillOpacity } : {}),
		...(options.color
			? {
					borderColor: color(options.color),
					borderWidth: options.width ?? 0.8,
					...(options.dash ? { borderDashArray: options.dash } : {}),
					...(options.opacity !== undefined ? { borderOpacity: options.opacity } : {})
				}
			: {})
	});
}

export function circle(
	page: PDFPage,
	center: Point2,
	radius: number,
	options: FillOptions = {}
): void {
	page.drawCircle({
		x: center.x,
		y: center.y,
		size: radius,
		...(options.fill ? { color: color(options.fill) } : {}),
		...(options.fillOpacity !== undefined ? { opacity: options.fillOpacity } : {}),
		...(options.color
			? {
					borderColor: color(options.color),
					borderWidth: options.width ?? 0.8,
					...(options.dash ? { borderDashArray: options.dash } : {}),
					...(options.opacity !== undefined ? { borderOpacity: options.opacity } : {})
				}
			: {})
	});
}

export function badge(
	page: PDFPage,
	ctx: PdfContext,
	label: string,
	center: Point2,
	radius: number,
	filled: boolean
): void {
	circle(page, center, radius, {
		fill: filled ? ctx.palette.ink : '#ffffff',
		color: ctx.palette.ink,
		width: 0.8
	});
	const size = radius * 1.15;
	drawText(page, ctx, label, center.x, center.y - size * 0.34, {
		size,
		bold: true,
		align: 'center',
		color: filled ? '#ffffff' : ctx.palette.ink
	});
}

export class Flow {
	readonly ctx: PdfContext;
	readonly title: string;
	readonly subtitle: string | undefined;
	page!: PDFPage;
	y = CONTENT_TOP;
	pageCount = 0;

	constructor(ctx: PdfContext, title: string, subtitle?: string) {
		this.ctx = ctx;
		this.title = title;
		this.subtitle = subtitle;
		this.#start(false);
	}

	#start(continued: boolean): void {
		this.page = this.ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
		this.pageCount++;
		this.y = CONTENT_TOP;
		const title = continued ? `${this.title} ${this.ctx.tr('continued')}` : this.title;
		const lines = wrapText(this.ctx, title, 17, CONTENT_WIDTH, true);
		for (const line of lines.slice(0, 2)) {
			this.y -= 17;
			drawText(this.page, this.ctx, line, MARGIN, this.y, { size: 17, bold: true });
			this.y -= 3;
		}
		if (this.subtitle) {
			for (const line of wrapText(this.ctx, this.subtitle, 8.5, CONTENT_WIDTH).slice(0, 2)) {
				this.y -= 11;
				drawText(this.page, this.ctx, line, MARGIN, this.y, {
					size: 8.5,
					color: this.ctx.palette.muted
				});
			}
		}
		this.y -= 7;
		strokeLine(
			this.page,
			{ x: MARGIN, y: this.y },
			{ x: MARGIN + CONTENT_WIDTH, y: this.y },
			{ width: 0.6, color: this.ctx.palette.line }
		);
		this.y -= 12;
	}

	get remaining(): number {
		return this.y - CONTENT_BOTTOM;
	}

	ensure(height: number): void {
		if (this.y - height < CONTENT_BOTTOM) this.#start(true);
	}

	gap(height: number): void {
		this.y -= height;
	}

	paragraph(
		text: string,
		options: {
			size?: number;
			bold?: boolean;
			color?: string;
			indent?: number;
			leading?: number;
		} = {}
	): void {
		const size = options.size ?? 9.5;
		const leading = options.leading ?? size * 1.35;
		const indent = options.indent ?? 0;
		for (const line of wrapText(this.ctx, text, size, CONTENT_WIDTH - indent, options.bold)) {
			this.ensure(leading);
			this.y -= leading;
			drawText(this.page, this.ctx, line, MARGIN + indent, this.y + leading * 0.28, {
				size,
				bold: options.bold,
				color: options.color
			});
		}
	}

	heading(text: string): void {
		this.ensure(34);
		this.gap(8);
		this.paragraph(text, { size: 11.5, bold: true, color: this.ctx.palette.accent });
		this.gap(2);
	}
}
