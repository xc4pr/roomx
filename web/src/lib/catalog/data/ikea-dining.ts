import type { CatalogEntry } from '#lib/core/catalog.ts';
import { C, cm, ikea } from './helpers.ts';

export const ikeaDining: CatalogEntry[] = [
	ikea({
		id: 'ikea-lisabo-table-140x78x74',
		series: 'LISABO',
		de: 'LISABO Tisch 140x78 cm',
		en: 'LISABO table 140x78 cm',
		category: 'table',
		model: 'table',
		dims: cm(140, 78, 74),
		colors: [C.blackBrown, C.oak],
		front: 800,
		side: 800
	}),
	ikea({
		id: 'ikea-melltorp-table-125x75x74',
		series: 'MELLTORP',
		de: 'MELLTORP Tisch 125x75 cm',
		en: 'MELLTORP table 125x75 cm',
		category: 'table',
		model: 'table',
		dims: cm(125, 75, 74),
		colors: [C.white, C.black],
		front: 800,
		side: 800
	}),
	ikea({
		id: 'ikea-lerhamn-table-118x74x75',
		series: 'LERHAMN',
		de: 'LERHAMN Tisch 118x74 cm',
		en: 'LERHAMN table 118x74 cm',
		category: 'table',
		model: 'table',
		dims: cm(118, 74, 75),
		colors: [C.walnut, C.oak],
		front: 800,
		side: 800
	}),
	ikea({
		id: 'ikea-ekedalen-table-120x80x75',
		series: 'EKEDALEN',
		de: 'EKEDALEN Ausziehtisch 120/180x80 cm',
		en: 'EKEDALEN extendable table 120/180x80 cm',
		category: 'table',
		model: 'table',
		dims: cm(120, 80, 75),
		colors: [C.walnut, C.white],
		front: 800,
		side: 800
	}),
	ikea({
		id: 'ikea-adde-chair-39x47x77',
		series: 'ADDE',
		de: 'ADDE Stuhl',
		en: 'ADDE chair',
		category: 'chair',
		model: 'chair',
		dims: cm(39, 47, 77),
		colors: [C.white, C.black],
		front: 400
	}),
	ikea({
		id: 'ikea-ingolf-chair-43x52x91',
		series: 'INGOLF',
		de: 'INGOLF Stuhl',
		en: 'INGOLF chair',
		category: 'chair',
		model: 'chair',
		dims: cm(43, 52, 91),
		colors: [C.white, C.birch, C.black],
		front: 400
	}),
	ikea({
		id: 'ikea-hovet-mirror-78x196',
		series: 'HOVET',
		de: 'HOVET Spiegel 78x196 cm',
		en: 'HOVET mirror 78x196 cm',
		category: 'mirror',
		model: 'mirror',
		mount: 'wall',
		dims: cm(78, 3, 196),
		colors: [C.brass, C.black],
		front: 600
	}),
	ikea({
		id: 'ikea-nissedal-mirror-65x150',
		series: 'NISSEDAL',
		de: 'NISSEDAL Spiegel 65x150 cm',
		en: 'NISSEDAL mirror 65x150 cm',
		category: 'mirror',
		model: 'mirror',
		mount: 'wall',
		dims: cm(65, 3, 150),
		colors: [C.black, C.white],
		front: 600
	}),
	ikea({
		id: 'ikea-knapper-standing-mirror-48x160',
		series: 'KNAPPER',
		de: 'KNAPPER Standspiegel 48x160 cm',
		en: 'KNAPPER standing mirror 48x160 cm',
		category: 'mirror',
		model: 'mirror',
		dims: cm(48, 35, 160),
		colors: [C.white, C.black],
		front: 600
	})
];
