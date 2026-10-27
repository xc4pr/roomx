import type { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { createElement, createRoom } from '#lib/core/defaults.ts';
import { rectangleRoom } from '#lib/core/fixtures.ts';
import type {
	ElementKind,
	FreeElement,
	KitchenRun,
	ModelType,
	Project,
	Room,
	RoomElement,
	RoomType,
	Slope,
	Stair,
	StairShape
} from '#lib/core/schema.ts';
import { coplanarClashes, type Clash } from './coplanar.helper.ts';
import { buildFurniture } from './furniture/index.ts';
import { buildRoom } from './room/index.ts';
import { buildScene } from './scene.ts';
import { DEFAULT_SCENE_OPTIONS } from './types.ts';

// Every element added since version 1.2 is drawn without faces that share a plane with another
// material: such faces flicker in stripes that move with the camera.

const OPTIONS = { ...DEFAULT_SCENE_OPTIONS, wallHeightFactor: 1 };
const lookup = () => undefined;

let counter = 0;
const newId = () => `z-${++counter}`;

function roomWith(...elements: RoomElement[]): Room {
	return { ...rectangleRoom(), elements };
}

function wallElement(kind: ElementKind, along = 2000): RoomElement {
	return createElement(kind, rectangleRoom(), 1, along, newId);
}

function freeElement(kind: ElementKind, patch: Partial<FreeElement> = {}): RoomElement {
	const element = createElement(kind, rectangleRoom(), 1, 2000, newId);
	return { ...element, x: 2000, y: 1500, rotation: 30, ...patch } as FreeElement;
}

function project(rooms: Room[], patch: Partial<Project> = {}): Project {
	return {
		id: 'p',
		name: 'p',
		schemaVersion: 2,
		rev: 0,
		createdAt: '',
		updatedAt: '',
		rooms,
		variants: [],
		...patch
	};
}

function scene(content: Project): Object3D {
	return buildScene(
		{ project: content, roomIds: content.rooms.map((room) => room.id) },
		OPTIONS,
		lookup
	).root;
}

// Never seen: the bases of neighbouring rooms overlap under their shared wall, below the floor and
// the walls; faces at floor level that look down (bottom of a door leaf and its lining).
const hidden = (clash: Clash) =>
	(clash.a.includes('/base#') && clash.b.includes('/base#') && Math.abs(clash.normal[1]) === 1) ||
	(clash.normal[1] === -1 && clash.at[1] === 0);

function expectClean(root: Object3D): void {
	const clashes = coplanarClashes(root).filter((clash) => !hidden(clash));
	expect(clashes.map((clash) => JSON.stringify(clash))).toEqual([]);
}

function roomsWithCeiling(room: Room): Object3D[] {
	return [false, true].map((ceiling) => buildRoom(room, { ...OPTIONS, ceiling }));
}

describe('no coplanar faces at doors and windows', () => {
	it('door, window and electrical of a plain room', () =>
		roomsWithCeiling(rectangleRoom()).forEach(expectClean));
});

describe('no coplanar faces in bathroom, kitchen and climate elements', () => {
	for (const kind of ['washbasin', 'toilet', 'bathtub', 'acWall'] as const) {
		it(kind, () => expectClean(buildRoom(roomWith(wallElement(kind)), OPTIONS)));
	}

	it('shower with and without glass, also in the corner', () => {
		const shower = wallElement('shower');
		expectClean(buildRoom(roomWith({ ...shower, screen: false } as RoomElement), OPTIONS));
		expectClean(buildRoom(roomWith({ ...shower, screen: true } as RoomElement), OPTIONS));
		expectClean(
			buildRoom(roomWith({ ...shower, screen: true, offset: 0 } as RoomElement), OPTIONS)
		);
	});

	it('kitchen run with every module and upper cabinets', () => {
		const run = {
			...(wallElement('kitchenRun') as KitchenRun),
			offset: 0,
			width: 3600,
			upper: { depth: 350, height: 700, elevation: 1450 },
			modules: [
				{ id: 'm1', kind: 'tall', width: 600, appliances: ['fridge'] },
				{ id: 'm2', kind: 'sink', width: 800 },
				{ id: 'm3', kind: 'dishwasher', width: 600 },
				{ id: 'm4', kind: 'hob', width: 600, appliances: ['oven'] },
				{ id: 'm5', kind: 'tall', width: 600, appliances: ['oven', 'microwave'] },
				{ id: 'm6', kind: 'table', width: 400 }
			]
		} satisfies KitchenRun;
		expectClean(buildRoom(roomWith(run), OPTIONS));
		expectClean(buildRoom(roomWith({ ...run, upper: undefined }), OPTIONS));
	});
});

describe('no coplanar faces in fireplaces, stoves and free obstacles', () => {
	const kinds = ['fireplace', 'stove', 'acFloor', 'freeObstacle'] as const;
	for (const kind of kinds) {
		it(kind, () => expectClean(buildRoom(roomWith(freeElement(kind)), OPTIONS)));
	}

	it('tiled stove, narrow and with a bench', () => {
		expectClean(buildRoom(roomWith(freeElement('tiledStove', { width: 1200 })), OPTIONS));
		expectClean(buildRoom(roomWith(freeElement('tiledStove', { width: 2000 })), OPTIONS));
	});

	it('round and square column', () => {
		expectClean(buildRoom(roomWith(freeElement('column')), OPTIONS));
		expectClean(
			buildRoom(
				roomWith(freeElement('column', { shape: 'square' } as Partial<FreeElement>)),
				OPTIONS
			)
		);
	});

	it('fireplace against a wall', () => {
		expectClean(buildRoom(roomWith(freeElement('fireplace', { y: 400, rotation: 0 })), OPTIONS));
	});
});

describe('no coplanar faces under sloped ceilings', () => {
	const slopes = (patch: Partial<Slope> = {}): Slope[] => [
		{ id: 's1', wall: 1, kneeHeight: 1000, angle: 45, ...patch }
	];
	const bare = (patch: Partial<Room>): Room => ({ ...rectangleRoom(), elements: [], ...patch });
	const roofWindow = {
		id: 'rw',
		kind: 'roofWindow',
		status: 'existing',
		wall: 1,
		offset: 1000,
		width: 780,
		length: 1180,
		elevation: 1100
	} as const;
	const expectAllClean = (room: Room) => roomsWithCeiling(room).forEach(expectClean);

	it('slope over the whole wall and gable roof', () => {
		expectAllClean(bare({ slopes: slopes() }));
		expectAllClean(
			bare({ slopes: [...slopes(), { id: 's3', wall: 3, kneeHeight: 1000, angle: 45 }] })
		);
	});

	it('partial slope', () => expectAllClean(bare({ slopes: slopes({ from: 1000, to: 3000 }) })));

	it('dormer with a window', () => {
		const window = { ...wallElement('window', 2000), offset: 1500, width: 1000 } as RoomElement;
		expectAllClean(
			bare({
				slopes: slopes({ dormers: [{ id: 'g', from: 1000, to: 3000, height: 1800 }] }),
				elements: [window]
			})
		);
	});

	it('roof window', () => expectAllClean(bare({ elements: [roofWindow], slopes: slopes() })));

	it('door and window that cut the slope', () => {
		const door = { ...wallElement('door', 600), offset: 300 } as RoomElement;
		const window = { ...wallElement('window', 2500), offset: 2200 } as RoomElement;
		expectAllClean(bare({ slopes: slopes(), elements: [door, window] }));
		expectAllClean(bare({ slopes: slopes({ from: 300, to: 3000 }), elements: [door] }));
	});
});

describe('no coplanar faces outdoors', () => {
	// Docked at the wall thickness (the usual case) and right on the inner face of the house wall.
	const GAPS = [150, 0];
	function pair(type: RoomType, gap: number, patch: Partial<Room> = {}): Project {
		const house = createRoom('a', 'A', 'living', { x: 0, y: 0, rot: 0 });
		const outdoor = { ...createRoom('b', 'B', type, { x: 4000 + gap, y: 0, rot: 0 }), ...patch };
		return project([house, outdoor]);
	}
	const strip = {
		polygon: [
			{ x: 0, y: 0 },
			{ x: 1000, y: 0 },
			{ x: 1000, y: 3000 },
			{ x: 0, y: 3000 }
		],
		height: 2400
	};

	for (const gap of GAPS) {
		it(`balcony with railing, cover over all and as a strip, gap ${gap}`, () => {
			const balcony = createRoom('b', 'B', 'balcony');
			const railing = { height: 1000 };
			expectClean(scene(pair('balcony', gap, { railing })));
			expectClean(
				scene(pair('balcony', gap, { railing, cover: { polygon: balcony.polygon, height: 2400 } }))
			);
			expectClean(scene(pair('balcony', gap, { railing, cover: strip })));
		});

		it(`terrace and garden, gap ${gap}`, () => {
			expectClean(scene(pair('terrace', gap, { cover: strip })));
			expectClean(scene(pair('garden', gap)));
		});

		it(`winter garden, also with a lean-to roof, gap ${gap}`, () => {
			expectClean(scene(pair('winterGarden', gap)));
			expectClean(
				scene(
					pair('winterGarden', gap, {
						slopes: [{ id: 's', wall: 2, kneeHeight: 2000, angle: 20 }]
					})
				)
			);
		});
	}
});

describe('no coplanar faces on floors and stairs', () => {
	function house(shape: StairShape): Project {
		const big = (id: string, floorId: string): Room => ({
			...createRoom(id, id, 'living'),
			polygon: [
				{ x: 0, y: 0 },
				{ x: 7000, y: 0 },
				{ x: 7000, y: 5000 },
				{ x: 0, y: 5000 }
			],
			floorId
		});
		const stair: Stair = {
			id: 'st',
			fromFloorId: 'eg',
			shape,
			// A spiral stair turns around its centre: far enough from the walls to stay in the room.
			x: shape === 'spiral' ? 2000 : 600,
			y: shape === 'spiral' ? 2000 : 600,
			rotation: 0,
			width: 900,
			turn: 'left'
		};
		return project([big('a', 'eg'), big('b', 'og')], {
			floors: [
				{ id: 'eg', name: 'EG', slabThickness: 300 },
				{ id: 'og', name: 'OG', slabThickness: 250 }
			],
			stairs: [stair]
		});
	}

	for (const shape of ['straight', 'l', 'u', 'spiral'] as const) {
		it(`${shape} stair with its stairwell`, () => expectClean(scene(house(shape))));
	}

	it('winter garden under a room of the floor above', () => {
		const content = house('straight');
		const garden: Room = { ...createRoom('w', 'w', 'winterGarden'), floorId: 'eg' };
		const above: Room = { ...createRoom('o', 'o', 'living'), floorId: 'og' };
		content.rooms.push({ ...garden, boardPos: { x: 8000, y: 0, rot: 0 } });
		content.rooms.push({ ...above, boardPos: { x: 8000, y: 0, rot: 0 } });
		expectClean(scene(content));
	});
});

describe('no coplanar faces in kitchen cabinets from the catalogue', () => {
	const dims = {
		kitchenBase: [600, 600, 800],
		kitchenSink: [800, 600, 800],
		kitchenWall: [600, 350, 700],
		kitchenTall: [600, 600, 2000]
	} as const;
	for (const [model, [w, d, h]] of Object.entries(dims)) {
		it(model, () =>
			expectClean(
				buildFurniture({ model: model as ModelType, dims: { w, d, h }, color: '#ffffff' })
			)
		);
	}
});
