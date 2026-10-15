import type { CatalogEntry } from '#lib/core/catalog.ts';
import { C, cm, generic, ikea } from './helpers.ts';

export const lighting: CatalogEntry[] = [
	ikea({
		id: 'ikea-hektar-floor-lamp-34x34x181',
		series: 'HEKTAR',
		de: 'HEKTAR Standleuchte 34x34x181 cm',
		en: 'HEKTAR floor lamp 34x34x181 cm',
		category: 'lamp',
		model: 'floorLamp',
		dims: cm(34, 34, 181),
		colors: [C.darkGrey],
		power: 1,
		priceChf: 69.95,
		url: 'https://www.ikea.com/ch/de/p/hektar-standleuchte-dunkelgrau-00215307/',
		articleNo: '002.153.07',
		verified: true
	}),
	ikea({
		id: 'ikea-ranarp-floor-lamp-36x36x153',
		series: 'RANARP',
		de: 'RANARP Stehleuchte',
		en: 'RANARP floor lamp',
		category: 'lamp',
		model: 'floorLamp',
		dims: cm(36, 36, 153),
		colors: [C.cream, C.black],
		power: 1
	}),
	ikea({
		id: 'ikea-ranarp-floor-lamp-28x76x153',
		series: 'RANARP',
		de: 'RANARP Stand-/Leseleuchte 28x76x153 cm',
		en: 'RANARP floor/reading lamp 28x76x153 cm',
		category: 'lamp',
		model: 'floorLamp',
		dims: cm(28, 76, 153),
		colors: [C.black],
		power: 1,
		priceChf: 59.95,
		url: 'https://www.ikea.com/ch/de/p/ranarp-stand-leseleuchte-schwarz-90331374/',
		articleNo: '903.313.74',
		verified: true
	}),
	generic({
		id: 'generic-floor-lamp-35x35x160',
		de: 'Stehleuchte',
		en: 'Floor lamp',
		category: 'lamp',
		model: 'floorLamp',
		dims: cm(35, 35, 160),
		colors: [C.black, C.brass, C.white],
		power: 1
	}),
	generic({
		id: 'generic-floor-lamp-arc-40x40x190',
		de: 'Bogenleuchte',
		en: 'Arc floor lamp',
		category: 'lamp',
		model: 'floorLamp',
		dims: cm(40, 40, 190),
		colors: [C.black, C.brass],
		power: 1
	}),
	generic({
		id: 'generic-table-lamp-25x25x45',
		de: 'Tischleuchte',
		en: 'Table lamp',
		category: 'lamp',
		model: 'tableLamp',
		mount: 'on-top',
		dims: cm(25, 25, 45),
		colors: [C.white, C.black, C.brass],
		power: 1
	}),
	generic({
		id: 'generic-desk-lamp-20x20x45',
		de: 'Schreibtischleuchte',
		en: 'Desk lamp',
		category: 'lamp',
		model: 'tableLamp',
		mount: 'on-top',
		dims: cm(20, 20, 45),
		colors: [C.black, C.white, C.grey],
		power: 1
	}),
	generic({
		id: 'generic-pendant-lamp-40x40x25',
		de: 'Pendelleuchte Ø 40',
		en: 'Pendant lamp Ø 40',
		category: 'lamp',
		model: 'pendantLamp',
		mount: 'ceiling',
		dims: cm(40, 40, 25),
		colors: [C.white, C.black, C.brass]
	}),
	generic({
		id: 'generic-pendant-lamp-60x60x30',
		de: 'Pendelleuchte Ø 60',
		en: 'Pendant lamp Ø 60',
		category: 'lamp',
		model: 'pendantLamp',
		mount: 'ceiling',
		dims: cm(60, 60, 30),
		colors: [C.white, C.black, C.oak]
	}),
	generic({
		id: 'generic-wall-lamp-15x15x20',
		de: 'Wandleuchte',
		en: 'Wall lamp',
		category: 'lamp',
		model: 'wallLamp',
		mount: 'wall',
		dims: cm(15, 15, 20),
		colors: [C.black, C.brass, C.white]
	}),
	generic({
		id: 'generic-led-strip-300x1x1',
		de: 'LED-Streifen 3 m',
		en: 'LED strip 3 m',
		category: 'lamp',
		model: 'ledStrip',
		mount: 'wall',
		dims: cm(300, 1, 1),
		colors: [C.white, C.mustard],
		power: 1
	})
];
