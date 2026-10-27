import type { CatalogEntry, CatalogLookup } from '#lib/core/catalog.ts';
import type { ExportDocument, ExportRoom, ExportWall } from '#lib/core/export.ts';
import { centroid } from '#lib/core/geometry.ts';
import {
	PLAN_FORMAT,
	PLAN_SCHEMA_VERSION,
	type Plan,
	type PlanElectrical,
	type PlanItem
} from '#lib/core/plan.ts';
import type { Brief } from '#lib/core/schema.ts';
import type { Language } from '#lib/core/units.ts';
import { instructionTexts } from './instructionsText.ts';
import { dateStamp } from './slug.ts';
import { translator, type Translate } from './text.ts';

type InstructionKey = keyof (typeof instructionTexts)['de'];

export interface PackageFileNames {
	instructions: string;
	pdf: string;
	json: string;
	schema: string;
	catalog: string;
	plan: string;
}

export interface InstructionsInput {
	document: ExportDocument;
	language: Language;
	date: Date;
	fileNames: PackageFileNames;
	pdfPages: number;
	partial: boolean;
	withoutPhotos?: boolean;
	lookup: CatalogLookup;
}

const DESKS = ['generic-desk-160x80', 'generic-desk-140x70', 'generic-desk-120x60'];
const MONITOR = 'generic-monitor-27';
const RUGS = ['generic-rug-120x180', 'generic-rug-80x150'];
const DESK_MARGIN = 100;
const SOCKET_WIDTH = 160;
const SOCKET_END_GAP = 100;
const SOCKET_ELEVATION = 1110;
const BIG_ROOM_SIDE = 2800;

const EXAMPLE_BRIEF: Brief = {
	persons: { adults: 2, children: 0 },
	bedSizes: [],
	workstations: [{ monitors: 1, monitorInch: 27 }],
	budgetChf: 2000
};

export function buildPrompt(language: Language, instructionsFile: string): string {
	return translator(instructionTexts, language)('prompt', { instructions: instructionsFile });
}

function roundTo10(value: number): number {
	return Math.round(value / 10) * 10;
}

function decimal(value: number, language: Language): string {
	const text = String(Math.round(value * 100) / 100);
	return language === 'de' ? text.replace('.', ',') : text;
}

const JSON_WIDTH = 110;

function inlineJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(inlineJson).join(', ')}]`;
	if (typeof value === 'object' && value !== null) {
		const entries = Object.entries(value);
		if (entries.length === 0) return '{}';
		return `{ ${entries.map(([key, entry]) => `${JSON.stringify(key)}: ${inlineJson(entry)}`).join(', ')} }`;
	}
	return JSON.stringify(value);
}

export function prettyJson(value: unknown, depth = 0): string {
	const flat = inlineJson(value);
	if (typeof value !== 'object' || value === null || flat.length + depth * 2 <= JSON_WIDTH) {
		return flat;
	}
	const pad = '  '.repeat(depth + 1);
	const end = '  '.repeat(depth);
	if (Array.isArray(value)) {
		return `[\n${value.map((entry) => pad + prettyJson(entry, depth + 1)).join(',\n')}\n${end}]`;
	}
	const rows = Object.entries(value).map(
		([key, entry]) => `${pad}${JSON.stringify(key)}: ${prettyJson(entry, depth + 1)}`
	);
	return `{\n${rows.join(',\n')}\n${end}}`;
}

function cell(text: string): string {
	return text.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|');
}

interface Span {
	wall: number;
	from: number;
	length: number;
}

function clearSpans(wall: ExportWall): { from: number; length: number }[] {
	const blocked = wall.elements
		.map((element) => ({
			from: element.offsetFromStart,
			to: element.offsetFromStart + element.width
		}))
		.sort((a, b) => a.from - b.from);
	const spans: { from: number; length: number }[] = [];
	let cursor = 0;
	for (const range of blocked) {
		if (range.from > cursor) spans.push({ from: cursor, length: range.from - cursor });
		cursor = Math.max(cursor, range.to);
	}
	if (wall.length > cursor) spans.push({ from: cursor, length: wall.length - cursor });
	return spans;
}

function longestClearSpan(room: ExportRoom): Span {
	let best: Span | undefined;
	for (const wall of room.walls) {
		for (const span of clearSpans(wall)) {
			if (!best || span.length > best.length) {
				best = { wall: wall.number, from: span.from, length: span.length };
			}
		}
	}
	const first = room.walls[0];
	return best ?? { wall: first?.number ?? 1, from: 0, length: first?.length ?? 0 };
}

function firstFitting(
	ids: readonly string[],
	lookup: CatalogLookup,
	fits: (entry: CatalogEntry) => boolean
): CatalogEntry | undefined {
	const entries = ids.flatMap((id) => lookup(id) ?? []);
	return entries.find(fits) ?? entries.at(-1);
}

export function examplePlan(
	document: ExportDocument,
	language: Language,
	lookup: CatalogLookup
): Plan | undefined {
	const room = document.rooms.find((candidate) => !candidate.outdoor) ?? document.rooms[0];
	if (!room) return undefined;
	const tr = translator(instructionTexts, language);
	const span = longestClearSpan(room);
	const desk = firstFitting(
		DESKS,
		lookup,
		(entry) => entry.dims.w + 2 * DESK_MARGIN <= span.length
	);
	const monitor = lookup(MONITOR);
	const xs = room.corners.map((corner) => corner.x);
	const ys = room.corners.map((corner) => corner.y);
	const smallSide = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
	const rug = firstFitting(RUGS, lookup, () => smallSide >= BIG_ROOM_SIDE);
	const items: PlanItem[] = [];
	const electrical: PlanElectrical[] = [];
	const bought: CatalogEntry[] = [];
	if (desk) {
		const offset = span.from + Math.max(0, Math.min(DESK_MARGIN, span.length - desk.dims.w));
		items.push({ id: 'desk', catalogId: desk.id, anchor: { wall: span.wall, offset } });
		bought.push(desk);
		if (monitor) {
			items.push({ catalogId: monitor.id, on: 'desk' });
			bought.push(monitor);
		}
		electrical.push({
			kind: 'socket',
			wall: span.wall,
			offset: Math.max(offset, offset + desk.dims.w - SOCKET_WIDTH - SOCKET_END_GAP),
			elevation: SOCKET_ELEVATION,
			gang: 2,
			reason: tr('exampleReason')
		});
	}
	if (rug) {
		const middle = centroid(room.corners);
		items.push({
			catalogId: rug.id,
			x: roundTo10(middle.x),
			y: roundTo10(middle.y),
			rotation: 0
		});
		bought.push(rug);
	}
	return {
		format: PLAN_FORMAT,
		schemaVersion: PLAN_SCHEMA_VERSION,
		projectId: document.project.id,
		brief: document.brief ?? EXAMPLE_BRIEF,
		variants: [
			{
				name: tr('exampleVariant'),
				rooms: [{ roomId: room.id, items, electrical, notes: tr('exampleNote') }],
				shoppingList: bought.map((entry) => ({
					catalogId: entry.id,
					name: entry.name[language],
					qty: 1,
					...(entry.priceChf !== undefined ? { priceChf: entry.priceChf } : {})
				}))
			}
		]
	};
}

function roomsTable(
	rooms: readonly ExportRoom[],
	language: Language,
	tr: Translate<InstructionKey>
): string {
	const rows = rooms.map(
		(room) =>
			`| ${cell(room.name)} | \`${room.id}\` | ${room.walls.length} | ${decimal(room.areaM2, language)} m² | ${room.height} mm |`
	);
	return [tr('roomsText'), ...rows].join('\n');
}

export function buildInstructions(input: InstructionsInput): string {
	const { document, language, date, fileNames, pdfPages, partial, lookup } = input;
	const tr = translator(instructionTexts, language);
	const projectId = document.project.id;
	const parts: string[] = [
		tr('title'),
		tr('meta', {
			project: document.project.name.replace(/[\r\n]+/g, ' '),
			projectId,
			date: dateStamp(date)
		}),
		[
			tr('promptHeading'),
			tr('promptIntro'),
			['```text', buildPrompt(language, fileNames.instructions), '```'].join('\n')
		].join('\n\n'),
		tr('role'),
		tr('filesText', {
			instructions: fileNames.instructions,
			pdf: fileNames.pdf,
			json: fileNames.json,
			schema: fileNames.schema,
			catalog: fileNames.catalog,
			pages: pdfPages
		}),
		roomsTable(document.rooms, language, tr)
	];
	if (partial) parts.push(tr('partialNote'));
	if (input.withoutPhotos) parts.push(tr('noPhotosNote'));
	parts.push(
		tr('workflowIntro'),
		tr('step1'),
		tr('step2'),
		tr('step3', { catalog: fileNames.catalog }),
		tr('step4', { schema: fileNames.schema }),
		tr('step5', { planFile: fileNames.plan, schema: fileNames.schema }),
		tr('step6'),
		tr('coords'),
		tr('format', { projectId, catalog: fileNames.catalog }),
		tr('rules')
	);
	const example = examplePlan(document, language, lookup);
	const room = document.rooms.find(
		(candidate) => candidate.id === example?.variants[0]?.rooms[0]?.roomId
	);
	if (example && room) {
		const wall = example.variants[0]?.rooms[0]?.items.find((item) => item.anchor)?.anchor?.wall;
		parts.push(
			[
				tr('exampleIntro', { room: room.name.replace(/[\r\n]+/g, ' '), roomId: room.id }),
				['```json', prettyJson(example), '```'].join('\n'),
				tr('exampleOutro', { wall: wall ?? 1 })
			].join('\n\n')
		);
	}
	if (document.rooms.some((candidate) => candidate.outdoor)) parts.push(tr('outdoor'));
	parts.push(tr('mistakes'));
	return `${parts.join('\n\n')}\n`;
}
