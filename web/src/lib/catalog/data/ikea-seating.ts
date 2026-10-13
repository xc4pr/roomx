import type { CatalogEntry } from '#lib/core/catalog.ts';
import { C, cm, ikea } from './helpers.ts';

export const ikeaSeating: CatalogEntry[] = [
	ikea({
		id: 'ikea-soederhamn-sofa-3-198x99x83',
		series: 'SÖDERHAMN',
		de: 'SÖDERHAMN 3er-Sofa 198x99x83 cm',
		en: 'SÖDERHAMN 3-seat sofa 198x99x83 cm',
		category: 'sofa',
		model: 'sofa',
		dims: cm(198, 99, 83),
		colors: [C.grey, C.beige, C.darkGrey],
		front: 800
	}),
	ikea({
		id: 'ikea-kivik-sofa-2-190x95x83',
		series: 'KIVIK',
		de: 'KIVIK 2er-Sofa 190x95x83 cm',
		en: 'KIVIK 2-seat sofa 190x95x83 cm',
		category: 'sofa',
		model: 'sofa',
		dims: cm(190, 95, 83),
		colors: [C.grey, C.beige, C.navy],
		front: 800
	}),
	ikea({
		id: 'ikea-kivik-sofa-3-228x95x83',
		series: 'KIVIK',
		de: 'KIVIK 3er-Sofa 228x95x83 cm',
		en: 'KIVIK 3-seat sofa 228x95x83 cm',
		category: 'sofa',
		model: 'sofa',
		dims: cm(228, 95, 83),
		colors: [C.grey, C.beige, C.navy],
		front: 800
	}),
	ikea({
		id: 'ikea-friheten-corner-sofa-bed-230x151x66',
		series: 'FRIHETEN',
		de: 'FRIHETEN Eckbettsofa 3er 230x151x66 cm',
		en: 'FRIHETEN corner sofa-bed 230x151x66 cm',
		category: 'sofa',
		model: 'cornerSofa',
		dims: cm(230, 151, 66),
		colors: [C.grey, C.darkGrey, C.blue],
		front: 1000
	}),
	ikea({
		id: 'ikea-poaeng-armchair-68x82x100',
		series: 'POÄNG',
		de: 'POÄNG Sessel 68x82x100 cm',
		en: 'POÄNG armchair 68x82x100 cm',
		category: 'armchair',
		model: 'armchair',
		dims: cm(68, 82, 100),
		colors: [C.birch, C.black, C.lightGrey],
		front: 600
	}),
	ikea({
		id: 'ikea-strandmon-wing-chair-82x96x101',
		series: 'STRANDMON',
		de: 'STRANDMON Ohrensessel 82x96x101 cm',
		en: 'STRANDMON wing chair 82x96x101 cm',
		category: 'armchair',
		model: 'armchair',
		dims: cm(82, 96, 101),
		colors: [C.mustard, C.grey, C.navy],
		front: 600
	})
];
