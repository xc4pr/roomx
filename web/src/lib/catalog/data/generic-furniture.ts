import type { CatalogEntry } from '#lib/core/catalog.ts';
import { C, cm, generic } from './helpers.ts';

const sofas = [
	generic({
		id: 'generic-sofa-2-170x90x85',
		de: '2er-Sofa 170x90',
		en: '2-seat sofa 170x90',
		category: 'sofa',
		model: 'sofa',
		dims: cm(170, 90, 85),
		colors: [C.grey, C.beige, C.navy, C.green],
		front: 800
	}),
	generic({
		id: 'generic-sofa-3-220x95x85',
		de: '3er-Sofa 220x95',
		en: '3-seat sofa 220x95',
		category: 'sofa',
		model: 'sofa',
		dims: cm(220, 95, 85),
		colors: [C.grey, C.beige, C.navy, C.green],
		front: 800
	}),
	generic({
		id: 'generic-sofa-corner-280x170x85',
		de: 'Ecksofa 280x170',
		en: 'Corner sofa 280x170',
		category: 'sofa',
		model: 'cornerSofa',
		dims: cm(280, 170, 85),
		colors: [C.grey, C.beige, C.navy, C.darkGrey],
		front: 800
	}),
	generic({
		id: 'generic-armchair-80x85x85',
		de: 'Sessel 80x85',
		en: 'Armchair 80x85',
		category: 'armchair',
		model: 'armchair',
		dims: cm(80, 85, 85),
		colors: [C.grey, C.beige, C.terracotta, C.green],
		front: 600
	}),
	generic({
		id: 'generic-armchair-70x75x80',
		de: 'Sessel klein 70x75',
		en: 'Small armchair 70x75',
		category: 'armchair',
		model: 'armchair',
		dims: cm(70, 75, 80),
		colors: [C.grey, C.beige, C.mustard],
		front: 600
	}),
	generic({
		id: 'generic-pouf-60x40x40',
		de: 'Sitzhocker 60x40',
		en: 'Footstool 60x40',
		category: 'armchair',
		model: 'stool',
		dims: cm(60, 40, 40),
		colors: [C.grey, C.beige, C.brass],
		front: 300
	})
];

const tables = [
	[140, 80],
	[160, 90],
	[180, 90],
	[200, 100]
].map(([w, d]) =>
	generic({
		id: `generic-dining-table-${w}x${d}`,
		de: `Esstisch ${w}x${d}`,
		en: `Dining table ${w}x${d}`,
		category: 'table',
		model: 'table',
		dims: cm(w, d, 75),
		colors: [C.oak, C.walnut, C.white],
		front: 800,
		side: 800
	})
);

const roundTables = [100, 120].map((dia) =>
	generic({
		id: `generic-dining-table-round-${dia}`,
		de: `Esstisch rund Ø ${dia}`,
		en: `Round dining table Ø ${dia}`,
		category: 'table',
		model: 'roundTable',
		dims: cm(dia, dia, 75),
		colors: [C.oak, C.walnut, C.white],
		front: 800,
		side: 800
	})
);

const smallTables = [
	generic({
		id: 'generic-coffee-table-100x55x45',
		de: 'Couchtisch 100x55',
		en: 'Coffee table 100x55',
		category: 'table',
		model: 'table',
		dims: cm(100, 55, 45),
		colors: [C.oak, C.walnut, C.black],
		front: 400
	}),
	generic({
		id: 'generic-coffee-table-round-80x40',
		de: 'Couchtisch rund Ø 80',
		en: 'Round coffee table Ø 80',
		category: 'table',
		model: 'roundTable',
		dims: cm(80, 80, 40),
		colors: [C.oak, C.white, C.black],
		front: 400
	}),
	generic({
		id: 'generic-side-table-round-45x50',
		de: 'Beistelltisch rund Ø 45',
		en: 'Round side table Ø 45',
		category: 'table',
		model: 'roundTable',
		dims: cm(45, 45, 50),
		colors: [C.brass, C.white, C.black],
		front: 300
	}),
	generic({
		id: 'generic-side-table-40x40x55',
		de: 'Beistelltisch 40x40',
		en: 'Side table 40x40',
		category: 'table',
		model: 'table',
		dims: cm(40, 40, 55),
		colors: [C.oak, C.black, C.white],
		front: 300
	}),
	generic({
		id: 'generic-console-table-100x30x80',
		de: 'Konsole 100x30',
		en: 'Console table 100x30',
		category: 'table',
		model: 'table',
		dims: cm(100, 30, 80),
		colors: [C.oak, C.black, C.white],
		front: 600
	})
];

const seats = [
	generic({
		id: 'generic-dining-chair-45x50x85',
		de: 'Esszimmerstuhl',
		en: 'Dining chair',
		category: 'chair',
		model: 'chair',
		dims: cm(45, 50, 85),
		colors: [C.oak, C.black, C.grey, C.white],
		front: 500
	}),
	generic({
		id: 'generic-bar-stool-40x40x75',
		de: 'Barhocker',
		en: 'Bar stool',
		category: 'chair',
		model: 'stool',
		dims: cm(40, 40, 75),
		colors: [C.black, C.oak, C.white],
		front: 400
	}),
	generic({
		id: 'generic-bench-120x35x45',
		de: 'Sitzbank 120x35',
		en: 'Bench 120x35',
		category: 'other',
		model: 'box',
		dims: cm(120, 35, 45),
		colors: [C.oak, C.walnut, C.black],
		front: 500
	})
];

const storage = [
	generic({
		id: 'generic-dresser-80x40x80',
		de: 'Kommode 80x40',
		en: 'Chest of drawers 80x40',
		category: 'dresser',
		model: 'dresser',
		dims: cm(80, 40, 80),
		colors: [C.white, C.oak, C.walnut],
		front: 900
	}),
	generic({
		id: 'generic-dresser-120x45x80',
		de: 'Kommode 120x45',
		en: 'Chest of drawers 120x45',
		category: 'dresser',
		model: 'dresser',
		dims: cm(120, 45, 80),
		colors: [C.white, C.oak, C.walnut],
		front: 900
	}),
	generic({
		id: 'generic-dresser-160x45x85',
		de: 'Kommode 160x45',
		en: 'Chest of drawers 160x45',
		category: 'dresser',
		model: 'dresser',
		dims: cm(160, 45, 85),
		colors: [C.white, C.oak, C.walnut],
		front: 900
	}),
	generic({
		id: 'generic-sideboard-160x40x75',
		de: 'Sideboard 160x40',
		en: 'Sideboard 160x40',
		category: 'sideboard',
		model: 'sideboard',
		dims: cm(160, 40, 75),
		colors: [C.oak, C.walnut, C.white],
		front: 700
	}),
	generic({
		id: 'generic-sideboard-200x40x75',
		de: 'Sideboard 200x40',
		en: 'Sideboard 200x40',
		category: 'sideboard',
		model: 'sideboard',
		dims: cm(200, 40, 75),
		colors: [C.oak, C.walnut, C.white],
		front: 700
	}),
	generic({
		id: 'generic-highboard-100x40x140',
		de: 'Highboard 100x40',
		en: 'Highboard 100x40',
		category: 'sideboard',
		model: 'sideboard',
		dims: cm(100, 40, 140),
		colors: [C.oak, C.walnut, C.white],
		front: 700
	}),
	generic({
		id: 'generic-tv-unit-120x40x45',
		de: 'TV-Möbel 120x40',
		en: 'TV unit 120x40',
		category: 'tvUnit',
		model: 'sideboard',
		dims: cm(120, 40, 45),
		colors: [C.white, C.oak, C.black],
		front: 500
	}),
	generic({
		id: 'generic-tv-unit-160x40x50',
		de: 'TV-Möbel 160x40',
		en: 'TV unit 160x40',
		category: 'tvUnit',
		model: 'sideboard',
		dims: cm(160, 40, 50),
		colors: [C.white, C.oak, C.black],
		front: 500
	}),
	generic({
		id: 'generic-tv-unit-200x40x50',
		de: 'TV-Möbel 200x40',
		en: 'TV unit 200x40',
		category: 'tvUnit',
		model: 'sideboard',
		dims: cm(200, 40, 50),
		colors: [C.white, C.oak, C.black],
		front: 500
	}),
	generic({
		id: 'generic-nightstand-40x35x50',
		de: 'Nachttisch 40x35',
		en: 'Bedside table 40x35',
		category: 'nightstand',
		model: 'nightstand',
		dims: cm(40, 35, 50),
		colors: [C.white, C.oak, C.black],
		front: 500
	}),
	generic({
		id: 'generic-nightstand-45x40x55',
		de: 'Nachttisch 45x40',
		en: 'Bedside table 45x40',
		category: 'nightstand',
		model: 'nightstand',
		dims: cm(45, 40, 55),
		colors: [C.white, C.oak, C.walnut],
		front: 500
	}),
	generic({
		id: 'generic-nightstand-wall-40x30x20',
		de: 'Nachttisch schwebend 40x30',
		en: 'Floating bedside table 40x30',
		category: 'nightstand',
		model: 'nightstand',
		mount: 'wall',
		dims: cm(40, 30, 20),
		colors: [C.white, C.oak, C.black],
		front: 400
	}),
	generic({
		id: 'generic-wardrobe-100x55x200',
		de: 'Kleiderschrank 100x55 (2 Türen)',
		en: 'Wardrobe 100x55 (2 doors)',
		category: 'wardrobe',
		model: 'wardrobe',
		dims: cm(100, 55, 200),
		colors: [C.white, C.oak],
		front: 700
	}),
	generic({
		id: 'generic-wardrobe-150x55x200',
		de: 'Kleiderschrank 150x55 (3 Türen)',
		en: 'Wardrobe 150x55 (3 doors)',
		category: 'wardrobe',
		model: 'wardrobe',
		dims: cm(150, 55, 200),
		colors: [C.white, C.oak],
		front: 700
	}),
	generic({
		id: 'generic-wardrobe-sliding-200x62x220',
		de: 'Kleiderschrank Schiebetüren 200x62',
		en: 'Sliding-door wardrobe 200x62',
		category: 'wardrobe',
		model: 'wardrobe',
		dims: cm(200, 62, 220),
		colors: [C.white, C.grey, C.oak],
		front: 600
	}),
	generic({
		id: 'generic-shelf-80x30x180',
		de: 'Regal 80x30x180',
		en: 'Shelf unit 80x30x180',
		category: 'shelf',
		model: 'shelf',
		dims: cm(80, 30, 180),
		colors: [C.white, C.oak, C.black],
		front: 700
	}),
	generic({
		id: 'generic-shelf-80x30x120',
		de: 'Regal 80x30x120',
		en: 'Shelf unit 80x30x120',
		category: 'shelf',
		model: 'shelf',
		dims: cm(80, 30, 120),
		colors: [C.white, C.oak, C.black],
		front: 700
	}),
	generic({
		id: 'generic-shelf-120x35x200',
		de: 'Regal 120x35x200',
		en: 'Shelf unit 120x35x200',
		category: 'shelf',
		model: 'shelf',
		dims: cm(120, 35, 200),
		colors: [C.white, C.oak, C.black],
		front: 700
	}),
	generic({
		id: 'generic-cube-shelf-120x35x120',
		de: 'Würfelregal 120x35x120',
		en: 'Cube shelf 120x35x120',
		category: 'shelf',
		model: 'cubeShelf',
		dims: cm(120, 35, 120),
		colors: [C.white, C.oak, C.black],
		front: 700
	}),
	generic({
		id: 'generic-wall-shelf-80x20x4',
		de: 'Wandregal 80x20',
		en: 'Wall shelf 80x20',
		category: 'shelf',
		model: 'wallShelf',
		mount: 'wall',
		dims: cm(80, 20, 4),
		colors: [C.white, C.oak, C.black],
		front: 300
	}),
	generic({
		id: 'generic-wall-shelf-120x20x4',
		de: 'Wandregal 120x20',
		en: 'Wall shelf 120x20',
		category: 'shelf',
		model: 'wallShelf',
		mount: 'wall',
		dims: cm(120, 20, 4),
		colors: [C.white, C.oak, C.black],
		front: 300
	}),
	generic({
		id: 'generic-shoe-cabinet-80x35x120',
		de: 'Schuhschrank 80x35',
		en: 'Shoe cabinet 80x35',
		category: 'dresser',
		model: 'dresser',
		dims: cm(80, 35, 120),
		colors: [C.white, C.oak, C.grey],
		front: 700
	}),
	generic({
		id: 'generic-coat-rack-50x30x180',
		de: 'Garderobenständer',
		en: 'Coat stand',
		category: 'other',
		model: 'box',
		dims: cm(50, 30, 180),
		colors: [C.black, C.oak],
		front: 500
	})
];

const deskSizes = [
	[120, 60],
	[140, 70],
	[160, 80],
	[180, 80]
];

const desks = deskSizes.map(([w, d]) =>
	generic({
		id: `generic-desk-${w}x${d}`,
		de: `Schreibtisch ${w}x${d}`,
		en: `Desk ${w}x${d}`,
		category: 'desk',
		model: 'desk',
		dims: cm(w, d, 74),
		colors: [C.white, C.oak, C.walnut, C.black],
		front: 900
	})
);

const standingDesks = [
	[140, 70],
	[160, 80],
	[180, 80]
].map(([w, d]) =>
	generic({
		id: `generic-desk-sit-stand-${w}x${d}`,
		de: `Sitz-Steh-Schreibtisch ${w}x${d}`,
		en: `Sit-stand desk ${w}x${d}`,
		category: 'desk',
		model: 'desk',
		dims: cm(w, d, 72),
		colors: [C.white, C.oak, C.walnut, C.black],
		front: 900,
		power: 1
	})
);

const cornerDesk = generic({
	id: 'generic-desk-corner-160x120',
	de: 'Eck-Schreibtisch 160x120',
	en: 'Corner desk 160x120',
	category: 'desk',
	model: 'desk',
	dims: cm(160, 120, 74),
	colors: [C.white, C.oak, C.black],
	front: 900
});

const officeChairs = [
	generic({
		id: 'generic-office-chair-60x60x105',
		de: 'Bürostuhl',
		en: 'Office chair',
		category: 'officeChair',
		model: 'officeChair',
		dims: cm(60, 60, 105),
		colors: [C.black, C.grey],
		front: 700
	}),
	generic({
		id: 'generic-office-chair-ergonomic-66x66x120',
		de: 'Bürostuhl ergonomisch',
		en: 'Ergonomic office chair',
		category: 'officeChair',
		model: 'officeChair',
		dims: cm(66, 66, 120),
		colors: [C.black, C.darkGrey, C.blue],
		front: 700
	}),
	generic({
		id: 'generic-gaming-chair-70x70x130',
		de: 'Gaming-Stuhl',
		en: 'Gaming chair',
		category: 'officeChair',
		model: 'officeChair',
		dims: cm(70, 70, 130),
		colors: [C.black, C.red, C.blue],
		front: 700
	})
];

const bedWidths = [90, 100, 120, 140, 160, 180, 200];

const beds = bedWidths.map((mattress) =>
	generic({
		id: `generic-bed-${mattress}x200`,
		de: `Bett ${mattress}x200`,
		en: `Bed ${mattress}x200`,
		category: 'bed',
		model: 'bed',
		dims: cm(mattress + 10, 210, 90),
		colors: [C.white, C.oak, C.walnut, C.grey],
		front: 500,
		side: 600
	})
);

const kidsBeds = [
	generic({
		id: 'generic-bed-kids-70x140',
		de: 'Kinderbett 70x140',
		en: 'Toddler bed 70x140',
		category: 'bed',
		model: 'bed',
		dims: cm(78, 148, 75),
		colors: [C.white, C.oak, C.pink, C.blue],
		front: 400,
		side: 500
	}),
	generic({
		id: 'generic-bed-baby-60x120',
		de: 'Babybett 60x120',
		en: 'Baby cot 60x120',
		category: 'bed',
		model: 'bed',
		dims: cm(66, 126, 90),
		colors: [C.white, C.oak],
		front: 400,
		side: 500
	})
];

const KITCHEN_COLORS = [C.white, C.lightGrey, C.oak, C.darkGrey];

// Kitchen furniture and appliances to plan a kitchen freely ("from the catalogue"). Built-in
// kitchens are drawn as kitchen elements instead.
const kitchen = [
	...[55, 60].map((w) =>
		generic({
			id: `generic-kitchen-base-${w}x60x90`,
			de: `Küchen-Unterschrank ${w}`,
			en: `Kitchen base cabinet ${w}`,
			category: 'kitchen',
			model: 'kitchenBase',
			dims: cm(w, 60, 90),
			colors: KITCHEN_COLORS,
			front: 1000
		})
	),
	generic({
		id: 'generic-kitchen-sink-80x60x90',
		de: 'Spülenschrank 80',
		en: 'Sink cabinet 80',
		category: 'kitchen',
		model: 'kitchenSink',
		dims: cm(80, 60, 90),
		colors: KITCHEN_COLORS,
		front: 1000
	}),
	generic({
		id: 'generic-kitchen-wall-60x35x70',
		de: 'Küchen-Oberschrank 60',
		en: 'Kitchen wall cabinet 60',
		category: 'kitchen',
		model: 'kitchenWall',
		dims: cm(60, 35, 70),
		colors: KITCHEN_COLORS,
		mount: 'wall'
	}),
	generic({
		id: 'generic-kitchen-tall-60x60x210',
		de: 'Küchen-Hochschrank 60',
		en: 'Kitchen tall cabinet 60',
		category: 'kitchen',
		model: 'kitchenTall',
		dims: cm(60, 60, 210),
		colors: KITCHEN_COLORS,
		front: 1000
	}),
	generic({
		id: 'generic-hob-60x52',
		de: 'Kochfeld 60',
		en: 'Hob 60',
		category: 'kitchen',
		model: 'hob',
		dims: cm(60, 52, 5),
		colors: [C.black],
		mount: 'on-top'
	}),
	generic({
		id: 'generic-oven-60x55x60',
		de: 'Einbau-Backofen 60',
		en: 'Built-in oven 60',
		category: 'kitchen',
		model: 'oven',
		dims: cm(60, 55, 60),
		colors: [C.black, C.white],
		front: 1000
	}),
	generic({
		id: 'generic-fridge-60x65x185',
		de: 'Kühlschrank 60',
		en: 'Fridge 60',
		category: 'kitchen',
		model: 'fridge',
		dims: cm(60, 65, 185),
		colors: [C.white, C.lightGrey, C.black],
		power: 150,
		front: 1000
	})
];

export const genericFurniture: CatalogEntry[] = [
	...sofas,
	...tables,
	...roundTables,
	...smallTables,
	...seats,
	...storage,
	...desks,
	...standingDesks,
	cornerDesk,
	...officeChairs,
	...beds,
	...kidsBeds,
	...kitchen
];
