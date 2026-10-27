import { z } from 'zod';
import '../security/zod.ts';
import { COLOR_PATTERN, safeColor } from '../security/color.ts';
import { LIMITS, storedLimit } from '../security/limits.ts';
import { normalizeLinkInput } from '../security/url.ts';

export const SCHEMA_VERSION = 2;

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
	'other',
	'balcony',
	'terrace',
	'garden',
	'winterGarden'
] as const;
export const RoomTypeSchema = z.enum(ROOM_TYPES);
// Open-air areas have no walls and no ceiling, only a floor outline. A winter garden has glass
// walls and a glass roof. None of them counts towards the living area.
export const OPEN_AIR_TYPES = ['balcony', 'terrace', 'garden'] as const;
export const OUTDOOR_TYPES = [...OPEN_AIR_TYPES, 'winterGarden'] as const;

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
	'radiator',
	'washbasin',
	'toilet',
	'shower',
	'bathtub',
	'kitchenRun',
	'acWall'
] as const;
// Free elements stand anywhere in the room (x, y = centre, rotation like furniture: 0 = front
// towards +y). The ceiling lamp keeps its older, simpler shape (x, y only).
export const FREE_ELEMENT_KINDS = [
	'column',
	'freeObstacle',
	'fireplace',
	'stove',
	'tiledStove',
	'acFloor'
] as const;
export const FIRE_KINDS = ['fireplace', 'stove', 'tiledStove'] as const;
// Elements in the plane of a roof slope.
export const SLOPE_ELEMENT_KINDS = ['roofWindow'] as const;
export const ELEMENT_KINDS = [
	...WALL_ELEMENT_KINDS,
	'ceilingLamp',
	...FREE_ELEMENT_KINDS,
	...SLOPE_ELEMENT_KINDS
] as const;
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

export const WashbasinSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('washbasin'),
	depth: PositiveMm
});

export const ToiletSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('toilet'),
	depth: PositiveMm
});

// A shower or bathtub at offset 0 or at the wall end sits in that corner.
export const ShowerSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('shower'),
	depth: PositiveMm,
	screen: z.boolean().optional()
});

export const BathtubSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('bathtub'),
	depth: PositiveMm
});

export const KITCHEN_GRIDS = ['sms', 'euro'] as const;
export const KITCHEN_MODULE_KINDS = ['base', 'sink', 'hob', 'dishwasher', 'tall', 'table'] as const;
export const KITCHEN_APPLIANCES = ['oven', 'steamer', 'microwave', 'fridge'] as const;

export const KitchenModuleSchema = z.object({
	id: IdSchema,
	kind: z.enum(KITCHEN_MODULE_KINDS),
	width: PositiveMm,
	appliances: z.array(z.enum(KITCHEN_APPLIANCES)).max(KITCHEN_APPLIANCES.length).optional()
});

// A kitchen run along a wall: width = length of the run, height = worktop height. Modules sit
// side by side from the start of the run; a stretch without module is a plain base cabinet.
// Tall modules reach tallHeight and carry no worktop; upper cabinets hang above the others.
export const KitchenRunSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('kitchenRun'),
	depth: PositiveMm,
	grid: z.enum(KITCHEN_GRIDS),
	tallHeight: PositiveMm,
	modules: z.array(KitchenModuleSchema).max(storedLimit('elementsPerRoom')),
	upper: z.object({ depth: PositiveMm, height: PositiveMm, elevation: Mm.min(0) }).optional()
});

// Wall unit of an air conditioner; clearance = free zone in front of the air outlet.
export const AcWallSchema = z.object({
	...elementBase,
	...wallPlacement,
	kind: z.literal('acWall'),
	depth: PositiveMm,
	clearance: Mm.min(0)
});

const freePlacement = {
	x: Mm,
	y: Mm,
	rotation: z.number(),
	width: PositiveMm,
	depth: PositiveMm,
	height: PositiveMm,
	elevation: Mm.min(0)
};

// toCeiling: the element reaches the ceiling (or the cover outdoors) wherever it stands; height
// is then only the stored fallback.
export const ColumnSchema = z.object({
	...elementBase,
	...freePlacement,
	kind: z.literal('column'),
	shape: z.enum(['round', 'square']),
	toCeiling: z.boolean().optional()
});

export const FreeObstacleSchema = z.object({
	...elementBase,
	...freePlacement,
	kind: z.literal('freeObstacle'),
	toCeiling: z.boolean().optional()
});

// Fireplaces keep furniture out of a zone of depth "clearance" in front of the firebox opening.
export const FireplaceSchema = z.object({
	...elementBase,
	...freePlacement,
	kind: z.literal('fireplace'),
	clearance: Mm.min(0)
});

export const StoveSchema = z.object({
	...elementBase,
	...freePlacement,
	kind: z.literal('stove'),
	clearance: Mm.min(0)
});

export const TiledStoveSchema = z.object({
	...elementBase,
	...freePlacement,
	kind: z.literal('tiledStove'),
	clearance: Mm.min(0)
});

export const AcFloorSchema = z.object({
	...elementBase,
	...freePlacement,
	kind: z.literal('acFloor'),
	clearance: Mm.min(0)
});

// A roof window lies in the slope that covers "offset" on its wall: width along the wall, length
// up the slope, elevation = height of its lower edge above the floor.
export const RoofWindowSchema = z.object({
	...elementBase,
	kind: z.literal('roofWindow'),
	wall: z.number().int().min(1),
	offset: Mm,
	width: PositiveMm,
	length: PositiveMm,
	elevation: Mm.min(0)
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
	RadiatorSchema,
	WashbasinSchema,
	ToiletSchema,
	ShowerSchema,
	BathtubSchema,
	KitchenRunSchema,
	AcWallSchema
]);

export const FreeElementSchema = z.discriminatedUnion('kind', [
	ColumnSchema,
	FreeObstacleSchema,
	FireplaceSchema,
	StoveSchema,
	TiledStoveSchema,
	AcFloorSchema
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
	WashbasinSchema,
	ToiletSchema,
	ShowerSchema,
	BathtubSchema,
	KitchenRunSchema,
	AcWallSchema,
	CeilingLampSchema,
	ColumnSchema,
	FreeObstacleSchema,
	FireplaceSchema,
	StoveSchema,
	TiledStoveSchema,
	AcFloorSchema,
	RoofWindowSchema
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
	'kitchen',
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
	'ledStrip',
	'kitchenBase',
	'kitchenWall',
	'kitchenTall',
	'kitchenSink',
	'hob',
	'oven',
	'fridge'
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

// Within [from, to] along the slope wall the ceiling is at least "height" (at most the room
// height). A dormer as high as the room cuts the slope there, which is how a slope covers only
// part of a wall with vertical cheeks at its ends.
export const DormerSchema = z.object({
	id: IdSchema,
	from: Mm.min(0),
	to: Mm,
	height: PositiveMm
});

// The ceiling starts on the wall at kneeHeight and rises at angle until it meets the flat
// ceiling. from/to limit the slope to a stretch of the wall (distance from the wall start);
// without them it covers the whole wall line, as before version 2.
export const SlopeSchema = z.object({
	id: IdSchema,
	wall: z.number().int().min(1),
	kneeHeight: Mm.min(0),
	angle: z.number().min(5).max(85),
	from: Mm.min(0).optional(),
	to: Mm.optional(),
	dormers: z.array(DormerSchema).max(storedLimit('polygonPoints')).optional()
});

export const RailingSchema = z.object({ height: PositiveMm });

// Roof over an open-air area (balcony above, pergola): polygon in room coordinates, height of
// its underside above the floor.
export const CoverSchema = z.object({
	polygon: z.array(PointSchema).min(3).max(storedLimit('polygonPoints')),
	height: PositiveMm
});

// open: kitchen in a living or dining room ("open kitchen"). mode builtin = fixed kitchen
// elements, catalog = kitchen furniture from the catalogue that can be planned freely.
export const KitchenSettingsSchema = z.object({
	open: z.boolean().optional(),
	mode: z.enum(['builtin', 'catalog']).optional()
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
	floorId: IdSchema.optional(),
	railing: RailingSchema.optional(),
	cover: CoverSchema.optional(),
	kitchen: KitchenSettingsSchema.optional(),
	floorColor: StoredColorSchema,
	wallColor: StoredColorSchema,
	notes: LongTextSchema.optional()
});

// Floors are listed from bottom to top. height = clear room height of the floor (empty: highest
// room on it), slabThickness = slab above the floor's rooms.
export const FloorSchema = z.object({
	id: IdSchema,
	name: NameTextSchema,
	slabThickness: Mm.min(0),
	height: PositiveMm.optional()
});

export const STAIR_SHAPES = ['straight', 'l', 'u', 'spiral'] as const;

// A stair leads from fromFloorId to the next floor up. x, y, rotation are board coordinates of
// the foot of the stair (middle of the front edge of the first step, rotation 0 = walking towards
// +y, like furniture). turn: side to which an L, U or spiral stair turns.
export const StairSchema = z.object({
	id: IdSchema,
	fromFloorId: IdSchema,
	shape: z.enum(STAIR_SHAPES),
	x: Mm,
	y: Mm,
	rotation: z.number(),
	width: PositiveMm,
	turn: z.enum(['left', 'right'])
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
	floors: z.array(FloorSchema).max(storedLimit('floors')).optional(),
	stairs: z.array(StairSchema).max(storedLimit('stairs')).optional(),
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
export type Washbasin = z.infer<typeof WashbasinSchema>;
export type Toilet = z.infer<typeof ToiletSchema>;
export type Shower = z.infer<typeof ShowerSchema>;
export type Bathtub = z.infer<typeof BathtubSchema>;
export type KitchenGrid = (typeof KITCHEN_GRIDS)[number];
export type KitchenModuleKind = (typeof KITCHEN_MODULE_KINDS)[number];
export type KitchenAppliance = (typeof KITCHEN_APPLIANCES)[number];
export type KitchenModule = z.infer<typeof KitchenModuleSchema>;
export type KitchenRun = z.infer<typeof KitchenRunSchema>;
export type AcWall = z.infer<typeof AcWallSchema>;
export type Column = z.infer<typeof ColumnSchema>;
export type FreeObstacle = z.infer<typeof FreeObstacleSchema>;
export type Fireplace = z.infer<typeof FireplaceSchema>;
export type Stove = z.infer<typeof StoveSchema>;
export type TiledStove = z.infer<typeof TiledStoveSchema>;
export type AcFloor = z.infer<typeof AcFloorSchema>;
export type RoofWindow = z.infer<typeof RoofWindowSchema>;
export type FreeElement = z.infer<typeof FreeElementSchema>;
export type FreeElementKind = (typeof FREE_ELEMENT_KINDS)[number];
export type FireKind = (typeof FIRE_KINDS)[number];
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
export type Dormer = z.infer<typeof DormerSchema>;
export type Slope = z.infer<typeof SlopeSchema>;
export type Railing = z.infer<typeof RailingSchema>;
export type Cover = z.infer<typeof CoverSchema>;
export type KitchenSettings = z.infer<typeof KitchenSettingsSchema>;
export type OpenAirType = (typeof OPEN_AIR_TYPES)[number];
export type OutdoorType = (typeof OUTDOOR_TYPES)[number];
export type Floor = z.infer<typeof FloorSchema>;
export type StairShape = (typeof STAIR_SHAPES)[number];
export type Stair = z.infer<typeof StairSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type Project = z.infer<typeof ProjectSchema>;

export function isWallElement(element: RoomElement): element is WallElement {
	return (WALL_ELEMENT_KINDS as readonly string[]).includes(element.kind);
}

export function isFreeElement(element: RoomElement): element is FreeElement {
	return (FREE_ELEMENT_KINDS as readonly string[]).includes(element.kind);
}

export function isFireElement(element: RoomElement): element is Fireplace | Stove | TiledStove {
	return (FIRE_KINDS as readonly string[]).includes(element.kind);
}

export function isRoofWindow(element: RoomElement): element is RoofWindow {
	return element.kind === 'roofWindow';
}

export function isOpenAir(room: Pick<Room, 'type'>): boolean {
	return (OPEN_AIR_TYPES as readonly string[]).includes(room.type);
}

export function isOutdoor(room: Pick<Room, 'type'>): boolean {
	return (OUTDOOR_TYPES as readonly string[]).includes(room.type);
}

export function isElectrical(element: RoomElement): boolean {
	return (ELECTRICAL_KINDS as readonly string[]).includes(element.kind);
}
