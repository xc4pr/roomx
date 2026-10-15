import { z } from 'zod';
import { LIMITS } from '../security/limits.ts';
import {
	DimsSchema,
	HttpUrlSchema,
	ItemCategorySchema,
	LabelTextSchema,
	LocalizedSchema,
	ModelTypeSchema,
	MountSchema
} from './schema.ts';

export const CatalogEntrySchema = z.object({
	id: z
		.string()
		.max(LIMITS.id)
		.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
	brand: LabelTextSchema,
	series: LabelTextSchema.optional(),
	name: LocalizedSchema,
	category: ItemCategorySchema,
	model: ModelTypeSchema,
	dims: DimsSchema,
	colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/)).min(1),
	mount: MountSchema,
	power: z.number().int().min(0),
	clearance: z.object({ front: z.number().int().min(0), side: z.number().int().min(0) }),
	priceChf: z.number().min(0).optional(),
	url: HttpUrlSchema.optional(),
	articleNo: LabelTextSchema.optional(),
	verified: z.boolean()
});

export const CatalogSchema = z.array(CatalogEntrySchema);

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type CatalogLookup = (id: string) => CatalogEntry | undefined;
export type CatalogAliases = Readonly<Record<string, string>>;

export function catalogLookup(
	entries: readonly CatalogEntry[],
	aliases: CatalogAliases = {}
): CatalogLookup {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	return (id) => byId.get(id) ?? (Object.hasOwn(aliases, id) ? byId.get(aliases[id]) : undefined);
}
