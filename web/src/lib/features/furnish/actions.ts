import { lookup } from '#lib/catalog/index.ts';
import type { CatalogEntry } from '#lib/core/catalog.ts';
import {
	freeWallSpans,
	normalizeDegrees,
	rotate,
	wallPoint,
	walls,
	type Vec
} from '#lib/core/geometry.ts';
import type { Brief, Item, Room } from '#lib/core/schema.ts';
import { pick, t } from '#lib/i18n/index.svelte.ts';
import { store } from '#lib/state/project.svelte.ts';
import { selectRoom, ui } from '#lib/state/ui.svelte.ts';
import { toasts } from '#lib/ui/toast.svelte.ts';
import { messages } from './i18n.ts';
import { itemFromCatalog, itemMount, type NewItem } from './place.ts';
import { markPlaced, markVanishing } from './session.svelte.ts';
import {
	canCarry,
	computePlacement,
	defaultWallElevation,
	descendantsOf,
	findFreeSpot,
	interiorPoint,
	type PlaceSubject,
	type Placement
} from './snap.ts';

export function itemLabel(item: Pick<Item, 'name' | 'catalogId'>): string {
	const entry = item.catalogId ? lookup(item.catalogId) : undefined;
	if (entry && (item.name === '' || item.name === entry.name.de || item.name === entry.name.en)) {
		return pick(entry.name);
	}
	return item.name;
}

export function subjectOf(item: Item): PlaceSubject {
	return {
		dims: item.dims,
		mount: itemMount(item),
		category: item.category,
		rotation: item.rotation,
		elevation: item.elevation,
		...(item.onItemId ? { onItemId: item.onItemId } : {})
	};
}

export function thresholdFor(pxPerMm: number): number {
	return Math.max(30, Math.min(250, Math.round(14 / Math.max(pxPerMm, 0.001))));
}

export function currentRoom(): Room | undefined {
	const rooms = store.project?.rooms ?? [];
	return (
		rooms.find((room) => room.id === ui.focusRoomId) ??
		rooms.find((room) => room.id === ui.selectedRoomId) ??
		rooms[0]
	);
}

export function roomItems(roomId: string, excludeId?: string): Item[] {
	const items = store.activeVariant?.items ?? [];
	const skip = new Set<string>();
	if (excludeId) {
		skip.add(excludeId);
		for (const child of descendantsOf(items, excludeId)) skip.add(child.id);
	}
	return items.filter((item) => item.roomId === roomId && !skip.has(item.id));
}

function wallSpot(room: Room): Vec | undefined {
	let best: { from: number; to: number; wall: number } | undefined;
	for (const wall of walls(room.polygon)) {
		for (const span of freeWallSpans(room, wall.number)) {
			if (!best || span.to - span.from > best.to - best.from) {
				best = { ...span, wall: wall.number };
			}
		}
	}
	if (!best) return undefined;
	const target = walls(room.polygon)[best.wall - 1];
	return wallPoint(target, (best.from + best.to) / 2, 100);
}

const SURFACE_ORDER = ['desk', 'table', 'sideboard', 'tvUnit', 'dresser', 'nightstand', 'shelf'];

function smartPlacement(subject: PlaceSubject, room: Room, others: Item[]): Placement {
	const context = { room, others, threshold: 60 };
	if (subject.mount === 'wall') {
		return computePlacement(subject, wallSpot(room) ?? interiorPoint(room.polygon), context);
	}
	if (subject.mount === 'ceiling') {
		return computePlacement(subject, interiorPoint(room.polygon), context);
	}
	if (subject.mount === 'on-top' || subject.category === 'lamp' || subject.category === 'decor') {
		const selected = ui.selectedItemId
			? others.find((item) => item.id === ui.selectedItemId)
			: null;
		const carriers = others
			.filter((item) => canCarry(item) && SURFACE_ORDER.includes(item.category))
			.sort((a, b) => SURFACE_ORDER.indexOf(a.category) - SURFACE_ORDER.indexOf(b.category));
		const carrier = selected && canCarry(selected) ? selected : carriers[0];
		if (carrier) {
			const placed = computePlacement(subject, { x: carrier.x, y: carrier.y }, context);
			if (placed.onItemId) return placed;
		}
	}
	const spot = findFreeSpot(room, others, subject.dims, subject.rotation);
	return computePlacement(subject, spot ?? interiorPoint(room.polygon), {
		...context,
		wallSnap: false,
		itemSnap: false
	});
}

function commitNew(template: NewItem, room: Room, placement: Placement): string | undefined {
	const id = store.addItem({
		...template,
		roomId: room.id,
		x: placement.x,
		y: placement.y,
		rotation: placement.rotation,
		elevation: placement.elevation,
		...(placement.onItemId ? { onItemId: placement.onItemId } : {})
	});
	if (!id) return undefined;
	if (ui.selectedRoomId !== room.id) selectRoom(room.id);
	ui.selectedItemId = id;
	markPlaced(id);
	navigator.vibrate?.(10);
	return id;
}

export function insertItem(
	template: NewItem,
	room: Room,
	options: { raw?: Vec; threshold?: number } = {}
): string | undefined {
	const mount = itemMount(template);
	const subject: PlaceSubject = {
		dims: template.dims,
		mount,
		category: template.category,
		rotation: 0,
		elevation: mount === 'wall' ? defaultWallElevation(template.dims.h, room.height) : 0
	};
	const others = roomItems(room.id);
	const placement = options.raw
		? computePlacement(subject, options.raw, {
				room,
				others,
				threshold: options.threshold ?? 100
			})
		: smartPlacement(subject, room, others);
	return commitNew(template, room, placement);
}

export function addCatalogEntry(
	entry: CatalogEntry,
	room: Room,
	options: { raw?: Vec; threshold?: number } = {}
): string | undefined {
	return insertItem(itemFromCatalog(entry, room.id, pick(entry.name)), room, options);
}

export function previewPlacement(
	entry: Pick<CatalogEntry, 'dims' | 'mount' | 'category'>,
	room: Room,
	raw: Vec,
	threshold: number
): Placement {
	const subject: PlaceSubject = {
		dims: entry.dims,
		mount: entry.mount,
		category: entry.category,
		rotation: 0,
		elevation: entry.mount === 'wall' ? defaultWallElevation(entry.dims.h, room.height) : 0
	};
	return computePlacement(subject, raw, { room, others: roomItems(room.id), threshold });
}

export interface Target {
	x: number;
	y: number;
	rotation: number;
	elevation: number;
	onItemId?: string;
}

export function applyPlacement(itemId: string, roomId: string, target: Target, key: string): void {
	store.mutate(
		(project) => {
			const variant = project.variants.find(
				(candidate) => candidate.id === project.activeVariantId
			);
			const item = variant?.items.find((candidate) => candidate.id === itemId);
			if (!variant || !item) return;
			const from = { x: item.x, y: item.y, rotation: item.rotation, elevation: item.elevation };
			const to = {
				x: Math.round(target.x),
				y: Math.round(target.y),
				rotation: normalizeDegrees(target.rotation),
				elevation: Math.round(target.elevation)
			};
			item.roomId = roomId;
			Object.assign(item, to);
			if (target.onItemId) item.onItemId = target.onItemId;
			else delete item.onItemId;
			const carry = (carrierId: string) => {
				for (const child of variant.items.filter((candidate) => candidate.onItemId === carrierId)) {
					const local = rotate(
						{ x: child.x - from.x, y: child.y - from.y },
						to.rotation - from.rotation
					);
					child.roomId = roomId;
					child.x = Math.round(to.x + local.x);
					child.y = Math.round(to.y + local.y);
					child.rotation = normalizeDegrees(child.rotation + to.rotation - from.rotation);
					child.elevation += to.elevation - from.elevation;
					carry(child.id);
				}
			};
			carry(item.id);
		},
		{ coalesce: key }
	);
}

export function selectItem(item: Item | undefined): void {
	if (!item) {
		ui.selectedItemId = null;
		return;
	}
	if (ui.selectedRoomId !== item.roomId) selectRoom(item.roomId);
	ui.selectedItemId = item.id;
}

export function rotateItem(id: string, delta: number): void {
	const item = store.item(id);
	if (!item || item.locked) return;
	store.transformItem(id, { rotation: item.rotation + delta });
}

export function turnItem(id: string, direction: 1 | -1, step = 15): void {
	const item = store.item(id);
	if (!item || item.locked) return;
	const snapped =
		direction > 0
			? Math.floor(item.rotation / step + 1e-6) + 1
			: Math.ceil(item.rotation / step - 1e-6) - 1;
	store.transformItem(id, { rotation: snapped * step });
}

let nudgeTimer: ReturnType<typeof setTimeout> | undefined;

export function sealSoon(delay = 600): void {
	clearTimeout(nudgeTimer);
	nudgeTimer = setTimeout(() => store.sealHistory(), delay);
}

export function nudgeItem(id: string, dx: number, dy: number): void {
	const item = store.item(id);
	if (!item || item.locked) return;
	store.transformItem(id, { x: item.x + dx, y: item.y + dy }, { coalesce: `nudge-${id}` });
	sealSoon();
}

export function duplicateItem(id: string): string | undefined {
	const source = store.item(id);
	const room = source ? store.room(source.roomId) : undefined;
	if (!source || !room) return undefined;
	const { id: _id, locked: _locked, onItemId: _onItemId, dims, ...rest } = source;
	const subject = subjectOf(source);
	const placement = computePlacement(
		{ ...subject, onItemId: undefined },
		{ x: source.x + 250, y: source.y - 250 },
		{ room, others: roomItems(room.id), threshold: 60, wallSnap: false, itemSnap: false }
	);
	return commitNew({ ...rest, dims: { ...dims } }, room, placement);
}

export function deleteItem(id: string): void {
	const item = store.item(id);
	if (!item) return;
	const label = itemLabel(item);
	markVanishing(item);
	store.removeItem(id);
	if (ui.selectedItemId === id) ui.selectedItemId = null;
	toasts.show({
		message: t(messages, 'deleted', { name: label }),
		actionLabel: t(messages, 'undo'),
		onaction: () => store.undo()
	});
}

export function emptyBrief(): Brief {
	return { persons: { adults: 2, children: 0 }, bedSizes: [], workstations: [] };
}
