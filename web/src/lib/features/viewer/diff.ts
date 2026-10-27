import type { Item } from '#lib/core/schema.ts';
import { sceneRooms, sceneVariant } from '#lib/three/viewer/layout.ts';
import type { ItemTransform, SceneContent } from '#lib/three/types.ts';

export interface ItemSignature {
	look: string;
	transform: ItemTransform & { onItemId: string | null };
	item: Item;
}

export interface SceneSignature {
	layout: string;
	items: Map<string, ItemSignature>;
}

export interface ItemMove {
	id: string;
	transform: ItemTransform & { onItemId: string | null };
}

export type SceneChange =
	| { kind: 'none' }
	| { kind: 'rebuild'; added: string[] }
	| { kind: 'incremental'; moves: ItemMove[]; added: Item[]; removed: string[] };

export const MAX_INCREMENTAL_ADDS = 8;

function lookOf(item: Item): string {
	const {
		x: _x,
		y: _y,
		rotation: _rotation,
		elevation: _elevation,
		roomId: _roomId,
		onItemId: _on,
		...rest
	} = item;
	return JSON.stringify(rest);
}

export function signatureOf(content: SceneContent): SceneSignature {
	const variant = sceneVariant(content);
	const ids = new Set(content.roomIds);
	const items = new Map<string, ItemSignature>();
	for (const item of variant?.items ?? []) {
		if (!ids.has(item.roomId)) continue;
		items.set(item.id, {
			look: lookOf(item),
			transform: {
				x: item.x,
				y: item.y,
				rotation: item.rotation,
				elevation: item.elevation,
				roomId: item.roomId,
				onItemId: item.onItemId ?? null
			},
			item
		});
	}
	return {
		layout: JSON.stringify([
			content.project.id,
			content.variantId ?? content.project.activeVariantId ?? null,
			content.roomIds,
			sceneRooms(content),
			content.project.floors ?? null,
			content.project.stairs ?? null
		]),
		items
	};
}

function sameTransform(a: ItemMove['transform'], b: ItemMove['transform']): boolean {
	return (
		a.x === b.x &&
		a.y === b.y &&
		a.rotation === b.rotation &&
		a.elevation === b.elevation &&
		a.roomId === b.roomId &&
		a.onItemId === b.onItemId
	);
}

// Decides whether a store change needs a full scene rebuild or only cheap per-item updates.
export function diffScene(previous: SceneSignature | null, next: SceneSignature): SceneChange {
	if (!previous || previous.layout !== next.layout) {
		return { kind: 'rebuild', added: [] };
	}
	const added: Item[] = [];
	const removed: string[] = [];
	const moves: ItemMove[] = [];
	let restyled = false;
	for (const [id, entry] of next.items) {
		const before = previous.items.get(id);
		if (!before) {
			added.push(entry.item);
			continue;
		}
		if (before.look !== entry.look) restyled = true;
		if (!sameTransform(before.transform, entry.transform)) {
			moves.push({ id, transform: entry.transform });
		}
	}
	for (const id of previous.items.keys()) {
		if (!next.items.has(id)) removed.push(id);
	}
	if (restyled || added.length + removed.length > MAX_INCREMENTAL_ADDS) {
		return {
			kind: 'rebuild',
			added: added.length <= MAX_INCREMENTAL_ADDS ? added.map((item) => item.id) : []
		};
	}
	if (added.length === 0 && removed.length === 0 && moves.length === 0) return { kind: 'none' };
	return { kind: 'incremental', moves, added, removed };
}
