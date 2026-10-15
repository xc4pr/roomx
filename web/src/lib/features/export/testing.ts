import { readFileSync } from 'node:fs';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { createElement } from '#lib/core/defaults.ts';
import { sampleLookup, sampleProject } from '#lib/core/fixtures.ts';
import { resolvePlan } from '#lib/core/planResolve.ts';
import { samplePlan } from '#lib/core/fixtures.ts';
import { sequentialIds } from '#lib/core/ids.ts';
import type { Project } from '#lib/core/schema.ts';
import type { PdfFonts } from './pdf.ts';

const FONT_DIR = new URL('../../../../node_modules/@fontsource/figtree/files/', import.meta.url);

function woffToSfnt(woff: Uint8Array): Uint8Array {
	const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
	const count = view.getUint16(12);
	const tables = Array.from({ length: count }, (_, index) => {
		const at = 44 + index * 20;
		const offset = view.getUint32(at + 4);
		const compLength = view.getUint32(at + 8);
		const length = view.getUint32(at + 12);
		const stored = woff.subarray(offset, offset + compLength);
		return {
			tag: view.getUint32(at),
			checksum: view.getUint32(at + 16),
			data: compLength < length ? new Uint8Array(inflateSync(stored)) : stored
		};
	});
	const directory = 12 + count * 16;
	const total = tables.reduce((sum, table) => sum + ((table.data.length + 3) & ~3), directory);
	const out = new Uint8Array(total);
	const sfnt = new DataView(out.buffer);
	const entrySelector = Math.floor(Math.log2(count));
	const searchRange = 16 * 2 ** entrySelector;
	sfnt.setUint32(0, view.getUint32(4));
	sfnt.setUint16(4, count);
	sfnt.setUint16(6, searchRange);
	sfnt.setUint16(8, entrySelector);
	sfnt.setUint16(10, count * 16 - searchRange);
	let cursor = directory;
	tables.forEach((table, index) => {
		const at = 12 + index * 16;
		sfnt.setUint32(at, table.tag);
		sfnt.setUint32(at + 4, table.checksum);
		sfnt.setUint32(at + 8, cursor);
		sfnt.setUint32(at + 12, table.data.length);
		out.set(table.data, cursor);
		cursor += (table.data.length + 3) & ~3;
	});
	return out;
}

let cachedFonts: PdfFonts | undefined;

export function loadTestFonts(): PdfFonts {
	cachedFonts ??= {
		regular: woffToSfnt(
			new Uint8Array(readFileSync(new URL('figtree-latin-400-normal.woff', FONT_DIR)))
		),
		bold: woffToSfnt(
			new Uint8Array(readFileSync(new URL('figtree-latin-600-normal.woff', FONT_DIR)))
		)
	};
	return cachedFonts;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const body = new Uint8Array(4 + data.length);
	body.set(new TextEncoder().encode(type));
	body.set(data, 4);
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	out.set(body, 4);
	view.setUint32(8 + data.length, crc32(body));
	return out;
}

export function testPng(width = 64, height = 48, shade = 140): Uint8Array {
	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, width);
	view.setUint32(4, height);
	header[8] = 8;
	header[9] = 2;
	const row = new Uint8Array(1 + width * 3);
	for (let x = 0; x < width; x++) {
		row[1 + x * 3] = (shade + x * 2) % 256;
		row[2 + x * 3] = shade;
		row[3 + x * 3] = 200;
	}
	const raw = new Uint8Array(row.length * height);
	for (let y = 0; y < height; y++) raw.set(row, y * row.length);
	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', new Uint8Array(deflateSync(raw))),
		chunk('IEND', new Uint8Array(0))
	];
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

export function furnishedProject(photoHash = 'a'.repeat(64)): Project {
	const project = sampleProject();
	project.name = 'Wohnung Müller-Köhler';
	project.brief = {
		persons: { adults: 2, children: 1, childAges: [4] },
		bedSizes: ['160x200'],
		workstations: [{ monitors: 2, monitorInch: 27, computer: 'laptop', devices: ['Dock'] }],
		style: 'ruhig, hell',
		budgetChf: 3000,
		wishes: 'Grosse Pflanze am Fenster, Schränke bis zur Decke.'
	};
	const room = project.rooms[0];
	room.elements.push(
		createElement('socket', room, 4, 600, sequentialIds('e')),
		{
			id: 'builtin-1',
			kind: 'builtin',
			status: 'existing',
			wall: 1,
			offset: 1600,
			width: 1200,
			height: 2300,
			elevation: 0,
			depth: 600
		},
		{ id: 'lamp-1', kind: 'ceilingLamp', status: 'existing', x: 2000, y: 1500 }
	);
	room.photos.push({
		id: 'photo-1',
		hash: photoHash,
		perspective: {
			kind: 'corner',
			ref: 'A',
			caption: { de: 'Ecke A, von der Tür aus', en: 'Corner A, seen from the door' }
		},
		w: 64,
		h: 48,
		takenAt: '2026-01-01T00:00:00.000Z',
		note: 'Heizung links'
	});
	const resolved = resolvePlan(samplePlan(), project, sampleLookup, { newId: sequentialIds('v') });
	project.variants = resolved.variants;
	project.activeVariantId = resolved.variants[0]?.id;
	return project;
}
