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

const HexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/);

export const LOOK_BASES = ['none', 'plinth', 'feet', 'legs', 'frame'] as const;
export const LOOK_HANDLES = ['none', 'bar', 'knob', 'recessTop', 'hole'] as const;
export const LOOK_ROWS = ['drawer', 'door', 'flap', 'open', 'glass'] as const;

// One horizontal band of the front, listed from top to bottom; `weight` is its share of the front height.
export const LookRowSchema = z
	.object({
		kind: z.enum(LOOK_ROWS),
		cols: z.number().int().min(1).max(8),
		weight: z.number().positive().max(10).optional()
	})
	.strict();

// How a catalog article is built, so that the generic model of its type resembles the original.
// `base`: none = body on the floor, plinth = recessed toe kick, feet = short feet, legs = tall legs,
// frame = metal tube frame carrying the body. Heights in mm.
export const LookSchema = z
	.object({
		base: z.enum(LOOK_BASES).optional(),
		baseHeight: z.number().int().min(0).max(400).optional(),
		baseMaterial: z.enum(['wood', 'metal']).optional(),
		handle: z.enum(LOOK_HANDLES).optional(),
		rows: z.array(LookRowSchema).min(1).max(12).optional(),
		frontStyle: z.enum(['flat', 'frame']).optional(),
		top: z.enum(['flush', 'overhang']).optional(),
		books: z.boolean().optional(),
		frameColor: HexColorSchema.optional(),
		accentColor: HexColorSchema.optional()
	})
	.strict();

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
	colors: z.array(HexColorSchema).min(1),
	mount: MountSchema,
	power: z.number().int().min(0),
	clearance: z.object({ front: z.number().int().min(0), side: z.number().int().min(0) }),
	priceChf: z.number().min(0).optional(),
	url: HttpUrlSchema.optional(),
	articleNo: LabelTextSchema.optional(),
	verified: z.boolean(),
	look: LookSchema.optional()
});

export const CatalogSchema = z.array(CatalogEntrySchema);

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type Look = z.infer<typeof LookSchema>;
export type LookRow = z.infer<typeof LookRowSchema>;
export type CatalogLookup = (id: string) => CatalogEntry | undefined;
export type CatalogAliases = Readonly<Record<string, string>>;

export function catalogLookup(
	entries: readonly CatalogEntry[],
	aliases: CatalogAliases = {}
): CatalogLookup {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	return (id) => byId.get(id) ?? (Object.hasOwn(aliases, id) ? byId.get(aliases[id]) : undefined);
}
