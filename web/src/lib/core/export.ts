import { z } from 'zod';
import { wallLinks, withMirroredOpenings, type WallLink } from './adjacency.ts';
import { areaM2 } from './defaults.ts';
import {
	cornerLabel,
	doorSwing,
	freeWallSpans,
	interiorAngle,
	itemFootprint,
	perimeter,
	roundPoint,
	slopeRun,
	wallElementFootprint,
	wallElements,
	walls
} from './geometry.ts';
import {
	BriefSchema,
	ElementStatusSchema,
	ItemSchema,
	LocalizedSchema,
	Mm,
	PERSPECTIVE_KINDS,
	PointSchema,
	RoomTypeSchema,
	ShoppingEntrySchema,
	SuggestionSchema,
	ELEMENT_KINDS,
	isWallElement,
	type Project,
	type Room,
	type WallElement
} from './schema.ts';

export const EXPORT_FORMAT = 'roomx-export';
export const EXPORT_SCHEMA_VERSION = 1;

export const FORMAT_GUIDE = [
	'All lengths are millimetres, all angles degrees. Each room has its own coordinate system.',
	'A room is a polygon listed counter-clockwise with y pointing up: corner A is (0,0), wall 1 runs from A to B along +x, and the interior is always on the left of the walking direction.',
	'Corners are labelled A, B, C ...; wall n runs from corner n to corner n+1, the last wall closes back to A.',
	'Wall elements (doors, windows, built-ins, obstacles, sockets, switches, wall lamps, data ports, radiators) give "offsetFromStart": distance from the wall start corner to the nearer edge of the element, plus "offsetFromEnd", "width", "height" and "elevation" (lower edge above the floor).',
	'"freeSpans" lists the stretches of each wall not occupied by doors, windows, built-ins, obstacles or radiators.',
	'"doorSwings" and "windowZones" are floor areas that must stay clear.',
	'Furniture items give "x","y" (centre of the footprint), "rotation" (degrees counter-clockwise, 0 = front faces +y), "dims" (w = width of the front, d = depth, h = height), "elevation" and the four "footprint" corners.',
	'Walls may list "neighbours": the room on the other side of that wall, the shared stretch "from"-"to" along this wall and the "thickness" of the shared wall. Rooms with "separate": true are deliberately not connected to others (cellar, garage). A door or window in a shared wall appears in both rooms; in the neighbour it carries "sharedFrom" with the id of the original element.',
	'Element status is "existing" (built), "planned" (decided by the user) or "suggested" (proposal, not yet accepted).',
	'Rooms under a roof may list "slopes": the ceiling starts on that wall at "kneeHeight" and rises into the room at "angleDeg" until it meets the flat ceiling at "fullHeightAt" mm from the wall; "standingHeightAt" is the distance from the wall where 2000 mm clear height is reached. Furniture must fit under the slope.',
	'A furnishing plan is returned in the "roomx-plan" format and refers to rooms by "id"; items with "locked": true must not be moved or removed.'
].join(' ');

const SpanSchema = z.object({ from: Mm, to: Mm, length: Mm });

export const ExportWallElementSchema = z.object({
	id: z.string(),
	kind: z.enum(ELEMENT_KINDS),
	status: ElementStatusSchema,
	offsetFromStart: Mm,
	offsetFromEnd: Mm,
	width: Mm,
	height: Mm,
	elevation: Mm,
	top: Mm,
	depth: Mm.optional(),
	hinge: z.enum(['start', 'end']).optional(),
	swing: z.enum(['in', 'out', 'sliding']).optional(),
	windowType: z.enum(['tiltTurn', 'sliding', 'fixed', 'balconyDoor']).optional(),
	gang: z.number().int().optional(),
	usb: z.boolean().optional(),
	portType: z.enum(['lan', 'tv', 'both']).optional(),
	note: z.string().optional(),
	sharedFrom: z.string().optional()
});

export const ExportWallSchema = z.object({
	number: z.number().int(),
	from: z.string(),
	to: z.string(),
	start: PointSchema,
	end: PointSchema,
	length: Mm,
	directionDeg: z.number(),
	inwardNormalDeg: z.number(),
	elements: z.array(ExportWallElementSchema),
	freeSpans: z.array(SpanSchema),
	neighbours: z
		.array(
			z.object({
				roomId: z.string(),
				roomName: z.string(),
				wall: z.number().int(),
				from: Mm,
				to: Mm
			})
		)
		.optional()
});

export const ExportPhotoSchema = z.object({
	id: z.string(),
	kind: z.enum(PERSPECTIVE_KINDS),
	ref: z.string().optional(),
	caption: LocalizedSchema,
	note: z.string().optional(),
	pdfPage: z.number().int().optional()
});

export const ExportRoomSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: RoomTypeSchema,
	height: Mm,
	areaM2: z.number(),
	perimeter: Mm,
	corners: z.array(z.object({ label: z.string(), x: Mm, y: Mm, interiorAngleDeg: z.number() })),
	walls: z.array(ExportWallSchema),
	ceilingElements: z.array(
		z.object({
			id: z.string(),
			kind: z.literal('ceilingLamp'),
			status: ElementStatusSchema,
			x: Mm,
			y: Mm,
			note: z.string().optional()
		})
	),
	doorSwings: z.array(
		z.object({
			elementId: z.string(),
			wall: z.number().int(),
			hinge: PointSchema,
			radius: Mm,
			polygon: z.array(PointSchema)
		})
	),
	windowZones: z.array(
		z.object({
			elementId: z.string(),
			wall: z.number().int(),
			sillHeight: Mm,
			polygon: z.array(PointSchema)
		})
	),
	slopes: z
		.array(
			z.object({
				wall: z.number().int(),
				kneeHeight: Mm,
				angleDeg: z.number(),
				fullHeightAt: Mm,
				standingHeightAt: Mm.optional()
			})
		)
		.optional(),
	separate: z.boolean().optional(),
	floorColor: z.string().optional(),
	wallColor: z.string().optional(),
	notes: z.string().optional(),
	photos: z.array(ExportPhotoSchema)
});

export const ExportItemSchema = ItemSchema.extend({
	footprint: z.array(PointSchema).length(4)
});

export const ExportVariantSchema = z.object({
	id: z.string(),
	name: z.string(),
	source: z.enum(['user', 'ai']),
	active: z.boolean(),
	items: z.array(ExportItemSchema),
	suggestions: z.array(SuggestionSchema),
	roomNotes: z.record(z.string(), z.string()).optional(),
	shoppingList: z.array(ShoppingEntrySchema).optional(),
	totalChf: z.number()
});

export const ExportSchema = z.object({
	format: z.literal(EXPORT_FORMAT),
	schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
	exportedAt: z.string(),
	units: z.literal('mm'),
	formatGuide: z.string(),
	project: z.object({ id: z.string(), name: z.string() }),
	brief: BriefSchema.optional(),
	rooms: z.array(ExportRoomSchema),
	variants: z.array(ExportVariantSchema)
});

export type ExportWallElement = z.infer<typeof ExportWallElementSchema>;
export type ExportWall = z.infer<typeof ExportWallSchema>;
export type ExportRoom = z.infer<typeof ExportRoomSchema>;
export type ExportVariant = z.infer<typeof ExportVariantSchema>;
export type ExportDocument = z.infer<typeof ExportSchema>;

export const WINDOW_ZONE_DEPTH = 600;
export const STANDING_HEIGHT = 2000;

function exportWallElement(element: WallElement, wallLength: number): ExportWallElement {
	const { wall: _wall, offset, reason: _reason, ...rest } = element;
	const shared = element.id.indexOf('@');
	return {
		...rest,
		...(shared > 0 ? { sharedFrom: element.id.slice(0, shared) } : {}),
		offsetFromStart: offset,
		offsetFromEnd: wallLength - offset - element.width,
		top: element.elevation + element.height
	};
}

export function exportRoom(
	room: Room,
	photoPages: Readonly<Record<string, number>> = {},
	links: readonly WallLink[] = [],
	names: ReadonlyMap<string, string> = new Map()
): ExportRoom {
	const roomWalls = walls(room.polygon);
	return {
		id: room.id,
		name: room.name,
		type: room.type,
		height: room.height,
		areaM2: areaM2(room.polygon),
		perimeter: Math.round(perimeter(room.polygon)),
		corners: room.polygon.map((corner, index) => ({
			label: cornerLabel(index),
			x: corner.x,
			y: corner.y,
			interiorAngleDeg: Math.round(interiorAngle(room.polygon, index) * 100) / 100
		})),
		walls: roomWalls.map((target) => {
			const wallLength = Math.round(target.length);
			return {
				number: target.number,
				from: cornerLabel(target.startIndex),
				to: cornerLabel(target.endIndex),
				start: target.start,
				end: target.end,
				length: wallLength,
				directionDeg: target.angleDeg,
				inwardNormalDeg: (target.angleDeg + 90) % 360,
				elements: wallElements(room, target.number).map((element) =>
					exportWallElement(element, wallLength)
				),
				freeSpans: freeWallSpans(room, target.number).map((span) => ({
					...span,
					length: span.to - span.from
				})),
				...neighboursOf(links, names, room.id, target.number)
			};
		}),
		ceilingElements: room.elements.flatMap((element) =>
			isWallElement(element)
				? []
				: [
						{
							id: element.id,
							kind: element.kind,
							status: element.status,
							x: element.x,
							y: element.y,
							...(element.note ? { note: element.note } : {})
						}
					]
		),
		doorSwings: room.elements.flatMap((element) => {
			if (element.kind !== 'door') return [];
			const swing = doorSwing(room.polygon, element);
			if (!swing || element.swing !== 'in') return [];
			return [
				{
					elementId: element.id,
					wall: element.wall,
					hinge: roundPoint(swing.hinge),
					radius: swing.radius,
					polygon: swing.polygon.map(roundPoint)
				}
			];
		}),
		windowZones: room.elements.flatMap((element) =>
			element.kind === 'window'
				? [
						{
							elementId: element.id,
							wall: element.wall,
							sillHeight: element.elevation,
							polygon: wallElementFootprint(room.polygon, element, WINDOW_ZONE_DEPTH).map(
								roundPoint
							)
						}
					]
				: []
		),
		...(room.slopes && room.slopes.length > 0
			? {
					slopes: room.slopes.map((slope) => {
						const standing = STANDING_HEIGHT - slope.kneeHeight;
						const tangent = Math.tan((slope.angle * Math.PI) / 180);
						return {
							wall: slope.wall,
							kneeHeight: slope.kneeHeight,
							angleDeg: slope.angle,
							fullHeightAt: Math.round(slopeRun(room, slope)),
							...(standing > 0 && STANDING_HEIGHT <= room.height
								? { standingHeightAt: Math.round(standing / tangent) }
								: {})
						};
					})
				}
			: {}),
		...(room.separate ? { separate: true } : {}),
		...(room.floorColor ? { floorColor: room.floorColor } : {}),
		...(room.wallColor ? { wallColor: room.wallColor } : {}),
		...(room.notes ? { notes: room.notes } : {}),
		photos: room.photos.map((photo) => ({
			id: photo.id,
			kind: photo.perspective.kind,
			...(photo.perspective.ref ? { ref: photo.perspective.ref } : {}),
			caption: photo.perspective.caption,
			...(photo.note ? { note: photo.note } : {}),
			...(photoPages[photo.id] ? { pdfPage: photoPages[photo.id] } : {})
		}))
	};
}

function neighboursOf(
	links: readonly WallLink[],
	names: ReadonlyMap<string, string>,
	roomId: string,
	wallNumber: number
): { neighbours?: ExportWall['neighbours'] } {
	const found = links
		.filter((link) => link.roomId === roomId && link.wall === wallNumber)
		.map((link) => ({
			roomId: link.otherRoomId,
			roomName: names.get(link.otherRoomId) ?? '',
			wall: link.otherWall,
			from: link.from,
			to: link.to,
			thickness: link.thickness
		}));
	return found.length > 0 ? { neighbours: found } : {};
}

export interface ExportOptions {
	roomIds?: readonly string[];
	photoPages?: Readonly<Record<string, number>>;
	exportedAt?: string;
}

export function buildExport(project: Project, options: ExportOptions = {}): ExportDocument {
	const rooms = project.rooms.filter(
		(room) => !options.roomIds || options.roomIds.includes(room.id)
	);
	const included = new Set(rooms.map((room) => room.id));
	const links = wallLinks(project.rooms);
	const names = new Map(project.rooms.map((room) => [room.id, room.name]));
	return {
		format: EXPORT_FORMAT,
		schemaVersion: EXPORT_SCHEMA_VERSION,
		exportedAt: options.exportedAt ?? new Date().toISOString(),
		units: 'mm',
		formatGuide: FORMAT_GUIDE,
		project: { id: project.id, name: project.name },
		...(project.brief ? { brief: project.brief } : {}),
		rooms: withMirroredOpenings(project.rooms)
			.filter((room) => included.has(room.id))
			.map((room) => exportRoom(room, options.photoPages, links, names)),
		variants: project.variants.map((variant) => {
			const items = variant.items.filter((item) => included.has(item.roomId));
			const roomNotes = Object.fromEntries(
				Object.entries(variant.roomNotes ?? {}).filter(([roomId]) => included.has(roomId))
			);
			return {
				id: variant.id,
				name: variant.name,
				source: variant.source,
				active: variant.id === project.activeVariantId,
				items: items.map((item) => ({
					...item,
					footprint: itemFootprint(item).map(roundPoint)
				})),
				suggestions: variant.suggestions.filter((suggestion) => included.has(suggestion.roomId)),
				...(Object.keys(roomNotes).length > 0 ? { roomNotes } : {}),
				...(variant.shoppingList ? { shoppingList: variant.shoppingList } : {}),
				totalChf: items.reduce((sum, item) => sum + (item.priceChf ?? 0), 0)
			};
		})
	};
}
