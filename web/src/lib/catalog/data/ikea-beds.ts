import type { CatalogEntry } from '#lib/core/catalog.ts';
import { C, cm, ikea } from './helpers.ts';

const malmWidths = [90, 140, 160, 180];

const malmBeds = malmWidths.map((mattress) =>
	ikea({
		id: `ikea-malm-bed-${mattress}x200`,
		series: 'MALM',
		de: `MALM Bettgestell hoch ${mattress}x200 cm`,
		en: `MALM bed frame high ${mattress}x200 cm`,
		category: 'bed',
		model: 'bed',
		dims: cm(mattress + 16, 209, 100),
		colors: [C.white, C.blackBrown, C.birch],
		front: 700,
		side: 600
	})
);

const nightstands = [
	ikea({
		id: 'ikea-malm-nightstand-40x55x55',
		series: 'MALM',
		de: 'MALM Nachttisch 40x55x55 cm',
		en: 'MALM bedside table 40x55x55 cm',
		category: 'nightstand',
		model: 'nightstand',
		dims: cm(40, 55, 55),
		colors: [C.white, C.blackBrown, C.birch],
		front: 500
	}),
	ikea({
		id: 'ikea-brimnes-nightstand-39x41x41',
		series: 'BRIMNES',
		de: 'BRIMNES Nachttisch 39x41x41 cm',
		en: 'BRIMNES bedside table 39x41x41 cm',
		category: 'nightstand',
		model: 'nightstand',
		dims: cm(39, 41, 41),
		colors: [C.white, C.blackBrown],
		front: 500
	}),
	ikea({
		id: 'ikea-lack-nightstand-35x35x45',
		series: 'LACK',
		de: 'LACK Beistelltisch 35x35x45 cm',
		en: 'LACK side table 35x35x45 cm',
		category: 'nightstand',
		model: 'nightstand',
		dims: cm(35, 35, 45),
		colors: [C.white, C.black],
		front: 400
	})
];

export const ikeaBeds: CatalogEntry[] = [...malmBeds, ...nightstands];
