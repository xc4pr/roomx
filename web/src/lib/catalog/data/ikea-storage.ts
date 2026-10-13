import type { CatalogEntry } from '#lib/core/catalog.ts';
import { C, cm, ikea } from './helpers.ts';

const paxWidths = [50, 75, 100];
const paxDepths = [35, 58];
const paxHeights = [201, 236];

const paxFrames = paxHeights.flatMap((h) =>
	paxDepths.flatMap((d) =>
		paxWidths.map((w) => {
			const leaf = w === 50 ? 500 : w * 5;
			return ikea({
				id: `ikea-pax-${w}x${d}x${h}`,
				series: 'PAX',
				de: `PAX Kleiderschrank-Korpus ${w}x${d}x${h} cm`,
				en: `PAX wardrobe frame ${w}x${d}x${h} cm`,
				category: 'wardrobe',
				model: 'wardrobe',
				dims: cm(w, d, h),
				colors: [C.white, C.blackBrown],
				front: leaf + 200
			});
		})
	)
);

const paxCorners = paxHeights.map((h) =>
	ikea({
		id: `ikea-pax-corner-53x58x${h}`,
		series: 'PAX',
		de: `PAX Eckelement 53x58x${h} cm`,
		en: `PAX add-on corner unit 53x58x${h} cm`,
		category: 'wardrobe',
		model: 'wardrobe',
		dims: cm(53, 58, h),
		colors: [C.white, C.blackBrown],
		front: 700
	})
);

const paxSliding = [
	[150, 201],
	[150, 236],
	[200, 201],
	[200, 236]
].map(([w, h]) =>
	ikea({
		id: `ikea-pax-sliding-${w}x66x${h}`,
		series: 'PAX',
		de: `PAX Kleiderschrank mit Schiebetüren ${w}x66x${h} cm`,
		en: `PAX wardrobe with sliding doors ${w}x66x${h} cm`,
		category: 'wardrobe',
		model: 'wardrobe',
		dims: cm(w, 66, h),
		colors: [C.white, C.blackBrown, C.grey],
		front: 600
	})
);

const kallaxSizes: [number, number][] = [
	[41.5, 41.5],
	[41.5, 76.5],
	[41.5, 111.5],
	[41.5, 146.5],
	[76.5, 76.5],
	[76.5, 111.5],
	[111.5, 111.5],
	[146.5, 76.5],
	[146.5, 146.5]
];

const kallax = kallaxSizes.map(([w, h]) => {
	const nominal = (v: number) => Math.round(v + 0.5);
	return ikea({
		id: `ikea-kallax-${nominal(w)}x${nominal(h)}`,
		series: 'KALLAX',
		de: `KALLAX Regal ${nominal(w)}x${nominal(h)} cm`,
		en: `KALLAX shelf unit ${nominal(w)}x${nominal(h)} cm`,
		category: 'shelf',
		model: 'cubeShelf',
		dims: cm(w, 39, h),
		colors: [C.white, C.blackBrown, C.birch],
		front: 800
	});
});

const kallaxVerified = ikea({
	id: 'ikea-kallax-77x147',
	series: 'KALLAX',
	de: 'KALLAX Regal 77x147 cm',
	en: 'KALLAX shelf unit 77x147 cm',
	category: 'shelf',
	model: 'cubeShelf',
	dims: cm(76.5, 39, 146.5),
	colors: [C.white, C.blackBrown, C.oak],
	front: 800,
	priceChf: 59.95,
	url: 'https://www.ikea.com/ch/de/p/kallax-regal-weiss-80275887/',
	articleNo: '802.758.87',
	verified: true
});

const billy = [
	ikea({
		id: 'ikea-billy-40x28x106',
		series: 'BILLY',
		de: 'BILLY Bücherregal 40x28x106 cm',
		en: 'BILLY bookcase 40x28x106 cm',
		category: 'shelf',
		model: 'shelf',
		dims: cm(40, 28, 106),
		colors: [C.white, C.birch, C.blackBrown],
		front: 700
	}),
	ikea({
		id: 'ikea-billy-40x28x202',
		series: 'BILLY',
		de: 'BILLY Bücherregal 40x28x202 cm',
		en: 'BILLY bookcase 40x28x202 cm',
		category: 'shelf',
		model: 'shelf',
		dims: cm(40, 28, 202),
		colors: [C.white, C.birch, C.blackBrown],
		front: 700
	}),
	ikea({
		id: 'ikea-billy-80x28x106',
		series: 'BILLY',
		de: 'BILLY Bücherregal 80x28x106 cm',
		en: 'BILLY bookcase 80x28x106 cm',
		category: 'shelf',
		model: 'shelf',
		dims: cm(80, 28, 106),
		colors: [C.white, C.birch, C.blackBrown],
		front: 700
	}),
	ikea({
		id: 'ikea-billy-80x28x202',
		series: 'BILLY',
		de: 'BILLY Bücherregal 80x28x202 cm',
		en: 'BILLY bookcase 80x28x202 cm',
		category: 'shelf',
		model: 'shelf',
		dims: cm(80, 28, 202),
		colors: [C.white, C.birch, C.blackBrown],
		front: 700,
		priceChf: 59.95,
		url: 'https://www.ikea.com/ch/de/p/billy-buecherregal-weiss-00263850/',
		articleNo: '002.638.50',
		verified: true
	}),
	ikea({
		id: 'ikea-billy-80x40x202',
		series: 'BILLY',
		de: 'BILLY Bücherregal 80x40x202 cm',
		en: 'BILLY bookcase 80x40x202 cm',
		category: 'shelf',
		model: 'shelf',
		dims: cm(80, 40, 202),
		colors: [C.white, C.birch, C.blackBrown],
		front: 700
	})
];

const besta = [
	ikea({
		id: 'ikea-besta-60x40x64',
		series: 'BESTÅ',
		de: 'BESTÅ Korpus 60x40x64 cm',
		en: 'BESTÅ frame 60x40x64 cm',
		category: 'sideboard',
		model: 'sideboard',
		dims: cm(60, 40, 64),
		colors: [C.white, C.blackBrown, C.grey],
		front: 600
	}),
	ikea({
		id: 'ikea-besta-120x40x64',
		series: 'BESTÅ',
		de: 'BESTÅ Korpus 120x40x64 cm',
		en: 'BESTÅ frame 120x40x64 cm',
		category: 'sideboard',
		model: 'sideboard',
		dims: cm(120, 40, 64),
		colors: [C.white, C.blackBrown, C.grey],
		front: 600
	}),
	ikea({
		id: 'ikea-besta-120x42x38',
		series: 'BESTÅ',
		de: 'BESTÅ TV-Bank 120x42x38 cm',
		en: 'BESTÅ TV unit 120x42x38 cm',
		category: 'tvUnit',
		model: 'sideboard',
		dims: cm(120, 42, 38),
		colors: [C.white, C.blackBrown, C.grey],
		front: 500
	}),
	ikea({
		id: 'ikea-besta-180x42x39',
		series: 'BESTÅ',
		de: 'BESTÅ TV-Bank 180x42x39 cm',
		en: 'BESTÅ TV unit 180x42x39 cm',
		category: 'tvUnit',
		model: 'sideboard',
		dims: cm(180, 42, 39),
		colors: [C.white, C.blackBrown, C.grey],
		front: 500
	})
];

const eketSizes: [number, number, number][] = [
	[35, 35, 35],
	[70, 35, 35],
	[35, 35, 70],
	[105, 35, 35],
	[70, 35, 70]
];

const eket = eketSizes.map(([w, d, h]) =>
	ikea({
		id: `ikea-eket-${w}x${d}x${h}`,
		series: 'EKET',
		de: `EKET Schrankkombination ${w}x${d}x${h} cm`,
		en: `EKET cabinet combination ${w}x${d}x${h} cm`,
		category: 'shelf',
		model: 'cubeShelf',
		mount: 'floor',
		dims: cm(w, d, h),
		colors: [C.white, C.grey, C.blackBrown, C.birch],
		front: 500
	})
);

const ivar = [
	ikea({
		id: 'ikea-ivar-89x30x179',
		series: 'IVAR',
		de: 'IVAR Regal 89x30x179 cm',
		en: 'IVAR shelving unit 89x30x179 cm',
		category: 'shelf',
		model: 'shelf',
		dims: cm(89, 30, 179),
		colors: [C.birch],
		front: 700
	}),
	ikea({
		id: 'ikea-ivar-89x50x179',
		series: 'IVAR',
		de: 'IVAR Regal 89x50x179 cm',
		en: 'IVAR shelving unit 89x50x179 cm',
		category: 'shelf',
		model: 'shelf',
		dims: cm(89, 50, 179),
		colors: [C.birch],
		front: 700
	}),
	ikea({
		id: 'ikea-ivar-174x30x179',
		series: 'IVAR',
		de: 'IVAR Regal 2 Elemente 174x30x179 cm',
		en: 'IVAR shelving unit 2 sections 174x30x179 cm',
		category: 'shelf',
		model: 'shelf',
		dims: cm(174, 30, 179),
		colors: [C.birch],
		front: 700
	})
];

const hemnes = [
	ikea({
		id: 'ikea-hemnes-dresser-3-108x50x96',
		series: 'HEMNES',
		de: 'HEMNES Kommode mit 3 Schubladen 108x50x96 cm',
		en: 'HEMNES chest of 3 drawers 108x50x96 cm',
		category: 'dresser',
		model: 'dresser',
		dims: cm(108, 50, 96),
		colors: [C.white, C.blackBrown, C.grey],
		front: 900
	}),
	ikea({
		id: 'ikea-hemnes-dresser-6-108x50x131',
		series: 'HEMNES',
		de: 'HEMNES Kommode mit 6 Schubladen 108x50x131 cm',
		en: 'HEMNES chest of 6 drawers 108x50x131 cm',
		category: 'dresser',
		model: 'dresser',
		dims: cm(108, 50, 131),
		colors: [C.white, C.blackBrown, C.grey],
		front: 900
	}),
	ikea({
		id: 'ikea-hemnes-dresser-8-160x50x95',
		series: 'HEMNES',
		de: 'HEMNES Kommode mit 8 Schubladen 160x50x95 cm',
		en: 'HEMNES chest of 8 drawers 160x50x95 cm',
		category: 'dresser',
		model: 'dresser',
		dims: cm(160, 50, 95),
		colors: [C.white, C.blackBrown],
		front: 900
	}),
	ikea({
		id: 'ikea-hemnes-nightstand-46x35x70',
		series: 'HEMNES',
		de: 'HEMNES Nachttisch 46x35x70 cm',
		en: 'HEMNES bedside table 46x35x70 cm',
		category: 'nightstand',
		model: 'nightstand',
		dims: cm(46, 35, 70),
		colors: [C.white, C.blackBrown],
		front: 600
	}),
	ikea({
		id: 'ikea-hemnes-bookcase-90x37x197',
		series: 'HEMNES',
		de: 'HEMNES Bücherregal 90x37x197 cm',
		en: 'HEMNES bookcase 90x37x197 cm',
		category: 'shelf',
		model: 'shelf',
		dims: cm(90, 37, 197),
		colors: [C.white, C.blackBrown],
		front: 700
	}),
	ikea({
		id: 'ikea-hemnes-tv-148x47x57',
		series: 'HEMNES',
		de: 'HEMNES TV-Bank 148x47x57 cm',
		en: 'HEMNES TV unit 148x47x57 cm',
		category: 'tvUnit',
		model: 'sideboard',
		dims: cm(148, 47, 57),
		colors: [C.white, C.blackBrown],
		front: 600
	}),
	ikea({
		id: 'ikea-hemnes-shoe-cabinet-107x30x127',
		series: 'HEMNES',
		de: 'HEMNES Schuhschrank 107x30x127 cm',
		en: 'HEMNES shoe cabinet 107x30x127 cm',
		category: 'dresser',
		model: 'dresser',
		dims: cm(107, 30, 127),
		colors: [C.white, C.blackBrown],
		front: 700
	})
];

const malm = [
	ikea({
		id: 'ikea-malm-dresser-2-80x48x55',
		series: 'MALM',
		de: 'MALM Kommode mit 2 Schubladen 80x48x55 cm',
		en: 'MALM chest of 2 drawers 80x48x55 cm',
		category: 'dresser',
		model: 'dresser',
		dims: cm(80, 48, 55),
		colors: [C.white, C.blackBrown, C.birch],
		front: 900
	}),
	ikea({
		id: 'ikea-malm-dresser-3-80x48x78',
		series: 'MALM',
		de: 'MALM Kommode mit 3 Schubladen 80x48x78 cm',
		en: 'MALM chest of 3 drawers 80x48x78 cm',
		category: 'dresser',
		model: 'dresser',
		dims: cm(80, 48, 78),
		colors: [C.white, C.blackBrown, C.birch],
		front: 900
	}),
	ikea({
		id: 'ikea-malm-dresser-4-80x48x100',
		series: 'MALM',
		de: 'MALM Kommode mit 4 Schubladen 80x48x100 cm',
		en: 'MALM chest of 4 drawers 80x48x100 cm',
		category: 'dresser',
		model: 'dresser',
		dims: cm(80, 48, 100),
		colors: [C.white, C.blackBrown, C.birch],
		front: 900
	}),
	ikea({
		id: 'ikea-malm-dresser-6-160x48x78',
		series: 'MALM',
		de: 'MALM Kommode mit 6 Schubladen 160x48x78 cm',
		en: 'MALM chest of 6 drawers 160x48x78 cm',
		category: 'dresser',
		model: 'dresser',
		dims: cm(160, 48, 78),
		colors: [C.white, C.blackBrown, C.birch],
		front: 900
	})
];

const brimnes = [
	ikea({
		id: 'ikea-brimnes-dresser-4-78x41x96',
		series: 'BRIMNES',
		de: 'BRIMNES Kommode mit 4 Schubladen 78x41x96 cm',
		en: 'BRIMNES chest of 4 drawers 78x41x96 cm',
		category: 'dresser',
		model: 'dresser',
		dims: cm(78, 41, 96),
		colors: [C.white, C.blackBrown],
		front: 900
	}),
	ikea({
		id: 'ikea-brimnes-tv-120x41x53',
		series: 'BRIMNES',
		de: 'BRIMNES TV-Bank 120x41x53 cm',
		en: 'BRIMNES TV unit 120x41x53 cm',
		category: 'tvUnit',
		model: 'sideboard',
		dims: cm(120, 41, 53),
		colors: [C.white, C.blackBrown],
		front: 600
	}),
	ikea({
		id: 'ikea-brimnes-wardrobe-78x47x190',
		series: 'BRIMNES',
		de: 'BRIMNES Kleiderschrank 2 Türen 78x47x190 cm',
		en: 'BRIMNES wardrobe with 2 doors 78x47x190 cm',
		category: 'wardrobe',
		model: 'wardrobe',
		dims: cm(78, 47, 190),
		colors: [C.white, C.blackBrown],
		front: 590
	})
];

const nordli = [
	ikea({
		id: 'ikea-nordli-dresser-3-80x47x76',
		series: 'NORDLI',
		de: 'NORDLI Kommode mit 3 Schubladen 80x47x76 cm',
		en: 'NORDLI chest of 3 drawers 80x47x76 cm',
		category: 'dresser',
		model: 'dresser',
		dims: cm(80, 47, 76),
		colors: [C.white, C.darkGrey],
		front: 900
	}),
	ikea({
		id: 'ikea-nordli-dresser-5-80x47x99',
		series: 'NORDLI',
		de: 'NORDLI Kommode mit 5 Schubladen 80x47x99 cm',
		en: 'NORDLI chest of 5 drawers 80x47x99 cm',
		category: 'dresser',
		model: 'dresser',
		dims: cm(80, 47, 99),
		colors: [C.white, C.darkGrey],
		front: 900
	})
];

const lack = [
	ikea({
		id: 'ikea-lack-side-table-55x55x45',
		series: 'LACK',
		de: 'LACK Beistelltisch 55x55x45 cm',
		en: 'LACK side table 55x55x45 cm',
		category: 'table',
		model: 'table',
		dims: cm(55, 55, 45),
		colors: [C.white, C.black, C.birch],
		front: 400
	}),
	ikea({
		id: 'ikea-lack-coffee-table-90x55x45',
		series: 'LACK',
		de: 'LACK Couchtisch 90x55x45 cm',
		en: 'LACK coffee table 90x55x45 cm',
		category: 'table',
		model: 'table',
		dims: cm(90, 55, 45),
		colors: [C.white, C.black, C.birch],
		front: 400
	}),
	ikea({
		id: 'ikea-lack-tv-160x35x36',
		series: 'LACK',
		de: 'LACK TV-Bank 160x35x36 cm',
		en: 'LACK TV unit 160x35x36 cm',
		category: 'tvUnit',
		model: 'sideboard',
		dims: cm(160, 35, 36),
		colors: [C.white, C.black],
		front: 500
	})
];

export const ikeaStorage: CatalogEntry[] = [
	...paxFrames,
	...paxCorners,
	...paxSliding,
	kallaxVerified,
	...kallax,
	...billy,
	...besta,
	...eket,
	...ivar,
	...hemnes,
	...malm,
	...brimnes,
	...nordli,
	...lack
];
