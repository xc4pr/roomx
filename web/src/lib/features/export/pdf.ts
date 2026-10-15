import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFImage, type PDFPage } from 'pdf-lib';
import { CATALOG_PRICES_AS_OF, lookup as catalogLookupDefault } from '#lib/catalog/index.ts';
import type { CatalogLookup } from '#lib/core/catalog.ts';
import { mirroredOpenings, wallLinks, withMirroredOpenings } from '#lib/core/adjacency.ts';
import { areaM2 } from '#lib/core/defaults.ts';
import {
	cornerLabel,
	interiorAngle,
	perimeter,
	wall as findWall,
	walls
} from '#lib/core/geometry.ts';
import type { Item, Project, Room, RoomElement } from '#lib/core/schema.ts';
import { isWallElement } from '#lib/core/schema.ts';
import { formatArea, formatChf, formatDate, lengthValue, type Language } from '#lib/core/units.ts';
import { elementKindNames, roomTypeNames } from '#lib/i18n/common.ts';
import { formatMonthYear } from '#lib/features/furnish/format.ts';
import { briefLines } from './brief.ts';
import { messages } from './i18n.ts';
import {
	CONTENT_BOTTOM,
	CONTENT_WIDTH,
	MARGIN,
	PAGE_WIDTH,
	packBlocks,
	planPhotoPages
} from './layout.ts';
import { PAPER_PALETTE, type Palette } from './palette.ts';
import { buildWallBlock, drawLegend, drawRoomPlan, planLegend } from './pdfPlan.ts';
import { hasSlopes, slopeSummary } from './pdfSlopes.ts';
import {
	Flow,
	drawText,
	polygon,
	safeText,
	strokeLine,
	textWidth,
	wrapText,
	type PdfContext
} from './pdfKit.ts';
import { translator } from './text.ts';

export interface PdfFonts {
	regular: Uint8Array;
	bold: Uint8Array;
}

export interface RoomImages {
	top: Uint8Array;
	iso: Uint8Array[];
}

export interface PdfProgress {
	done: number;
	total: number;
}

export interface PdfInput {
	project: Project;
	roomIds?: readonly string[];
	language: Language;
	fonts: PdfFonts;
	date?: Date;
	palette?: Palette;
	lookup?: CatalogLookup;
	includePhotos?: boolean;
	renderViews?: (room: Room, variantId: string | undefined) => Promise<RoomImages | undefined>;
	loadPhoto?: (hash: string) => Promise<Uint8Array | undefined>;
	onProgress?: (progress: PdfProgress) => void;
	signal?: AbortSignal;
}

export interface PdfResult {
	bytes: Uint8Array;
	pageCount: number;
	photoPages: Record<string, number>;
}

const ISO_KEYS = ['viewIso1', 'viewIso2', 'viewIso3', 'viewIso4'] as const;

function isPng(bytes: Uint8Array): boolean {
	return bytes[0] === 0x89 && bytes[1] === 0x50;
}

async function embedImage(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
	return isPng(bytes) ? doc.embedPng(bytes) : doc.embedJpg(bytes);
}

function drawImageFitted(
	page: PDFPage,
	image: PDFImage,
	box: { x: number; y: number; w: number; h: number },
	top = false
): void {
	const factor = Math.min(box.w / image.width, box.h / image.height);
	const w = image.width * factor;
	const h = image.height * factor;
	page.drawImage(image, {
		x: box.x + (box.w - w) / 2,
		y: top ? box.y + box.h - h : box.y + (box.h - h) / 2,
		width: w,
		height: h
	});
}

function truncate(ctx: PdfContext, text: string, size: number, maxWidth: number): string {
	let out = safeText(ctx, text).replace(/\n/g, ' ');
	if (textWidth(ctx, out, size) <= maxWidth) return out;
	while (out.length > 1 && textWidth(ctx, `${out}…`, size) > maxWidth) out = out.slice(0, -1);
	return `${out.trimEnd()}…`;
}

function roomStats(ctx: PdfContext, room: Room): string {
	return ctx.tr('roomStats', {
		area: formatArea(areaM2(room.polygon) * 1_000_000, ctx.language),
		perimeter: lengthValue(Math.round(perimeter(room.polygon)), 'm', ctx.language),
		height: room.height,
		walls: room.polygon.length
	});
}

function roomSubtitle(ctx: PdfContext, room: Room): string {
	return `${roomTypeNames[ctx.language][room.type]} · ${ctx.tr('idLabel')} ${room.id}`;
}

function drawTitlePage(ctx: PdfContext, project: Project, rooms: Room[], date: Date): void {
	const tr = ctx.tr;
	const flow = new Flow(
		ctx,
		project.name || tr('untitled'),
		`${tr('packageLabel')} · ${formatDate(date.toISOString(), ctx.language)} · ${tr('unitsNote')}`
	);
	flow.paragraph(`${tr('idLabel')} ${project.id}`, { size: 8, color: ctx.palette.muted });
	flow.heading(tr('sectionRooms'));
	rooms.forEach((room, index) => {
		flow.paragraph(`${index + 1}. ${room.name}`, { size: 10, bold: true });
		flow.paragraph(`${roomSubtitle(ctx, room)}`, { size: 8, color: ctx.palette.muted, indent: 12 });
		flow.paragraph(roomStats(ctx, room), { size: 8.5, indent: 12 });
	});
	if (rooms.length === 0) flow.paragraph(tr('none'));
	flow.heading(tr('sectionBrief'));
	const lines = briefLines(project.brief, tr, ctx.language);
	if (lines.length === 0) flow.paragraph(tr('briefNone'));
	for (const line of lines) flow.paragraph(`- ${line}`, { size: 9, indent: 6 });
	const active = project.variants.find((variant) => variant.id === project.activeVariantId);
	if (project.variants.length > 0) {
		flow.heading(tr('sectionVariants'));
		for (const variant of project.variants) {
			const mark = variant.id === active?.id ? ` (${tr('activeVariant')})` : '';
			flow.paragraph(`- ${variant.name}${mark}`, { size: 9, indent: 6 });
		}
	}
	flow.heading(tr('sectionGuide'));
	for (const key of ['guide1', 'guide2', 'guide3', 'guide4', 'guide5', 'guide6'] as const) {
		flow.paragraph(`- ${tr(key)}`, { size: 9, indent: 6 });
	}
	flow.gap(8);
	flow.ensure(46);
	const bottom = drawLegend(
		flow.page,
		ctx,
		MARGIN,
		flow.y - 6,
		CONTENT_WIDTH,
		planLegend(
			ctx,
			true,
			rooms.some((room) => hasSlopes(room))
		)
	);
	flow.y = bottom - 12;
}

function cornerText(ctx: PdfContext, room: Room): string {
	return room.polygon
		.map(
			(corner, index) =>
				`${cornerLabel(index)} (${corner.x}|${corner.y}) ${Math.round(interiorAngle(room.polygon, index))}°`
		)
		.join(' · ');
}

function wallText(ctx: PdfContext, room: Room): string {
	return walls(room.polygon)
		.map(
			(target) =>
				`${target.number}: ${cornerLabel(target.startIndex)}-${cornerLabel(target.endIndex)} ${Math.round(target.length)}`
		)
		.join(' · ');
}

function drawPlanPage(ctx: PdfContext, room: Room): void {
	const tr = ctx.tr;
	const flow = new Flow(ctx, room.name, roomSubtitle(ctx, room));
	flow.paragraph(roomStats(ctx, room), { size: 9.5, bold: true });
	const slopes = slopeSummary(ctx, room);
	if (slopes) flow.paragraph(slopes, { size: 8.5 });
	flow.paragraph(`${tr('cornersLabel')}: ${cornerText(ctx, room)}`, {
		size: 8,
		color: ctx.palette.muted
	});
	flow.paragraph(`${tr('wallsLabel')}: ${wallText(ctx, room)}`, {
		size: 8,
		color: ctx.palette.muted
	});
	flow.gap(4);
	const legendHeight = 50;
	const box = {
		x: MARGIN,
		y: CONTENT_BOTTOM + legendHeight,
		w: CONTENT_WIDTH,
		h: flow.y - (CONTENT_BOTTOM + legendHeight)
	};
	const result = drawRoomPlan(flow.page, ctx, room, { box, align: 'top' });
	const legendTop = CONTENT_BOTTOM + legendHeight - 8;
	drawLegend(
		flow.page,
		ctx,
		MARGIN,
		legendTop,
		CONTENT_WIDTH,
		planLegend(ctx, false, hasSlopes(room))
	);
	drawText(
		flow.page,
		ctx,
		tr('scaleNote', { scale: result.paperScale }),
		MARGIN + CONTENT_WIDTH,
		CONTENT_BOTTOM + 2,
		{
			size: 8,
			align: 'right',
			color: ctx.palette.muted
		}
	);
}

function drawWallPages(ctx: PdfContext, room: Room): void {
	const roomWalls = walls(room.polygon);
	if (roomWalls.length === 0) return;
	const title = ctx.tr('wallsTitle', { room: room.name });
	const subtitle = ctx.tr('wallsSubtitle');
	const first = new Flow(ctx, title, subtitle);
	const blocks = roomWalls.map((target) =>
		buildWallBlock(ctx, room, target, MARGIN, CONTENT_WIDTH)
	);
	const groups = packBlocks(
		blocks.map((block) => block.height),
		first.remaining,
		10
	);
	groups.forEach((group, groupIndex) => {
		const flow = groupIndex === 0 ? first : new Flow(ctx, title, subtitle);
		let top = flow.y;
		for (const index of group) {
			blocks[index].draw(flow.page, top);
			top -= blocks[index].height + 10;
		}
	});
}

async function drawViewsPage(ctx: PdfContext, room: Room, images: RoomImages): Promise<void> {
	const tr = ctx.tr;
	const flow = new Flow(ctx, tr('viewsTitle', { room: room.name }), tr('viewsSubtitle'));
	const gap = 12;
	const labelHeight = 14;
	const cell = Math.min((CONTENT_WIDTH - gap) / 2, (flow.remaining - 3 * (labelHeight + gap)) / 3);
	const entries: { label: string; bytes: Uint8Array }[] = [
		{ label: tr('viewTop'), bytes: images.top },
		...images.iso.slice(0, 4).map((bytes, index) => ({ label: tr(ISO_KEYS[index]), bytes }))
	];
	const left = MARGIN + (CONTENT_WIDTH - (cell * 2 + gap)) / 2;
	for (let index = 0; index < entries.length; index++) {
		const column = index % 2;
		const row = Math.floor(index / 2);
		const x = left + column * (cell + gap);
		const top = flow.y - row * (cell + labelHeight + gap);
		drawText(flow.page, ctx, entries[index].label, x, top - 9, { size: 8.5, bold: true });
		const image = await embedImage(ctx.doc, entries[index].bytes);
		const frame = { x, y: top - labelHeight - cell, w: cell, h: cell };
		polygon(
			flow.page,
			[
				{ x: frame.x, y: frame.y },
				{ x: frame.x + cell, y: frame.y },
				{ x: frame.x + cell, y: frame.y + cell },
				{ x: frame.x, y: frame.y + cell }
			],
			{ color: ctx.palette.line, width: 0.6 }
		);
		drawImageFitted(flow.page, image, frame);
	}
	const noteX = left + (cell + gap);
	const noteTop = flow.y - 2 * (cell + labelHeight + gap) - 9;
	const lines = wrapText(ctx, tr('viewsNote'), 8.5, cell);
	lines.forEach((line, index) => {
		drawText(flow.page, ctx, line, noteX, noteTop - index * 11, {
			size: 8.5,
			color: ctx.palette.muted
		});
	});
}

function suggestionLines(
	ctx: PdfContext,
	room: Room,
	suggestions: readonly RoomElement[]
): string[] {
	return suggestions.map((element) => {
		const reason = element.reason ? ` · ${element.reason}` : '';
		const name = elementKindNames[ctx.language][element.kind];
		if (!isWallElement(element)) {
			return ctx.tr('suggestionCeiling', { name, x: element.x, y: element.y, reason });
		}
		const target = findWall(room.polygon, element.wall);
		return ctx.tr('suggestionWall', {
			name,
			wall: element.wall,
			a: target ? cornerLabel(target.startIndex) : '',
			offset: element.offset,
			elevation: element.elevation,
			reason
		});
	});
}

function drawFurnishPages(ctx: PdfContext, project: Project, room: Room): void {
	const variant = project.variants.find((candidate) => candidate.id === project.activeVariantId);
	if (!variant) return;
	const items = variant.items.filter((item) => item.roomId === room.id);
	const suggestions = variant.suggestions
		.filter((suggestion) => suggestion.roomId === room.id)
		.map((suggestion) => suggestion.element);
	if (items.length === 0 && suggestions.length === 0) return;
	const tr = ctx.tr;
	const flow = new Flow(
		ctx,
		tr('furnishTitle', { room: room.name }),
		tr('furnishSubtitle', { variant: variant.name })
	);
	const legendHeight = 4;
	const planHeight = Math.min(430, flow.remaining - 120);
	const box = { x: MARGIN, y: flow.y - planHeight, w: CONTENT_WIDTH, h: planHeight };
	const result = drawRoomPlan(flow.page, ctx, room, { box, items, extraElements: suggestions });
	flow.y = box.y - 10;
	const legendEnd = drawLegend(
		flow.page,
		ctx,
		MARGIN,
		flow.y,
		CONTENT_WIDTH,
		planLegend(ctx, true, hasSlopes(room))
	);
	drawText(
		flow.page,
		ctx,
		tr('scaleNote', { scale: result.paperScale }),
		MARGIN + CONTENT_WIDTH,
		legendEnd - 2,
		{
			size: 8,
			align: 'right',
			color: ctx.palette.muted
		}
	);
	flow.y = legendEnd - 14 - legendHeight;
	const note = variant.roomNotes?.[room.id];
	if (note) {
		flow.paragraph(tr('roomNote'), { size: 9, bold: true });
		flow.paragraph(note, { size: 9 });
		flow.gap(4);
	}
	if (items.length > 0) drawItemTable(ctx, flow, items);
	if (suggestions.length > 0) {
		flow.heading(tr('sectionSuggestions'));
		for (const line of suggestionLines(ctx, room, suggestions)) {
			flow.paragraph(`- ${line}`, { size: 8.5, indent: 6 });
		}
	}
}

function drawItemTable(ctx: PdfContext, flow: Flow, items: readonly Item[]): void {
	const tr = ctx.tr;
	const columns = [
		{ x: 0, label: '#' },
		{ x: 20, label: tr('colName') },
		{ x: 200, label: tr('colDims') },
		{ x: 290, label: tr('colPosition') },
		{ x: 370, label: tr('colRotation') },
		{ x: 415, label: tr('colElevation') },
		{ x: 470, label: tr('colPrice') }
	];
	const header = () => {
		flow.ensure(26);
		flow.y -= 12;
		for (const column of columns) {
			drawText(flow.page, ctx, column.label, MARGIN + column.x, flow.y, {
				size: 8,
				bold: true,
				color: ctx.palette.muted
			});
		}
		flow.y -= 4;
		strokeLine(
			flow.page,
			{ x: MARGIN, y: flow.y },
			{ x: MARGIN + CONTENT_WIDTH, y: flow.y },
			{
				width: 0.5,
				color: ctx.palette.line
			}
		);
	};
	const unverified = (item: Item) =>
		item.catalogId !== undefined && ctx.lookup(item.catalogId)?.verified === false;
	header();
	items.forEach((item, index) => {
		if (flow.remaining < 14) {
			flow.ensure(1000);
			header();
		}
		flow.y -= 12;
		const name = item.locked ? `${item.name} (${tr('locked')})` : item.name;
		const cells = [
			String(index + 1),
			truncate(ctx, name, 8, 172),
			`${item.dims.w} × ${item.dims.d} × ${item.dims.h}${unverified(item) ? ' *' : ''}`,
			`${item.x} | ${item.y}`,
			`${Math.round(item.rotation)}°`,
			String(item.elevation),
			item.priceChf !== undefined ? formatChf(item.priceChf, ctx.language) : ''
		];
		cells.forEach((text, column) => {
			drawText(flow.page, ctx, text, MARGIN + columns[column].x, flow.y, { size: 8 });
		});
	});
	flow.gap(4);
	if (items.some(unverified)) {
		flow.paragraph(tr('unverifiedNote'), { size: 7.5, color: ctx.palette.muted });
	}
	if (items.some((item) => item.priceChf !== undefined || item.catalogId !== undefined)) {
		flow.paragraph(tr('priceNote', { date: formatMonthYear(CATALOG_PRICES_AS_OF, ctx.language) }), {
			size: 7.5,
			color: ctx.palette.muted
		});
	}
	flow.gap(6);
}

async function drawPhotoPages(
	ctx: PdfContext,
	rooms: readonly Room[],
	input: PdfInput,
	photoPages: Record<string, number>,
	tick: () => void
): Promise<void> {
	const tr = ctx.tr;
	const slots = planPhotoPages(rooms.map((room) => room.photos.length));
	for (const slot of slots) {
		input.signal?.throwIfAborted();
		const room = rooms[slot.roomIndex];
		const flow = new Flow(ctx, tr('photosTitle', { room: room.name }), roomSubtitle(ctx, room));
		const gap = 14;
		const cellHeight = (flow.remaining - gap * (slot.photoIndexes.length - 1)) / 2;
		let top = flow.y;
		for (const photoIndex of slot.photoIndexes) {
			const photo = room.photos[photoIndex];
			const caption = photo.perspective.caption;
			let y = top;
			y -= 11;
			drawText(flow.page, ctx, caption.de, MARGIN, y, { size: 10, bold: true });
			y -= 11;
			drawText(flow.page, ctx, caption.en, MARGIN, y, { size: 9, color: ctx.palette.muted });
			const meta = [
				tr(`persp_${photo.perspective.kind}`),
				photo.perspective.ref ? `${tr('refLabel')} ${photo.perspective.ref}` : '',
				photo.note ?? ''
			]
				.filter(Boolean)
				.join(' · ');
			const metaLines = wrapText(ctx, meta, 8, CONTENT_WIDTH).slice(0, 2);
			for (const line of metaLines) {
				y -= 10;
				drawText(flow.page, ctx, line, MARGIN, y, { size: 8, color: ctx.palette.muted });
			}
			const imageBox = {
				x: MARGIN,
				y: top - cellHeight,
				w: CONTENT_WIDTH,
				h: y - 5 - (top - cellHeight)
			};
			const bytes = await input.loadPhoto?.(photo.hash);
			if (bytes) {
				const image = await embedImage(ctx.doc, bytes);
				drawImageFitted(flow.page, image, imageBox, true);
				photoPages[photo.id] = ctx.doc.getPageCount();
			} else {
				polygon(
					flow.page,
					[
						{ x: imageBox.x, y: imageBox.y },
						{ x: imageBox.x + imageBox.w, y: imageBox.y },
						{ x: imageBox.x + imageBox.w, y: imageBox.y + imageBox.h },
						{ x: imageBox.x, y: imageBox.y + imageBox.h }
					],
					{ color: ctx.palette.line, width: 0.8, dash: [4, 3] }
				);
				drawText(
					flow.page,
					ctx,
					tr('photoMissing'),
					imageBox.x + imageBox.w / 2,
					imageBox.y + imageBox.h / 2,
					{
						size: 9,
						align: 'center',
						color: ctx.palette.muted
					}
				);
			}
			tick();
			top -= cellHeight + gap;
		}
	}
}

function drawFooters(ctx: PdfContext, project: Project, date: Date): void {
	const pages = ctx.doc.getPages();
	const left = `roomx · ${project.name} · ${formatDate(date.toISOString(), ctx.language)}`;
	pages.forEach((page, index) => {
		strokeLine(
			page,
			{ x: MARGIN, y: 44 },
			{ x: PAGE_WIDTH - MARGIN, y: 44 },
			{
				width: 0.5,
				color: ctx.palette.line
			}
		);
		drawText(page, ctx, truncate(ctx, left, 8, CONTENT_WIDTH - 80), MARGIN, 30, {
			size: 8,
			color: ctx.palette.muted
		});
		drawText(
			page,
			ctx,
			ctx.tr('pageOf', { page: index + 1, total: pages.length }),
			PAGE_WIDTH - MARGIN,
			30,
			{
				size: 8,
				align: 'right',
				color: ctx.palette.muted
			}
		);
	});
}

export async function buildPdf(input: PdfInput): Promise<PdfResult> {
	const { project, language } = input;
	const date = input.date ?? new Date();
	const rooms = project.rooms.filter((room) => !input.roomIds || input.roomIds.includes(room.id));
	const photoCount =
		input.includePhotos === false ? 0 : rooms.reduce((sum, room) => sum + room.photos.length, 0);
	const total = 1 + rooms.length * 4 + photoCount;
	let done = 0;
	const tick = () => input.onProgress?.({ done: Math.min(++done, total), total });
	input.onProgress?.({ done: 0, total });

	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const font = await doc.embedFont(input.fonts.regular, { subset: true });
	const bold = await doc.embedFont(input.fonts.bold, { subset: true });
	const ctx: PdfContext = {
		doc,
		lookup: input.lookup ?? catalogLookupDefault,
		font,
		bold,
		palette: input.palette ?? PAPER_PALETTE,
		language,
		tr: translator(messages, language),
		known: new Set(font.getCharacterSet()),
		knownBold: new Set(bold.getCharacterSet())
	};
	doc.setTitle(`roomx - ${project.name}`);
	doc.setCreator('roomx');
	doc.setProducer('roomx');
	doc.setLanguage(language);
	doc.setCreationDate(date);
	doc.setModificationDate(date);

	const connected = new Map(withMirroredOpenings(project.rooms).map((room) => [room.id, room]));
	const names = new Map(project.rooms.map((room) => [room.id, room.name]));
	const neighbours = new Map<string, { wall: number; from: number; to: number; name: string }[]>();
	for (const link of wallLinks(project.rooms)) {
		const list = neighbours.get(link.roomId) ?? [];
		list.push({
			wall: link.wall,
			from: link.from,
			to: link.to,
			name: names.get(link.otherRoomId) ?? ''
		});
		neighbours.set(link.roomId, list);
	}
	const mirrored = mirroredOpenings(project.rooms);
	ctx.links = {
		shared: new Set(
			mirrored.flatMap((entry) => [entry.element.id, entry.element.id.split('@')[0]])
		),
		sources: new Map(
			mirrored.map((entry) => [entry.element.id, names.get(entry.sourceRoomId) ?? ''])
		),
		neighbours
	};

	drawTitlePage(ctx, project, rooms, date);
	tick();

	for (const source of rooms) {
		const room = connected.get(source.id) ?? source;
		input.signal?.throwIfAborted();
		drawPlanPage(ctx, room);
		drawWallPages(ctx, room);
		tick();
		input.signal?.throwIfAborted();
		const images = await input.renderViews?.(source, project.activeVariantId);
		if (images) await drawViewsPage(ctx, room, images);
		tick();
		drawFurnishPages(ctx, project, room);
		tick();
		tick();
	}

	const photoPages: Record<string, number> = {};
	if (input.includePhotos !== false) await drawPhotoPages(ctx, rooms, input, photoPages, tick);
	drawFooters(ctx, project, date);

	const bytes = await doc.save();
	input.onProgress?.({ done: total, total });
	return { bytes, pageCount: doc.getPageCount(), photoPages };
}
