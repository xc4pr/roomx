import type { CatalogEntry } from '#lib/core/catalog.ts';
import type { Item } from '#lib/core/schema.ts';
import type { Guide } from './snap.ts';
import type { SheetSnap } from '#lib/ui/sheet.ts';

export type PanelTabId = 'catalog' | 'item' | 'list' | 'brief';

export interface CatalogDrag {
	entry: CatalogEntry;
	x: number;
	y: number;
	px: number;
	py: number;
	over: 'board' | 'viewer' | null;
}

export interface CatalogDrop {
	entry: CatalogEntry;
	clientX: number;
	clientY: number;
}

export interface FurnishSession {
	view: '2d' | '3d';
	panelOpen: boolean;
	tab: PanelTabId;
	snap: SheetSnap;
	drag: CatalogDrag | null;
	guides: { roomId: string; list: Guide[] } | null;
	drop: CatalogDrop | null;
	placedId: string | null;
	vanishing: Item[];
	customOpen: boolean;
	categoriesOpen: boolean;
}

export const session = $state<FurnishSession>({
	view: '2d',
	panelOpen: true,
	tab: 'catalog',
	snap: 'half',
	drag: null,
	guides: null,
	drop: null,
	placedId: null,
	vanishing: [],
	customOpen: false,
	categoriesOpen: false
});

let placedTimer: ReturnType<typeof setTimeout> | undefined;

export function markPlaced(id: string): void {
	session.placedId = id;
	clearTimeout(placedTimer);
	placedTimer = setTimeout(() => {
		if (session.placedId === id) session.placedId = null;
	}, 700);
}

export function openPanel(tab: PanelTabId): void {
	session.tab = tab;
	session.panelOpen = true;
}

const VANISH_MS = 220;

export function markVanishing(item: Item): void {
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	const copy = { ...item, dims: { ...item.dims } };
	session.vanishing = [...session.vanishing.filter((entry) => entry.id !== item.id), copy];
	setTimeout(() => {
		session.vanishing = session.vanishing.filter((entry) => entry.id !== item.id);
	}, VANISH_MS);
}
