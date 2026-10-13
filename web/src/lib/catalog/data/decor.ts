import type { CatalogEntry } from '#lib/core/catalog.ts';
import { C, cm, generic } from './helpers.ts';

const plants = [
	generic({
		id: 'generic-plant-s-20x20x35',
		de: 'Pflanze S',
		en: 'Plant S',
		category: 'plant',
		model: 'plant',
		mount: 'on-top',
		dims: cm(20, 20, 35),
		colors: [C.green, C.terracotta]
	}),
	generic({
		id: 'generic-plant-m-40x40x90',
		de: 'Pflanze M',
		en: 'Plant M',
		category: 'plant',
		model: 'plant',
		dims: cm(40, 40, 90),
		colors: [C.green, C.terracotta, C.white]
	}),
	generic({
		id: 'generic-plant-l-60x60x160',
		de: 'Pflanze L',
		en: 'Plant L',
		category: 'plant',
		model: 'plant',
		dims: cm(60, 60, 160),
		colors: [C.darkGreen, C.terracotta, C.white]
	}),
	generic({
		id: 'generic-plant-xl-80x80x200',
		de: 'Pflanze XL (Palme)',
		en: 'Plant XL (palm)',
		category: 'plant',
		model: 'plant',
		dims: cm(80, 80, 200),
		colors: [C.darkGreen, C.terracotta]
	}),
	generic({
		id: 'generic-plant-snake-30x30x80',
		de: 'Bogenhanf',
		en: 'Snake plant',
		category: 'plant',
		model: 'plant',
		dims: cm(30, 30, 80),
		colors: [C.green, C.white]
	}),
	generic({
		id: 'generic-plant-hanging-30x30x60',
		de: 'Hängepflanze',
		en: 'Hanging plant',
		category: 'plant',
		model: 'hangingPlant',
		mount: 'ceiling',
		dims: cm(30, 30, 60),
		colors: [C.green, C.beige]
	})
];

const rugs = [
	[80, 150],
	[120, 180],
	[160, 230],
	[200, 300],
	[240, 340]
].map(([w, d]) =>
	generic({
		id: `generic-rug-${w}x${d}`,
		de: `Teppich ${w}x${d}`,
		en: `Rug ${w}x${d}`,
		category: 'rug',
		model: 'rug',
		dims: cm(w, d, 1.5),
		colors: [C.beige, C.grey, C.terracotta, C.navy]
	})
);

const roundRugs = [120, 160, 200].map((dia) =>
	generic({
		id: `generic-rug-round-${dia}`,
		de: `Teppich rund Ø ${dia}`,
		en: `Round rug Ø ${dia}`,
		category: 'rug',
		model: 'roundRug',
		dims: cm(dia, dia, 1.5),
		colors: [C.beige, C.grey, C.terracotta]
	})
);

const pictures = [
	[30, 40],
	[50, 70],
	[70, 100],
	[100, 140]
].map(([w, h]) =>
	generic({
		id: `generic-picture-${w}x${h}`,
		de: `Bild ${w}x${h}`,
		en: `Picture ${w}x${h}`,
		category: 'picture',
		model: 'picture',
		mount: 'wall',
		dims: cm(w, 3, h),
		colors: [C.black, C.oak, C.white]
	})
);

const mirrors = [
	generic({
		id: 'generic-mirror-wall-50x70',
		de: 'Wandspiegel 50x70',
		en: 'Wall mirror 50x70',
		category: 'mirror',
		model: 'mirror',
		mount: 'wall',
		dims: cm(50, 3, 70),
		colors: [C.black, C.brass, C.oak],
		front: 500
	}),
	generic({
		id: 'generic-mirror-wall-80x120',
		de: 'Wandspiegel 80x120',
		en: 'Wall mirror 80x120',
		category: 'mirror',
		model: 'mirror',
		mount: 'wall',
		dims: cm(80, 3, 120),
		colors: [C.black, C.brass, C.oak],
		front: 600
	}),
	generic({
		id: 'generic-mirror-round-60',
		de: 'Spiegel rund Ø 60',
		en: 'Round mirror Ø 60',
		category: 'mirror',
		model: 'mirror',
		mount: 'wall',
		dims: cm(60, 3, 60),
		colors: [C.black, C.brass],
		front: 500
	}),
	generic({
		id: 'generic-mirror-round-80',
		de: 'Spiegel rund Ø 80',
		en: 'Round mirror Ø 80',
		category: 'mirror',
		model: 'mirror',
		mount: 'wall',
		dims: cm(80, 3, 80),
		colors: [C.black, C.brass],
		front: 500
	}),
	generic({
		id: 'generic-mirror-standing-60x40x160',
		de: 'Standspiegel 60x160',
		en: 'Standing mirror 60x160',
		category: 'mirror',
		model: 'mirror',
		dims: cm(60, 40, 160),
		colors: [C.black, C.brass, C.oak],
		front: 600
	})
];

const curtains = [
	generic({
		id: 'generic-curtain-140x250',
		de: 'Vorhang 140x250',
		en: 'Curtain 140x250',
		category: 'curtain',
		model: 'curtain',
		mount: 'wall',
		dims: cm(140, 10, 250),
		colors: [C.cream, C.grey, C.beige, C.navy]
	}),
	generic({
		id: 'generic-curtain-pair-280x250',
		de: 'Vorhang-Paar 280x250',
		en: 'Curtain pair 280x250',
		category: 'curtain',
		model: 'curtain',
		mount: 'wall',
		dims: cm(280, 10, 250),
		colors: [C.cream, C.grey, C.beige, C.navy]
	}),
	generic({
		id: 'generic-curtain-sheer-300x250',
		de: 'Store 300x250',
		en: 'Sheer curtain 300x250',
		category: 'curtain',
		model: 'curtain',
		mount: 'wall',
		dims: cm(300, 6, 250),
		colors: [C.white, C.cream]
	})
];

const textiles = [
	generic({
		id: 'generic-cushion-40x40',
		de: 'Kissen 40x40',
		en: 'Cushion 40x40',
		category: 'textile',
		model: 'cushion',
		mount: 'on-top',
		dims: cm(40, 12, 40),
		colors: [C.terracotta, C.grey, C.mustard, C.green]
	}),
	generic({
		id: 'generic-cushion-50x50',
		de: 'Kissen 50x50',
		en: 'Cushion 50x50',
		category: 'textile',
		model: 'cushion',
		mount: 'on-top',
		dims: cm(50, 14, 50),
		colors: [C.beige, C.navy, C.terracotta, C.grey]
	}),
	generic({
		id: 'generic-cushion-30x50',
		de: 'Zierkissen 30x50',
		en: 'Lumbar cushion 30x50',
		category: 'textile',
		model: 'cushion',
		mount: 'on-top',
		dims: cm(50, 10, 30),
		colors: [C.beige, C.green, C.pink]
	}),
	generic({
		id: 'generic-throw-130x170',
		de: 'Plaid 130x170',
		en: 'Throw 130x170',
		category: 'textile',
		model: 'throw',
		mount: 'on-top',
		dims: cm(130, 170, 3),
		colors: [C.grey, C.beige, C.terracotta, C.navy]
	}),
	generic({
		id: 'generic-throw-150x200',
		de: 'Plaid 150x200',
		en: 'Throw 150x200',
		category: 'textile',
		model: 'throw',
		mount: 'on-top',
		dims: cm(150, 200, 3),
		colors: [C.grey, C.beige, C.terracotta, C.navy]
	})
];

const decorItems = [
	generic({
		id: 'generic-vase-s-10x10x18',
		de: 'Vase klein',
		en: 'Vase small',
		category: 'decor',
		model: 'vase',
		mount: 'on-top',
		dims: cm(10, 10, 18),
		colors: [C.white, C.clear, C.terracotta]
	}),
	generic({
		id: 'generic-vase-m-15x15x30',
		de: 'Vase mittel',
		en: 'Vase medium',
		category: 'decor',
		model: 'vase',
		mount: 'on-top',
		dims: cm(15, 15, 30),
		colors: [C.white, C.clear, C.terracotta]
	}),
	generic({
		id: 'generic-vase-l-20x20x50',
		de: 'Vase gross',
		en: 'Vase large',
		category: 'decor',
		model: 'vase',
		mount: 'on-top',
		dims: cm(20, 20, 50),
		colors: [C.white, C.clear, C.black]
	}),
	generic({
		id: 'generic-vase-floor-25x25x80',
		de: 'Bodenvase',
		en: 'Floor vase',
		category: 'decor',
		model: 'vase',
		dims: cm(25, 25, 80),
		colors: [C.white, C.black, C.terracotta]
	}),
	generic({
		id: 'generic-basket-s-25x25x25',
		de: 'Korb klein',
		en: 'Basket small',
		category: 'decor',
		model: 'basket',
		mount: 'on-top',
		dims: cm(25, 25, 25),
		colors: [C.beige, C.oak]
	}),
	generic({
		id: 'generic-basket-m-35x35x35',
		de: 'Korb mittel',
		en: 'Basket medium',
		category: 'decor',
		model: 'basket',
		dims: cm(35, 35, 35),
		colors: [C.beige, C.oak]
	}),
	generic({
		id: 'generic-basket-l-45x45x45',
		de: 'Korb gross',
		en: 'Basket large',
		category: 'decor',
		model: 'basket',
		dims: cm(45, 45, 45),
		colors: [C.beige, C.oak]
	}),
	generic({
		id: 'generic-laundry-basket-45x35x60',
		de: 'Wäschekorb',
		en: 'Laundry basket',
		category: 'decor',
		model: 'basket',
		dims: cm(45, 35, 60),
		colors: [C.beige, C.white, C.grey],
		front: 400
	}),
	generic({
		id: 'generic-books-stack-25x18x15',
		de: 'Bücherstapel',
		en: 'Stack of books',
		category: 'decor',
		model: 'books',
		mount: 'on-top',
		dims: cm(25, 18, 15),
		colors: [C.beige, C.navy, C.red]
	}),
	generic({
		id: 'generic-books-row-40x20x25',
		de: 'Bücherreihe',
		en: 'Row of books',
		category: 'decor',
		model: 'books',
		mount: 'on-top',
		dims: cm(40, 20, 25),
		colors: [C.beige, C.navy, C.green, C.red]
	}),
	generic({
		id: 'generic-clock-wall-30x4x30',
		de: 'Wanduhr Ø 30',
		en: 'Wall clock Ø 30',
		category: 'decor',
		model: 'clock',
		mount: 'wall',
		dims: cm(30, 4, 30),
		colors: [C.black, C.white, C.brass]
	}),
	generic({
		id: 'generic-clock-table-15x6x15',
		de: 'Tischuhr',
		en: 'Table clock',
		category: 'decor',
		model: 'clock',
		mount: 'on-top',
		dims: cm(15, 6, 15),
		colors: [C.black, C.white, C.brass]
	}),
	generic({
		id: 'generic-clock-grandfather-50x30x180',
		de: 'Standuhr',
		en: 'Grandfather clock',
		category: 'decor',
		model: 'clock',
		dims: cm(50, 30, 180),
		colors: [C.walnut, C.oak]
	})
];

export const decor: CatalogEntry[] = [
	...plants,
	...rugs,
	...roundRugs,
	...pictures,
	...mirrors,
	...curtains,
	...textiles,
	...decorItems
];
