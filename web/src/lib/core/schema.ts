import { z } from 'zod';
import '../security/zod.ts';
import { COLOR_PATTERN, safeColor } from '../security/color.ts';
import { LIMITS, storedLimit } from '../security/limits.ts';
import { normalizeLinkInput } from '../security/url.ts';

export const SCHEMA_VERSION = 1;

export const Mm = z.number().int();
export const PositiveMm = Mm.positive();

export const IdSchema = z.string().min(1).max(LIMITS.id);
export const NameTextSchema = z.string().max(LIMITS.name);
export const LabelTextSchema = z.string().max(LIMITS.label);
export const LongTextSchema = z.string().max(LIMITS.text);
export const TimestampSchema = z.string().max(LIMITS.timestamp);

export const HttpUrlSchema = z.url({ protocol: /^https?$/ }).max(LIMITS.url);
export const ColorTextSchema = z.string().max(LIMITS.color).regex(COLOR_PATTERN);

// Stored and backed-up projects drop an unusable link or colour instead of failing to load, so one bad value never locks a project.
const StoredLinkSchema = z.preprocess(
	(value) => (value === undefined ? undefined : normalizeLinkInput(value)),
	HttpUrlSchema.optional()
);
export const StoredColorSchema = z.preprocess(
	(value) => (value === undefined ? undefined : safeColor(value)),
	ColorTextSchema.optional()
);

export const PointSchema = z.object({ x: Mm, y: Mm });

export const LocalizedSchema = z.object({
	de: z.string().max(LIMITS.caption),
	en: z.string().max(LIMITS.caption)
});

export const ROOM_TYPES = [
	'living',
	'bedroom',
	'office',
	'kitchen',
	'bath',
	'kids',
	'hall',
	'dining',
	'storage',
	'other'
] as const;
export const RoomTypeSchema = z.enum(ROOM_TYPES);

export const ELEMENT_STATUSES = ['existing', 'planned', 'suggested'] as const;
export const ElementStatusSchema = z.enum(ELEMENT_STATUSES);

export const WALL_ELEMENT_KINDS = [
	'door',
	'window',
	'builtin',
	'obstacle',
	'socket',
	'switch',
	'wallLamp',
	'dataPort',
	'radiator'
] as const;
export const ELEMENT_KINDS = [...WALL_ELEMENT_KINDS, 'ceilingLamp'] as const;
export const ELECTRICAL_KINDS = [
	'socket',
	'switch',
	'wallLamp',
	'dataPort',
	'ceilingLamp'
] as const;

const elementBase = {
	id: IdSchema,
	status: ElementStatusSchema,
	note: LongTextSchema.optional(),
	reason: LongTextSchema.optional()
};

const wallPlacement = {
	wall: z.number().int().min(1),
	offset: Mm,
	width: PositiveMm,
	height: PositiveMm,
	elevation: Mm.min(0)
};

export const DoorSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('door'),
	hinge: z.enum(['start', 'end']),
	swing: z.enum(['in', 'out', 'sliding'])
});

export const WindowSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('window'),
	windowType: z.enum(['tiltTurn', 'sliding', 'fixed', 'balconyDoor'])
});

export const BuiltinSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('builtin'),
	depth: PositiveMm
});

export const ObstacleSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('obstacle'),
	depth: PositiveMm
});

export const SocketSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('socket'),
	gang: z.number().int().min(1).max(8),
	usb: z.boolean()
});

export const SwitchSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('switch')
});

export const WallLampSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('wallLamp')
});

export const DataPortSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('dataPort'),
	portType: z.enum(['lan', 'tv', 'both'])
});

export const RadiatorSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('radiator'),
	depth: PositiveMm
});

export const CeilingLampSchema = z.object({
	...elementBase,
	kind: z.literal('ceilingLamp'),
	x: Mm,
	y: Mm
});

export const WallElementSchema = z.discriminatedUnion('kind', [
	DoorSchema,
	WindowSchema,
	BuiltinSchema,
	ObstacleSchema,
	SocketSchema,
	SwitchSchema,
	WallLampSchema,
	DataPortSchema,
	RadiatorSchema
]);

export const ElementSchema = z.discriminatedUnion('kind', [
	DoorSchema,
	WindowSchema,
	BuiltinSchema,
	ObstacleSchema,
	SocketSchema,
	SwitchSchema,
	WallLampSchema,
	DataPortSchema,
	RadiatorSchema,
	CeilingLampSchema
]);

export const PERSPECTIVE_KINDS = ['corner', 'wall', 'ceiling', 'floor', 'element', 'free'] as const;

export const PerspectiveSchema = z.object({
	kind: z.enum(PERSPECTIVE_KINDS),
	ref: LabelTextSchema.optional(),
	stepKey: LabelTextSchema.optional(),
	caption: LocalizedSchema
});

export const PhotoSchema = z.object({
	id: IdSchema,
	hash: z.string().regex(/^[0-9a-f]{64}$/),
	perspective: PerspectiveSchema,
	w: z.number().int().positive(),
	h: z.number().int().positive(),
	takenAt: TimestampSchema,
	note: LongTextSchema.optional()
});

export const ITEM_CATEGORIES = [
	'bed',
	'sofa',
	'armchair',
	'chair',
	'officeChair',
	'table',
	'desk',
	'wardrobe',
	'shelf',
	'dresser',
	'sideboard',
	'tvUnit',
	'nightstand',
	'lamp',
	'rug',
	'plant',
	'picture',
	'mirror',
	'curtain',
	'textile',
	'decor',
	'electronics',
	'other'
] as const;
export const ItemCategorySchema = z.enum(ITEM_CATEGORIES);

export const MODEL_TYPES = [
	'box',
	'bed',
	'sofa',
	'cornerSofa',
	'armchair',
	'chair',
	'officeChair',
	'stool',
	'table',
	'roundTable',
	'desk',
	'wardrobe',
	'shelf',
	'cubeShelf',
	'wallShelf',
	'dresser',
	'sideboard',
	'nightstand',
	'monitor',
	'tv',
	'pc',
	'printer',
	'smallDevice',
	'speaker',
	'monitorArm',
	'powerStrip',
	'plant',
	'hangingPlant',
	'rug',
	'roundRug',
	'picture',
	'mirror',
	'curtain',
	'cushion',
	'throw',
	'vase',
	'basket',
	'books',
	'clock',
	'floorLamp',
	'tableLamp',
	'pendantLamp',
	'wallLamp',
	'ledStrip'
] as const;
export const ModelTypeSchema = z.enum(MODEL_TYPES);

export const MOUNTS = ['floor', 'wall', 'ceiling', 'on-top'] as const;
export const MountSchema = z.enum(MOUNTS);

export const DimsSchema = z.object({ w: PositiveMm, d: PositiveMm, h: PositiveMm });

export const ItemSchema = z.object({
	id: IdSchema,
	roomId: IdSchema,
	catalogId: LabelTextSchema.optional(),
	name: NameTextSchema,
	category: ItemCategorySchema,
	model: ModelTypeSchema.optional(),
	mount: MountSchema.optional(),
	dims: DimsSchema,
	x: Mm,
	y: Mm,
	rotation: z.number(),
	elevation: Mm,
	onItemId: IdSchema.optional(),
	color: StoredColorSchema,
	power: z.number().int().min(0).optional(),
	priceChf: z.number().min(0).optional(),
	url: StoredLinkSchema,
	note: LongTextSchema.optional(),
	locked: z.boolean().optional()
});

export const SuggestionSchema = z.object({
	roomId: IdSchema,
	element: ElementSchema
});

export const ShoppingEntrySchema = z.object({
	catalogId: LabelTextSchema.optional(),
	name: NameTextSchema,
	qty: z.number().int().min(1),
	priceChf: z.number().min(0).optional(),
	url: StoredLinkSchema
});

export const VariantSchema = z.object({
	id: IdSchema,
	name: NameTextSchema,
	source: z.enum(['user', 'ai']),
	items: z.array(ItemSchema).max(storedLimit('itemsPerVariant')),
	suggestions: z.array(SuggestionSchema).max(storedLimit('suggestionsPerVariant')),
	roomNotes: z.record(IdSchema, LongTextSchema).optional(),
	shoppingList: z.array(ShoppingEntrySchema).max(storedLimit('shoppingEntries')).optional()
});

export const WorkstationSchema = z.object({
	monitors: z.number().int().min(0),
	monitorInch: z.number().positive().optional(),
	computer: z.enum(['laptop', 'pc', 'both']).optional(),
	sitStand: z.boolean().optional(),
	devices: z.array(LabelTextSchema).max(storedLimit('briefList')).optional()
});

export const KeepItemSchema = z.object({
	name: NameTextSchema,
	dims: DimsSchema.optional()
});

export const BriefSchema = z.object({
	persons: z.object({
		adults: z.number().int().min(0),
		children: z.number().int().min(0),
		childAges: z.array(z.number().min(0)).max(storedLimit('briefList')).optional(),
		pets: NameTextSchema.optional()
	}),
	bedSizes: z.array(LabelTextSchema).max(storedLimit('briefList')).default([]),
	workstations: z.array(WorkstationSchema).max(storedLimit('briefList')).default([]),
	style: LongTextSchema.optional(),
	budgetChf: z.number().min(0).optional(),
	retailers: z.array(LabelTextSchema).max(storedLimit('briefList')).optional(),
	keep: z.array(KeepItemSchema).max(storedLimit('briefKeep')).optional(),
	wishes: LongTextSchema.optional()
});

export const BoardPosSchema = z.object({ x: Mm, y: Mm, rot: z.number() });

export const SlopeSchema = z.object({
	wall: z.number().int().min(1),
	kneeHeight: Mm.min(0),
	angle: z.number().min(5).max(85)
});

export const RoomSchema = z.object({
	id: IdSchema,
	name: NameTextSchema,
	type: RoomTypeSchema,
	polygon: z.array(PointSchema).min(3).max(storedLimit('polygonPoints')),
	height: PositiveMm,
	boardPos: BoardPosSchema,
	elements: z.array(ElementSchema).max(storedLimit('elementsPerRoom')),
	photos: z.array(PhotoSchema).max(storedLimit('photosPerRoom')),
	slopes: z.array(SlopeSchema).max(storedLimit('polygonPoints')).optional(),
	separate: z.boolean().optional(),
	floorColor: StoredColorSchema,
	wallColor: StoredColorSchema,
	notes: LongTextSchema.optional()
});

export const ProjectSchema = z.object({
	id: IdSchema,
	name: NameTextSchema,
	schemaVersion: z.literal(SCHEMA_VERSION),
	rev: z.number().int().min(0),
	createdAt: TimestampSchema,
	updatedAt: TimestampSchema,
	deleted: z.boolean().optional(),
	brief: BriefSchema.optional(),
	rooms: z.array(RoomSchema).max(storedLimit('rooms')),
	variants: z.array(VariantSchema).max(storedLimit('variants')),
	activeVariantId: IdSchema.optional()
});

export type Point = z.infer<typeof PointSchema>;
export type Localized = z.infer<typeof LocalizedSchema>;
export type RoomType = z.infer<typeof RoomTypeSchema>;
export type ElementStatus = z.infer<typeof ElementStatusSchema>;
export type WallElementKind = (typeof WALL_ELEMENT_KINDS)[number];
export type ElementKind = (typeof ELEMENT_KINDS)[number];
export type ElectricalKind = (typeof ELECTRICAL_KINDS)[number];
export type Door = z.infer<typeof DoorSchema>;
export type Window = z.infer<typeof WindowSchema>;
export type Builtin = z.infer<typeof BuiltinSchema>;
export type Obstacle = z.infer<typeof ObstacleSchema>;
export type Socket = z.infer<typeof SocketSchema>;
export type Switch = z.infer<typeof SwitchSchema>;
export type WallLamp = z.infer<typeof WallLampSchema>;
export type DataPort = z.infer<typeof DataPortSchema>;
export type Radiator = z.infer<typeof RadiatorSchema>;
export type CeilingLamp = z.infer<typeof CeilingLampSchema>;
export type WallElement = z.infer<typeof WallElementSchema>;
export type RoomElement = z.infer<typeof ElementSchema>;
export type Perspective = z.infer<typeof PerspectiveSchema>;
export type PerspectiveKind = (typeof PERSPECTIVE_KINDS)[number];
export type Photo = z.infer<typeof PhotoSchema>;
export type ItemCategory = z.infer<typeof ItemCategorySchema>;
export type ModelType = z.infer<typeof ModelTypeSchema>;
export type Mount = z.infer<typeof MountSchema>;
export type Dims = z.infer<typeof DimsSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Suggestion = z.infer<typeof SuggestionSchema>;
export type ShoppingEntry = z.infer<typeof ShoppingEntrySchema>;
export type Variant = z.infer<typeof VariantSchema>;
export type Workstation = z.infer<typeof WorkstationSchema>;
export type Brief = z.infer<typeof BriefSchema>;
export type BoardPos = z.infer<typeof BoardPosSchema>;
export type Slope = z.infer<typeof SlopeSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type Project = z.infer<typeof ProjectSchema>;

export function isWallElement(element: RoomElement): element is WallElement {
	return element.kind !== 'ceilingLamp';
}

export function isElectrical(element: RoomElement): boolean {
	return (ELECTRICAL_KINDS as readonly string[]).includes(element.kind);
}
