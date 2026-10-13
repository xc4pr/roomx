import { z } from 'zod';
import {
	BriefSchema,
	DimsSchema,
	ItemCategorySchema,
	Mm,
	ModelTypeSchema,
	ShoppingEntrySchema
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

export const PlanItemSchema = z.object({
	id: z.string().min(1).optional(),
	catalogId: z.string().optional(),
	name: z.string().optional(),
	category: ItemCategorySchema.optional(),
	model: ModelTypeSchema.optional(),
	dims: DimsSchema.optional(),
	color: z.string().optional(),
	anchor: AnchorSchema.optional(),
	x: Mm.optional(),
	y: Mm.optional(),
	rotation: z.number().optional(),
	on: z.string().optional(),
	elevation: Mm.min(0).optional(),
	priceChf: z.number().min(0).optional(),
	url: z.string().optional(),
	note: z.string().optional(),
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
	reason: z.string().optional()
});

export const PlanRoomSchema = z.object({
	roomId: z.string().min(1),
	items: z.array(PlanItemSchema).default([]),
	electrical: z.array(PlanElectricalSchema).default([]),
	notes: z.string().optional()
});

export const PlanVariantSchema = z.object({
	name: z.string().min(1),
	rooms: z.array(PlanRoomSchema).min(1),
	shoppingList: z.array(ShoppingEntrySchema).optional()
});

export const PlanSchema = z.object({
	format: z.literal(PLAN_FORMAT),
	schemaVersion: z.literal(PLAN_SCHEMA_VERSION),
	projectId: z.string().min(1),
	brief: BriefSchema.optional(),
	variants: z.array(PlanVariantSchema).min(1)
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
