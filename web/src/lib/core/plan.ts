import { z } from 'zod';
import { LIMITS } from '../security/limits.ts';
import {
	BriefSchema,
	DimsSchema,
	HttpUrlSchema,
	IdSchema,
	ItemCategorySchema,
	LabelTextSchema,
	LongTextSchema,
	Mm,
	ModelTypeSchema,
	NameTextSchema,
	ShoppingEntrySchema,
	StoredColorSchema
} from './schema.ts';

export const PLAN_FORMAT = 'roomx-plan';
export const PLAN_SCHEMA_VERSION = 1;

export const ANCHOR_SIDES = ['back', 'left', 'right'] as const;

export const AnchorSchema = z.object({
	wall: z.number().int().min(1),
	offset: Mm,
	gap: Mm.min(0).optional(),
	side: z.enum(ANCHOR_SIDES).optional()
});

// An empty link counts as no link; anything else must be a real http(s) link.
export const PlanUrlSchema = z.preprocess(
	(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
	HttpUrlSchema.optional()
);

export const PlanShoppingEntrySchema = ShoppingEntrySchema.extend({ url: PlanUrlSchema });

export const PlanItemSchema = z.object({
	id: IdSchema.optional(),
	catalogId: LabelTextSchema.optional(),
	name: NameTextSchema.optional(),
	category: ItemCategorySchema.optional(),
	model: ModelTypeSchema.optional(),
	dims: DimsSchema.optional(),
	color: StoredColorSchema,
	anchor: AnchorSchema.optional(),
	x: Mm.optional(),
	y: Mm.optional(),
	rotation: z.number().optional(),
	on: IdSchema.optional(),
	elevation: Mm.min(0).optional(),
	priceChf: z.number().min(0).optional(),
	url: PlanUrlSchema,
	note: LongTextSchema.optional(),
	locked: z.boolean().optional()
});

export const PLAN_ELECTRICAL_KINDS = [
	'socket',
	'switch',
	'wallLamp',
	'dataPort',
	'ceilingLamp'
] as const;

export const PlanElectricalSchema = z.object({
	kind: z.enum(PLAN_ELECTRICAL_KINDS),
	wall: z.number().int().min(1).optional(),
	offset: Mm.optional(),
	elevation: Mm.min(0).optional(),
	gang: z.number().int().min(1).max(8).optional(),
	usb: z.boolean().optional(),
	portType: z.enum(['lan', 'tv', 'both']).optional(),
	x: Mm.optional(),
	y: Mm.optional(),
	reason: LongTextSchema.optional()
});

export const PlanRoomSchema = z.object({
	roomId: IdSchema,
	items: z.array(PlanItemSchema).max(LIMITS.planItemsPerRoom).default([]),
	electrical: z.array(PlanElectricalSchema).max(LIMITS.planElectricalPerRoom).default([]),
	notes: LongTextSchema.optional()
});

export const PlanVariantSchema = z.object({
	name: NameTextSchema.min(1),
	rooms: z.array(PlanRoomSchema).min(1).max(LIMITS.planRooms),
	shoppingList: z.array(PlanShoppingEntrySchema).max(LIMITS.shoppingEntries).optional()
});

export const PlanSchema = z.object({
	format: z.literal(PLAN_FORMAT),
	schemaVersion: z.literal(PLAN_SCHEMA_VERSION),
	projectId: IdSchema,
	brief: BriefSchema.optional(),
	variants: z.array(PlanVariantSchema).min(1).max(LIMITS.planVariants)
});

export type Anchor = z.infer<typeof AnchorSchema>;
export type AnchorSide = (typeof ANCHOR_SIDES)[number];
export type PlanItem = z.infer<typeof PlanItemSchema>;
export type PlanElectrical = z.infer<typeof PlanElectricalSchema>;
export type PlanRoom = z.infer<typeof PlanRoomSchema>;
export type PlanVariant = z.infer<typeof PlanVariantSchema>;
export type Plan = z.infer<typeof PlanSchema>;

export function planJsonSchema(): unknown {
	return z.toJSONSchema(PlanSchema, { io: 'input' });
}
