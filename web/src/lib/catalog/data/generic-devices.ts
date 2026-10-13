import type { CatalogEntry } from '#lib/core/catalog.ts';
import { C, cm, generic } from './helpers.ts';

const monitors = [
	[24, 54, 18, 42],
	[27, 61, 20, 46],
	[32, 72, 22, 52],
	[34, 81, 23, 44]
].map(([inch, w, d, h]) =>
	generic({
		id: `generic-monitor-${inch}`,
		de: `Monitor ${inch}"`,
		en: `Monitor ${inch}"`,
		category: 'electronics',
		model: 'monitor',
		mount: 'on-top',
		dims: cm(w, d, h),
		colors: [C.black, C.darkGrey],
		power: 1
	})
);

const tvSizes = [
	[43, 96, 23, 58],
	[55, 123, 25, 76],
	[65, 145, 28, 88],
	[75, 168, 30, 99]
];

const tvStand = tvSizes.map(([inch, w, d, h]) =>
	generic({
		id: `generic-tv-${inch}`,
		de: `Fernseher ${inch}" mit Fuss`,
		en: `TV ${inch}" with stand`,
		category: 'electronics',
		model: 'tv',
		mount: 'on-top',
		dims: cm(w, d, h),
		colors: [C.black],
		power: 1
	})
);

const tvWall = tvSizes.slice(1).map(([inch, w, , h]) =>
	generic({
		id: `generic-tv-wall-${inch}`,
		de: `Fernseher ${inch}" Wandmontage`,
		en: `Wall-mounted TV ${inch}"`,
		category: 'electronics',
		model: 'tv',
		mount: 'wall',
		dims: cm(w, 6, h - 4),
		colors: [C.black],
		power: 1
	})
);

const others = [
	generic({
		id: 'generic-pc-tower-21x45x42',
		de: 'PC-Tower',
		en: 'PC tower',
		category: 'electronics',
		model: 'pc',
		dims: cm(21, 45, 42),
		colors: [C.black, C.darkGrey],
		power: 1,
		front: 200
	}),
	generic({
		id: 'generic-mini-pc-13x13x4',
		de: 'Mini-PC',
		en: 'Mini PC',
		category: 'electronics',
		model: 'pc',
		mount: 'on-top',
		dims: cm(13, 13, 4),
		colors: [C.black, C.grey],
		power: 1
	}),
	generic({
		id: 'generic-laptop-33x23x2',
		de: 'Laptop',
		en: 'Laptop',
		category: 'electronics',
		model: 'smallDevice',
		mount: 'on-top',
		dims: cm(33, 23, 2),
		colors: [C.grey, C.darkGrey],
		power: 1
	}),
	generic({
		id: 'generic-printer-42x35x20',
		de: 'Drucker',
		en: 'Printer',
		category: 'electronics',
		model: 'printer',
		mount: 'on-top',
		dims: cm(42, 35, 20),
		colors: [C.white, C.black],
		power: 1,
		front: 300
	}),
	generic({
		id: 'generic-router-15x15x4',
		de: 'Router',
		en: 'Router',
		category: 'electronics',
		model: 'smallDevice',
		mount: 'on-top',
		dims: cm(15, 15, 4),
		colors: [C.white, C.black],
		power: 1
	}),
	generic({
		id: 'generic-game-console-30x26x6',
		de: 'Spielkonsole',
		en: 'Game console',
		category: 'electronics',
		model: 'smallDevice',
		mount: 'on-top',
		dims: cm(30, 26, 6),
		colors: [C.white, C.black],
		power: 1
	}),
	generic({
		id: 'generic-smart-speaker-10x10x15',
		de: 'Smart Speaker',
		en: 'Smart speaker',
		category: 'electronics',
		model: 'speaker',
		mount: 'on-top',
		dims: cm(10, 10, 15),
		colors: [C.black, C.white, C.grey],
		power: 1
	}),
	generic({
		id: 'generic-speaker-shelf-18x20x30',
		de: 'Regallautsprecher',
		en: 'Bookshelf speaker',
		category: 'electronics',
		model: 'speaker',
		mount: 'on-top',
		dims: cm(18, 20, 30),
		colors: [C.black, C.walnut],
		power: 1
	}),
	generic({
		id: 'generic-speaker-floor-25x30x100',
		de: 'Standlautsprecher',
		en: 'Floor-standing speaker',
		category: 'electronics',
		model: 'speaker',
		dims: cm(25, 30, 100),
		colors: [C.black, C.walnut],
		power: 1,
		front: 300
	}),
	generic({
		id: 'generic-soundbar-90x10x7',
		de: 'Soundbar',
		en: 'Soundbar',
		category: 'electronics',
		model: 'speaker',
		mount: 'on-top',
		dims: cm(90, 10, 7),
		colors: [C.black, C.darkGrey],
		power: 1
	}),
	generic({
		id: 'generic-monitor-arm-10x18x45',
		de: 'Monitorarm',
		en: 'Monitor arm',
		category: 'electronics',
		model: 'monitorArm',
		mount: 'on-top',
		dims: cm(10, 18, 45),
		colors: [C.black, C.white, C.grey]
	}),
	generic({
		id: 'generic-power-strip-6-32x5x3',
		de: 'Steckdosenleiste 6-fach',
		en: 'Power strip 6-way',
		category: 'electronics',
		model: 'powerStrip',
		mount: 'on-top',
		dims: cm(32, 5, 3),
		colors: [C.white, C.black],
		power: 1
	}),
	generic({
		id: 'generic-power-strip-3-18x5x3',
		de: 'Steckdosenleiste 3-fach',
		en: 'Power strip 3-way',
		category: 'electronics',
		model: 'powerStrip',
		mount: 'on-top',
		dims: cm(18, 5, 3),
		colors: [C.white, C.black],
		power: 1
	})
];

export const genericDevices: CatalogEntry[] = [...monitors, ...tvStand, ...tvWall, ...others];
