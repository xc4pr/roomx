import { add, areaMm2, centroid, scale, slopeAt, wall, wallPoint } from './geometry.ts';
import type {
	ElementKind,
	KitchenGrid,
	KitchenModule,
	KitchenModuleKind,
	Point,
	Room,
	RoomElement,
	RoomType
} from './schema.ts';
import type { IdFactory } from './ids.ts';

export const DEFAULT_ROOM = { length: 4000, width: 3000, height: 2500 } as const;
export const WALL_THICKNESS = 150;
export const EYE_HEIGHT = 1650;
export const SOCKET_WARN_DISTANCE = 1500;
export const SWITCH_CENTER_ABOVE_WORKTOP = 1150;
export const RAILING_HEIGHT = 1000;
export const SLAB_THICKNESS = 300;
export const FLOOR_NAMES = ['UG', 'EG', '1. OG', '2. OG', 'DG'] as const;
export const KITCHEN = { depth: 600, height: 900, tallHeight: 2100 } as const;
export const KITCHEN_UPPER = { depth: 350, height: 700, elevation: 1450 } as const;
export const ROOF_WINDOW = { width: 780, length: 1180 } as const;
export const FIRE_CLEARANCE = 800;

const BOX = 80;

export function rectanglePolygon(length: number, width: number): Point[] {
	return [
		{ x: 0, y: 0 },
		{ x: length, y: 0 },
		{ x: length, y: width },
		{ x: 0, y: width }
	];
}

export function createRoom(
	id: string,
	name: string,
	type: RoomType = 'other',
	boardPos = { x: 0, y: 0, rot: 0 }
): Room {
	return {
		id,
		name,
		type,
		polygon: rectanglePolygon(DEFAULT_ROOM.length, DEFAULT_ROOM.width),
		height: DEFAULT_ROOM.height,
		boardPos,
		elements: [],
		photos: []
	};
}

const KITCHEN_DEFAULT: readonly {
	kind: KitchenModuleKind;
	appliances?: KitchenModule['appliances'];
}[] = [
	{ kind: 'sink' },
	{ kind: 'dishwasher' },
	{ kind: 'base' },
	{ kind: 'hob', appliances: ['oven'] }
];

export function kitchenGridWidth(grid: KitchenGrid): number {
	return grid === 'sms' ? 550 : 600;
}

// A run as long as the wall allows (four modules at most): sink, dishwasher, base cabinet, hob
// with oven, in the width of the chosen grid.
export function defaultKitchenModules(
	length: number,
	grid: KitchenGrid,
	newId: IdFactory
): KitchenModule[] {
	const width = kitchenGridWidth(grid);
	const count = Math.max(1, Math.min(KITCHEN_DEFAULT.length, Math.floor(length / width)));
	return KITCHEN_DEFAULT.slice(0, count).map((module) => ({ id: newId(), width, ...module }));
}

export function createElement(
	kind: ElementKind,
	room: Pick<Room, 'polygon' | 'height'> & Partial<Pick<Room, 'slopes'>>,
	wallNumber: number,
	centerAlong: number,
	newId: IdFactory
): RoomElement {
	const id = newId();
	const status = 'existing' as const;
	if (kind === 'ceilingLamp') {
		const center = centroid(room.polygon);
		return { id, kind, status, x: Math.round(center.x), y: Math.round(center.y) };
	}
	const target = wall(room.polygon, wallNumber);
	const wallLength = Math.round(target?.length ?? 0);
	const place = (width: number, height: number, elevation: number) => {
		const length = target ? wallLength : width;
		const offset = Math.max(0, Math.min(length - width, Math.round(centerAlong - width / 2)));
		return { id, status, wall: wallNumber, offset, width, height, elevation };
	};
	// Free elements start with their back against the wall at that point, front into the room.
	const stand = (width: number, depth: number, height: number) => {
		const base = target ? wallPoint(target, centerAlong) : centroid(room.polygon);
		const center = target ? add(base, scale(target.inward, depth / 2)) : base;
		return {
			id,
			status,
			x: Math.round(center.x),
			y: Math.round(center.y),
			rotation: target ? target.angleDeg : 0,
			width,
			depth,
			height,
			elevation: 0
		};
	};
	switch (kind) {
		case 'door':
			return { ...place(800, 2000, 0), kind, hinge: 'start', swing: 'in' };
		case 'window':
			return { ...place(1200, 1400, 900), kind, windowType: 'tiltTurn' };
		case 'builtin':
			return { ...place(1000, Math.min(2400, room.height), 0), kind, depth: 600 };
		case 'obstacle':
			return { ...place(400, room.height, 0), kind, depth: 300 };
		case 'socket':
			return { ...place(BOX, BOX, 300 - BOX / 2), kind, gang: 1, usb: false };
		case 'switch':
			return { ...place(BOX, BOX, 1050 - BOX / 2), kind };
		case 'wallLamp':
			return { ...place(200, 200, 1800 - 100), kind };
		case 'dataPort':
			return { ...place(BOX, BOX, 300 - BOX / 2), kind, portType: 'lan' };
		case 'radiator':
			return { ...place(1000, 600, 150), kind, depth: 100 };
		case 'washbasin':
			return { ...place(600, 850, 0), kind, depth: 450 };
		case 'toilet':
			return { ...place(370, 400, 0), kind, depth: 550 };
		case 'shower':
			return { ...place(900, 2000, 0), kind, depth: 900 };
		case 'bathtub':
			return { ...place(1700, 600, 0), kind, depth: 750 };
		case 'kitchenRun': {
			const grid: KitchenGrid = 'sms';
			const width = Math.max(
				kitchenGridWidth(grid),
				Math.min(wallLength || 4 * kitchenGridWidth(grid), 4 * kitchenGridWidth(grid))
			);
			return {
				...place(width, KITCHEN.height, 0),
				kind,
				depth: KITCHEN.depth,
				grid,
				tallHeight: Math.min(KITCHEN.tallHeight, room.height),
				modules: defaultKitchenModules(width, grid, newId)
			};
		}
		case 'acWall':
			return {
				...place(800, 300, Math.max(0, Math.min(2000, room.height - 350))),
				kind,
				depth: 220,
				clearance: 1000
			};
		case 'column':
			return { ...stand(300, 300, room.height), kind, shape: 'round', toCeiling: true };
		case 'freeObstacle':
			return { ...stand(600, 600, 1000), kind };
		case 'fireplace':
			return { ...stand(1000, 500, Math.min(1200, room.height)), kind, clearance: FIRE_CLEARANCE };
		case 'stove':
			return { ...stand(500, 450, Math.min(1100, room.height)), kind, clearance: FIRE_CLEARANCE };
		case 'tiledStove':
			return { ...stand(1200, 700, Math.min(1800, room.height)), kind, clearance: FIRE_CLEARANCE };
		case 'acFloor':
			return { ...stand(450, 400, 750), kind, clearance: 500 };
		case 'roofWindow': {
			const width = ROOF_WINDOW.width;
			const length = Math.max(width, wallLength);
			const offset = Math.max(0, Math.min(length - width, Math.round(centerAlong - width / 2)));
			const slope = room.slopes
				? slopeAt({ polygon: room.polygon, slopes: room.slopes }, wallNumber, centerAlong)
				: undefined;
			const rise = slope ? ROOF_WINDOW.length * Math.sin((slope.angle * Math.PI) / 180) : 0;
			const knee = slope?.kneeHeight ?? 0;
			const elevation = Math.round(Math.max(knee, Math.min(1000, room.height - rise)));
			return {
				id,
				status,
				kind,
				wall: wallNumber,
				offset,
				width,
				length: ROOF_WINDOW.length,
				elevation
			};
		}
	}
}

export function socketWidth(gang: number): number {
	return BOX * gang;
}

export function areaM2(polygon: readonly Point[]): number {
	return Math.round(areaMm2(polygon) / 10000) / 100;
}
