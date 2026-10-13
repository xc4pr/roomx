import type { CatalogEntry } from '#lib/core/catalog.ts';
import { C, cm, ikea } from './helpers.ts';

const micke = [
	ikea({
		id: 'ikea-micke-desk-105x50x75',
		series: 'MICKE',
		de: 'MICKE Schreibtisch 105x50x75 cm',
		en: 'MICKE desk 105x50x75 cm',
		category: 'desk',
		model: 'desk',
		dims: cm(105, 50, 75),
		colors: [C.white, C.blackBrown, C.birch],
		front: 900,
		priceChf: 99.95,
		url: 'https://www.ikea.com/ch/de/p/micke-schreibtisch-weiss-80213074/',
		articleNo: '802.130.74',
		verified: true
	}),
	ikea({
		id: 'ikea-micke-desk-142x50x75',
		series: 'MICKE',
		de: 'MICKE Schreibtisch 142x50x75 cm',
		en: 'MICKE desk 142x50x75 cm',
		category: 'desk',
		model: 'desk',
		dims: cm(142, 50, 75),
		colors: [C.white, C.blackBrown, C.birch],
		front: 900
	})
];

const alex = [
	ikea({
		id: 'ikea-alex-desk-100x48x76',
		series: 'ALEX',
		de: 'ALEX Schreibtisch 100x48x76 cm',
		en: 'ALEX desk 100x48x76 cm',
		category: 'desk',
		model: 'desk',
		dims: cm(100, 48, 76),
		colors: [C.white, C.blackBrown],
		front: 900
	}),
	ikea({
		id: 'ikea-alex-desk-131x60x76',
		series: 'ALEX',
		de: 'ALEX Schreibtisch 131x60x76 cm',
		en: 'ALEX desk 131x60x76 cm',
		category: 'desk',
		model: 'desk',
		dims: cm(131, 60, 76),
		colors: [C.white, C.blackBrown],
		front: 900
	})
];

const malm = [
	ikea({
		id: 'ikea-malm-desk-140x65x73',
		series: 'MALM',
		de: 'MALM Schreibtisch 140x65x73 cm',
		en: 'MALM desk 140x65x73 cm',
		category: 'desk',
		model: 'desk',
		dims: cm(140, 65, 73),
		colors: [C.white, C.blackBrown, C.birch],
		front: 900
	}),
	ikea({
		id: 'ikea-malm-vanity-100x41x78',
		series: 'MALM',
		de: 'MALM Frisiertisch 100x41x78 cm',
		en: 'MALM dressing table 100x41x78 cm',
		category: 'table',
		model: 'desk',
		dims: cm(100, 41, 78),
		colors: [C.white, C.blackBrown],
		front: 800
	})
];

const lagkapten = [120, 140, 200].map((w) =>
	ikea({
		id: `ikea-lagkapten-adils-desk-${w}x60x73`,
		series: 'LAGKAPTEN',
		de: `LAGKAPTEN/ADILS Schreibtisch ${w}x60 cm`,
		en: `LAGKAPTEN/ADILS desk ${w}x60 cm`,
		category: 'desk',
		model: 'desk',
		dims: cm(w, 60, 73),
		colors: [C.white, C.black, C.darkGrey],
		front: 900
	})
);

const trotten = [
	[120, 70],
	[160, 80]
].map(([w, d]) =>
	ikea({
		id: `ikea-trotten-sit-stand-desk-${w}x${d}`,
		series: 'TROTTEN',
		de: `TROTTEN Sitz-/Steh-Schreibtisch ${w}x${d} cm`,
		en: `TROTTEN sit/stand desk ${w}x${d} cm`,
		category: 'desk',
		model: 'desk',
		dims: cm(w, d, 75),
		colors: [C.white, C.blackBrown, C.beige],
		front: 900,
		power: 1
	})
);

const mittzon = [
	[120, 60],
	[140, 60],
	[140, 80],
	[160, 80]
].map(([w, d]) =>
	ikea({
		id: `ikea-mittzon-sit-stand-desk-${w}x${d}`,
		series: 'MITTZON',
		de: `MITTZON Sitz-/Steh-Schreibtisch elektrisch ${w}x${d} cm`,
		en: `MITTZON electric sit/stand desk ${w}x${d} cm`,
		category: 'desk',
		model: 'desk',
		dims: cm(w, d, 68),
		colors: [C.white, C.blackBrown, C.walnut, C.birch],
		front: 900,
		power: 1
	})
);

const idasen = [
	[120, 70],
	[160, 80]
].map(([w, d]) =>
	ikea({
		id: `ikea-idasen-sit-stand-desk-${w}x${d}`,
		series: 'IDÅSEN',
		de: `IDÅSEN Sitz-/Steh-Schreibtisch ${w}x${d} cm`,
		en: `IDÅSEN sit/stand desk ${w}x${d} cm`,
		category: 'desk',
		model: 'desk',
		dims: cm(w, d, 63),
		colors: [C.black, C.white, C.darkGrey],
		front: 900,
		power: 1
	})
);

export const ikeaOffice: CatalogEntry[] = [
	...micke,
	...alex,
	...malm,
	...lagkapten,
	...trotten,
	...mittzon,
	...idasen
];
