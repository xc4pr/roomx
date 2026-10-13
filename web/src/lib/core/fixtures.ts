import type { CatalogEntry } from './catalog.ts';
import { catalogLookup } from './catalog.ts';
import { rectanglePolygon } from './defaults.ts';
import type { Plan } from './plan.ts';
import { SCHEMA_VERSION, type Project, type Room } from './schema.ts';
import { ROOM_TEMPLATES } from './templates.ts';

export const sampleCatalog: CatalogEntry[] = [
	{
		id: 'ikea-malm-bed-160x200',
		brand: 'IKEA',
		series: 'MALM',
		name: { de: 'MALM Bettgestell 160×200', en: 'MALM bed frame 160×200' },
		category: 'bed',
		model: 'bed',
		dims: { w: 1760, d: 2090, h: 1000 },
		colors: ['#f2f2f0'],
		mount: 'floor',
		power: 0,
		clearance: { front: 700, side: 600 },
		priceChf: 249,
		verified: false
	},
	{
		id: 'generic-desk-160x80',
		brand: 'Generic',
		name: { de: 'Schreibtisch 160×80', en: 'Desk 160×80' },
		category: 'desk',
		model: 'desk',
		dims: { w: 1600, d: 800, h: 740 },
		colors: ['#d8c3a5'],
		mount: 'floor',
		power: 0,
		clearance: { front: 1000, side: 0 },
		priceChf: 299,
		verified: false
	},
	{
		id: 'generic-monitor-27',
		brand: 'Generic',
		name: { de: 'Monitor 27"', en: 'Monitor 27"' },
		category: 'electronics',
		model: 'monitor',
		dims: { w: 615, d: 200, h: 450 },
		colors: ['#222222'],
		mount: 'on-top',
		power: 1,
		clearance: { front: 0, side: 0 },
		priceChf: 250,
		verified: false
	},
	{
		id: 'generic-rug-200x300',
		brand: 'Generic',
		name: { de: 'Teppich 200×300', en: 'Rug 200×300' },
		category: 'rug',
		model: 'rug',
		dims: { w: 2000, d: 3000, h: 10 },
		colors: ['#c9b79c'],
		mount: 'floor',
		power: 0,
		clearance: { front: 0, side: 0 },
		priceChf: 199,
		verified: false
	}
];

export const sampleLookup = catalogLookup(sampleCatalog);

export function rectangleRoom(id = 'room-rect', length = 4000, width = 3000): Room {
	return {
		id,
		name: 'Schlafzimmer',
		type: 'bedroom',
		polygon: rectanglePolygon(length, width),
		height: 2500,
		boardPos: { x: 0, y: 0, rot: 0 },
		elements: [
			{
				id: 'door-1',
				kind: 'door',
				status: 'existing',
				wall: 1,
				offset: 200,
				width: 800,
				height: 2000,
				elevation: 0,
				hinge: 'start',
				swing: 'in'
			},
			{
				id: 'window-1',
				kind: 'window',
				status: 'existing',
				wall: 3,
				offset: 1400,
				width: 1200,
				height: 1400,
				elevation: 900,
				windowType: 'tiltTurn'
			},
			{
				id: 'socket-1',
				kind: 'socket',
				status: 'existing',
				wall: 2,
				offset: 400,
				width: 160,
				height: 80,
				elevation: 260,
				gang: 2,
				usb: false
			}
		],
		photos: []
	};
}

export function lRoom(id = 'room-l'): Room {
	return {
		id,
		name: 'Wohnzimmer',
		type: 'living',
		polygon: ROOM_TEMPLATES.l.build(ROOM_TEMPLATES.l.defaults),
		height: 2500,
		boardPos: { x: 5000, y: 0, rot: 0 },
		elements: [],
		photos: []
	};
}

export function sampleProject(): Project {
	return {
		id: 'project-1',
		name: 'Wohnung',
		schemaVersion: SCHEMA_VERSION,
		rev: 0,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		rooms: [rectangleRoom(), lRoom()],
		variants: []
	};
}

export function samplePlan(): Plan {
	return {
		format: 'roomx-plan',
		schemaVersion: 1,
		projectId: 'project-1',
		brief: {
			persons: { adults: 2, children: 0 },
			bedSizes: ['160x200'],
			workstations: [{ monitors: 2, monitorInch: 27, devices: ['Laptop mit Dock'] }],
			budgetChf: 3000
		},
		variants: [
			{
				name: 'A: ruhig',
				rooms: [
					{
						roomId: 'room-rect',
						items: [
							{
								id: 'bed',
								catalogId: 'ikea-malm-bed-160x200',
								anchor: { wall: 4, offset: 300 }
							},
							{
								id: 'desk',
								catalogId: 'generic-desk-160x80',
								anchor: { wall: 2, offset: 1200, gap: 20 }
							},
							{ catalogId: 'generic-monitor-27', on: 'desk' },
							{ catalogId: 'generic-rug-200x300', x: 2100, y: 1600, rotation: 90 },
							{
								name: 'Wandregal',
								category: 'shelf',
								dims: { w: 1100, d: 260, h: 50 },
								anchor: { wall: 1, offset: 1800 },
								elevation: 1500
							}
						],
						electrical: [
							{
								kind: 'socket',
								wall: 4,
								offset: 300,
								elevation: 300,
								gang: 3,
								reason: 'Nachttisch links'
							}
						],
						notes: 'Bett an der ruhigen Wand.'
					}
				],
				shoppingList: [{ catalogId: 'ikea-malm-bed-160x200', name: 'MALM', qty: 1, priceChf: 249 }]
			}
		]
	};
}
