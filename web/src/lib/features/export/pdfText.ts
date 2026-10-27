import { defineMessages } from '#lib/i18n/index.svelte.ts';
import type { Language } from '#lib/core/units.ts';
import { translator, type Translate } from './text.ts';

export const symbolMessages = defineMessages({
	de: {
		legendDormer: 'Gaube oder Ausschnitt in der Schräge (gestrichelt)',
		slopeSection: 'Abschnitt {from} bis {to} mm von der Startecke',
		slopeDormers: 'Gauben: {list}',
		slopeDormerEntry: '{from} bis {to} mm, Höhe {h} mm',
		slopeCutEntry: 'Ausschnitt über Öffnung {from} bis {to} mm, Höhe {h} mm',
		legendFireZone: 'Sperrzone Feuer (gestrichelt)',
		legendAirZone: 'Freihaltezone Luftauslass (gestrichelt)',
		legendUpperCabinets: 'Oberschränke (gestrichelt)',
		elementClearance: 'Sperrzone {n}',
		elementScreen: 'mit Glaswand',
		elementKitchen: 'Raster {grid}, {n} Module, Hochschrank {tall}',
		elementKitchenUpper: 'Oberschränke {h} hoch, {d} tief, ab {e}',
		gridSms: '55',
		gridEuro: '60',
		freeTitle: 'Freie Einbauten und Dachfenster',
		freePosition: 'Mitte {x}|{y}',
		freeRotation: 'gedreht {r}°',
		freeSize: '{w} × {d} × {h}',
		freeElevation: 'Unterkante {e}',
		freeRound: 'rund',
		freeSquare: 'eckig',
		freeToCeiling: 'bis zur Decke',
		roofWindowLine: 'Wand {wall}, ab {offset}, Breite {w}, Länge {l}, Unterkante {e}',
		findingsTitle: 'Hinweise zu Sperrzonen und Einbauten',
		findFire: 'Möbel {item} steht in der Sperrzone vor {element}.',
		findAir: 'Möbel {item} steht vor dem Luftauslass von {element}.',
		findCollision: 'Möbel {item} kollidiert mit {element}.',
		findStair: 'Möbel {item} steht auf der Treppe.',
		findStairwell: 'Möbel {item} steht im Treppenauge.'
	},
	en: {
		legendDormer: 'Dormer or cut in the slope (dashed)',
		slopeSection: 'section {from} to {to} mm from the start corner',
		slopeDormers: 'dormers: {list}',
		slopeDormerEntry: '{from} to {to} mm, height {h} mm',
		slopeCutEntry: 'cut above opening {from} to {to} mm, height {h} mm',
		legendFireZone: 'Fire clearance zone (dashed)',
		legendAirZone: 'Air outlet clearance (dashed)',
		legendUpperCabinets: 'Upper cabinets (dashed)',
		elementClearance: 'Clearance {n}',
		elementScreen: 'with glass screen',
		elementKitchen: 'Grid {grid}, {n} modules, tall unit {tall}',
		elementKitchenUpper: 'Upper cabinets {h} high, {d} deep, from {e}',
		gridSms: '55',
		gridEuro: '60',
		freeTitle: 'Free-standing fixtures and roof windows',
		freePosition: 'Centre {x}|{y}',
		freeRotation: 'rotated {r}°',
		freeSize: '{w} × {d} × {h}',
		freeElevation: 'Lower edge {e}',
		freeRound: 'round',
		freeSquare: 'square',
		freeToCeiling: 'up to the ceiling',
		roofWindowLine: 'Wall {wall}, from {offset}, width {w}, length {l}, lower edge {e}',
		findingsTitle: 'Notes on clearance zones and fixtures',
		findFire: 'Item {item} stands in the clearance zone in front of {element}.',
		findAir: 'Item {item} stands in front of the air outlet of {element}.',
		findCollision: 'Item {item} collides with {element}.',
		findStair: 'Item {item} stands on the stair.',
		findStairwell: 'Item {item} stands in the stairwell.'
	}
});

export type SymbolKey = keyof (typeof symbolMessages)['de'];

export function symbolTranslator(language: Language): Translate<SymbolKey> {
	return translator(symbolMessages, language);
}
