import { buildExport, ExportSchema, type ExportDocument } from '#lib/core/export.ts';
import type { Project, Room } from '#lib/core/schema.ts';
import type { Language } from '#lib/core/units.ts';
import { isTooLarge } from './layout.ts';
import { buildPdf, type PdfFonts, type RoomImages } from './pdf.ts';
import { exportFileName } from './slug.ts';

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
}

export interface PackageFile {
	name: string;
	data: Uint8Array;
	type: string;
}

export interface PackageResult {
	pdf: PackageFile;
	json: PackageFile;
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
	const jsonData = new TextEncoder().encode(JSON.stringify(document, null, 2));
	options.onProgress?.(1);
	return {
		pdf: {
			name: exportFileName(project.name, 'pdf', date),
			data: pdf.bytes,
			type: 'application/pdf'
		},
		json: {
			name: exportFileName(project.name, 'json', date),
			data: jsonData,
			type: 'application/json'
		},
		pageCount: pdf.pageCount,
		tooLarge: isTooLarge(pdf.pageCount, pdf.bytes.length + jsonData.length),
		document
	};
}
