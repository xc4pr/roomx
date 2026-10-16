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
export const LOOK_ROWS = ['drawer', 'door', 'flap', 'open', 'glass', 'slide'] as const;
export const LOOK_LEGS = [
	'four',
	'trestle',
	'pedestal',
	'sled',
	'panel',
	'cross',
	'cantilever',
	'tframe',
	'splayed'
] as const;
export const LOOK_ARMS = ['none', 'slim', 'wide', 'rolled'] as const;
export const LOOK_BACKS = ['low', 'medium', 'high', 'wing'] as const;
export const LOOK_HEADBOARDS = ['none', 'panel', 'upholstered', 'slats', 'frame'] as const;
export const LOOK_SHAPES = ['rect', 'round', 'oval', 'arch'] as const;
export const LOOK_SHADES = ['none', 'drum', 'cone', 'dome', 'globe'] as const;
export const LOOK_STEMS = ['straight', 'arc', 'adjustable', 'tripod'] as const;

// One horizontal band of the front, listed from top to bottom; `weight` is its share of the front height.
export const LookRowSchema = z
	.object({
		kind: z.enum(LOOK_ROWS),
		cols: z.number().int().min(1).max(8),
		weight: z.number().positive().max(10).optional()
	})
	.strict();

// A vertical part of the front with its own rows, for fronts that differ side by side (doors left, drawers right).
export const LookSectionSchema = z
	.object({
		weight: z.number().positive().max(10).optional(),
		rows: z.array(LookRowSchema).min(1).max(12)
	})
	.strict();

// How a catalog article is built, so that the generic model of its type resembles the original.
// `base`: none = body on the floor, plinth = recessed toe kick, feet = short feet, legs = tall legs,
// frame = metal tube frame carrying the body. `sides`: ladder = open frame sides (IVAR). Heights in mm.
// Tables, desks, seating: `legs` is the stand (four legs, trestle, central pedestal, sled runners, side panels,
// crossed legs, cantilever frame like POÄNG, T-frame of a sit-stand desk, splayed = four legs angled outwards);
// `drawers` counts drawers (flat under a desk top, bed storage), `rows` give a desk its side unit; `shelf` adds a
// lower shelf. Seating: `arms`, `back` (wing = wing chair), `cushions` = seat cushions, `shape: round` = tub chair.
// Beds: `headboard`, `footboard`. Mirrors: `shape`, `border` (frame width, colour `frameColor`). Lamps: `shade`,
// `shadeColor`, `stem`; `frameColor` colours stem and base.
export const LookSchema = z
	.object({
		base: z.enum(LOOK_BASES).optional(),
		baseHeight: z.number().int().min(0).max(400).optional(),
		baseMaterial: z.enum(['wood', 'metal']).optional(),
		handle: z.enum(LOOK_HANDLES).optional(),
		rows: z.array(LookRowSchema).min(1).max(12).optional(),
		sections: z.array(LookSectionSchema).min(1).max(6).optional(),
		frontStyle: z.enum(['flat', 'frame']).optional(),
		sides: z.enum(['panel', 'ladder']).optional(),
		wheels: z.boolean().optional(),
		top: z.enum(['flush', 'overhang']).optional(),
		books: z.boolean().optional(),
		frameColor: HexColorSchema.optional(),
		accentColor: HexColorSchema.optional(),
		bodyColor: HexColorSchema.optional(),
		legs: z.enum(LOOK_LEGS).optional(),
		drawers: z.number().int().min(0).max(8).optional(),
		shelf: z.boolean().optional(),
		arms: z.enum(LOOK_ARMS).optional(),
		back: z.enum(LOOK_BACKS).optional(),
		cushions: z.number().int().min(1).max(6).optional(),
		headboard: z.enum(LOOK_HEADBOARDS).optional(),
		footboard: z.boolean().optional(),
		shape: z.enum(LOOK_SHAPES).optional(),
		border: z.enum(['none', 'thin', 'wide']).optional(),
		shade: z.enum(LOOK_SHADES).optional(),
		shadeColor: HexColorSchema.optional(),
		stem: z.enum(LOOK_STEMS).optional()
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
	// true: the retailer no longer sells it online; the entry stays so that old projects and plans still load.
	discontinued: z.boolean().optional(),
	look: LookSchema.optional()
});

export const CatalogSchema = z.array(CatalogEntrySchema);

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type Look = z.infer<typeof LookSchema>;
export type LookRow = z.infer<typeof LookRowSchema>;
export type LookSection = z.infer<typeof LookSectionSchema>;
export type CatalogLookup = (id: string) => CatalogEntry | undefined;
export type CatalogAliases = Readonly<Record<string, string>>;

export function catalogLookup(
	entries: readonly CatalogEntry[],
	aliases: CatalogAliases = {}
): CatalogLookup {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	return (id) => byId.get(id) ?? (Object.hasOwn(aliases, id) ? byId.get(aliases[id]) : undefined);
}
