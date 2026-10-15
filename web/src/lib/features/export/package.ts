import { catalog as defaultCatalog } from '#lib/catalog/index.ts';
import { catalogLookup, type CatalogEntry } from '#lib/core/catalog.ts';
import { buildExport, ExportSchema, type ExportDocument } from '#lib/core/export.ts';
import { planJsonSchema } from '#lib/core/plan.ts';
import type { Project, Room } from '#lib/core/schema.ts';
import type { Language } from '#lib/core/units.ts';
import { catalogJson } from './catalogFile.ts';
import { buildInstructions, buildPrompt } from './instructions.ts';
import { isTooLarge } from './layout.ts';
import { buildPdf, type PdfFonts, type RoomImages } from './pdf.ts';
import {
	CATALOG_FILE_NAME,
	exportFileName,
	instructionsFileName,
	packageZipName,
	planFileName,
	SCHEMA_FILE_NAME
} from './slug.ts';

export interface PackageDeps {
	loadFonts: () => Promise<PdfFonts>;
	loadPhoto?: (hash: string) => Promise<Uint8Array | undefined>;
	renderViews?: (
		project: Project,
		room: Room,
		variantId: string | undefined
	) => Promise<RoomImages | undefined>;
}

export interface PackageOptions {
	project: Project;
	roomIds?: readonly string[];
	language: Language;
	date?: Date;
	signal?: AbortSignal;
	onProgress?: (fraction: number) => void;
	catalog?: readonly CatalogEntry[];
	includePhotos?: boolean;
}

export interface PackageFile {
	name: string;
	data: Uint8Array;
	type: string;
}

export interface PackageResult {
	instructions: PackageFile;
	pdf: PackageFile;
	json: PackageFile;
	schema: PackageFile;
	catalog: PackageFile;
	files: PackageFile[];
	zipName: string;
	prompt: string;
	pageCount: number;
	tooLarge: boolean;
	document: ExportDocument;
}

export async function buildPackage(
	options: PackageOptions,
	deps: PackageDeps
): Promise<PackageResult> {
	const { project, roomIds, language } = options;
	const date = options.date ?? new Date();
	options.onProgress?.(0);
	const fonts = await deps.loadFonts();
	options.signal?.throwIfAborted();
	const pdf = await buildPdf({
		project,
		roomIds,
		language,
		fonts,
		date,
		loadPhoto: deps.loadPhoto,
		includePhotos: options.includePhotos,
		renderViews: deps.renderViews
			? (room, variantId) => deps.renderViews!(project, room, variantId)
			: undefined,
		signal: options.signal,
		onProgress: ({ done, total }) => options.onProgress?.(total > 0 ? (done / total) * 0.97 : 0)
	});
	options.signal?.throwIfAborted();
	const document = ExportSchema.parse(
		buildExport(project, {
			roomIds,
			photoPages: pdf.photoPages,
			exportedAt: date.toISOString()
		})
	);
	const encoder = new TextEncoder();
	const entries = options.catalog ?? defaultCatalog;
	const fileNames = {
		instructions: instructionsFileName(project.name, language, date),
		pdf: exportFileName(project.name, 'pdf', date),
		json: exportFileName(project.name, 'json', date),
		schema: SCHEMA_FILE_NAME,
		catalog: CATALOG_FILE_NAME,
		plan: planFileName(project.name)
	};
	const jsonData = encoder.encode(JSON.stringify(document, null, 2));
	const instructionsData = encoder.encode(
		buildInstructions({
			document,
			language,
			date,
			fileNames,
			pdfPages: pdf.pageCount,
			partial: roomIds !== undefined && roomIds.length < project.rooms.length,
			withoutPhotos: options.includePhotos === false,
			lookup: catalogLookup(entries)
		})
	);
	const schemaData = encoder.encode(`${JSON.stringify(planJsonSchema(), null, 2)}\n`);
	const catalogData = encoder.encode(catalogJson(entries, language));
	options.onProgress?.(1);
	const instructions = {
		name: fileNames.instructions,
		data: instructionsData,
		type: 'text/markdown'
	};
	const pdfFile = { name: fileNames.pdf, data: pdf.bytes, type: 'application/pdf' };
	const json = { name: fileNames.json, data: jsonData, type: 'application/json' };
	const schema = { name: fileNames.schema, data: schemaData, type: 'application/json' };
	const catalog = { name: fileNames.catalog, data: catalogData, type: 'application/json' };
	const files = [instructions, pdfFile, json, schema, catalog];
	return {
		instructions,
		pdf: pdfFile,
		json,
		schema,
		catalog,
		files,
		zipName: packageZipName(project.name, language, date),
		prompt: buildPrompt(language, fileNames.instructions),
		pageCount: pdf.pageCount,
		tooLarge: isTooLarge(
			pdf.pageCount,
			files.reduce((sum, file) => sum + file.data.length, 0)
		),
		document
	};
}
