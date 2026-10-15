import { z } from 'zod';

export const SCHEMA_VERSION = 1;

export const Mm = z.number().int();
export const PositiveMm = Mm.positive();

export const PointSchema = z.object({ x: Mm, y: Mm });

export const LocalizedSchema = z.object({ de: z.string(), en: z.string() });

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
	id: z.string().min(1),
	status: ElementStatusSchema,
	note: z.string().optional(),
	reason: z.string().optional()
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
	ref: z.string().optional(),
	stepKey: z.string().optional(),
	caption: LocalizedSchema
});

export const PhotoSchema = z.object({
	id: z.string().min(1),
	hash: z.string().regex(/^[0-9a-f]{64}$/),
	perspective: PerspectiveSchema,
	w: z.number().int().positive(),
	h: z.number().int().positive(),
	takenAt: z.string(),
	note: z.string().optional()
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
	id: z.string().min(1),
	roomId: z.string().min(1),
	catalogId: z.string().optional(),
	name: z.string(),
	category: ItemCategorySchema,
	model: ModelTypeSchema.optional(),
	mount: MountSchema.optional(),
	dims: DimsSchema,
	x: Mm,
	y: Mm,
	rotation: z.number(),
	elevation: Mm,
	onItemId: z.string().optional(),
	color: z.string().optional(),
	power: z.number().int().min(0).optional(),
	priceChf: z.number().min(0).optional(),
	url: z.string().optional(),
	note: z.string().optional(),
	locked: z.boolean().optional()
});

export const SuggestionSchema = z.object({
	roomId: z.string().min(1),
	element: ElementSchema
});

export const ShoppingEntrySchema = z.object({
	catalogId: z.string().optional(),
	name: z.string(),
	qty: z.number().int().min(1),
	priceChf: z.number().min(0).optional(),
	url: z.string().optional()
});

export const VariantSchema = z.object({
	id: z.string().min(1),
	name: z.string(),
	source: z.enum(['user', 'ai']),
	items: z.array(ItemSchema),
	suggestions: z.array(SuggestionSchema),
	roomNotes: z.record(z.string(), z.string()).optional(),
	shoppingList: z.array(ShoppingEntrySchema).optional()
});

export const WorkstationSchema = z.object({
	monitors: z.number().int().min(0),
	monitorInch: z.number().positive().optional(),
	computer: z.enum(['laptop', 'pc', 'both']).optional(),
	sitStand: z.boolean().optional(),
	devices: z.array(z.string()).optional()
});

export const KeepItemSchema = z.object({
	name: z.string(),
	dims: DimsSchema.optional()
});

export const BriefSchema = z.object({
	persons: z.object({
		adults: z.number().int().min(0),
		children: z.number().int().min(0),
		childAges: z.array(z.number().min(0)).optional(),
		pets: z.string().optional()
	}),
	bedSizes: z.array(z.string()).default([]),
	workstations: z.array(WorkstationSchema).default([]),
	style: z.string().optional(),
	budgetChf: z.number().min(0).optional(),
	retailers: z.array(z.string()).optional(),
	keep: z.array(KeepItemSchema).optional(),
	wishes: z.string().optional()
});

export const BoardPosSchema = z.object({ x: Mm, y: Mm, rot: z.number() });

export const SlopeSchema = z.object({
	wall: z.number().int().min(1),
	kneeHeight: Mm.min(0),
	angle: z.number().min(5).max(85)
});

export const RoomSchema = z.object({
	id: z.string().min(1),
	name: z.string(),
	type: RoomTypeSchema,
	polygon: z.array(PointSchema).min(3),
	height: PositiveMm,
	boardPos: BoardPosSchema,
	elements: z.array(ElementSchema),
	photos: z.array(PhotoSchema),
	slopes: z.array(SlopeSchema).optional(),
	separate: z.boolean().optional(),
	floorColor: z.string().optional(),
	wallColor: z.string().optional(),
	notes: z.string().optional()
});

export const ProjectSchema = z.object({
	id: z.string().min(1),
	name: z.string(),
	schemaVersion: z.literal(SCHEMA_VERSION),
	rev: z.number().int().min(0),
	createdAt: z.string(),
	updatedAt: z.string(),
	deleted: z.boolean().optional(),
	brief: BriefSchema.optional(),
	rooms: z.array(RoomSchema),
	variants: z.array(VariantSchema),
	activeVariantId: z.string().optional()
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
