import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { catalog, catalogAliases, lookup } from '#lib/catalog/index.ts';
import { mergeEntries } from '#lib/catalog/merge.ts';
import { CatalogSchema } from '#lib/core/catalog.ts';
import { ExportSchema } from '#lib/core/export.ts';
import { planJsonSchema } from '#lib/core/plan.ts';

const target = process.argv[2];
if (!target) throw new Error('usage: emit-contract <directory>');
mkdirSync(target, { recursive: true });

const write = (name: string, data: unknown) =>
	writeFileSync(join(target, name), `${JSON.stringify(data, null, '\t')}\n`);

const full: unknown = JSON.parse(
	readFileSync(new URL('../src/lib/catalog/data/full.json', import.meta.url), 'utf8')
);
if (!Array.isArray(full)) throw new Error('full.json is not a list');
const merged = mergeEntries(catalog, full, (id) => lookup(id) !== undefined);

write(
	'catalog.json',
	CatalogSchema.parse([...catalog, ...merged.accepted]).map((entry) => ({
		...entry,
		look: undefined
	}))
);
write('catalog-aliases.json', catalogAliases);
write('plan.schema.json', planJsonSchema());
write('export.schema.json', z.toJSONSchema(ExportSchema));
