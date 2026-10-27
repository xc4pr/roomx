import { Group, Vector3 } from 'three';
import type { CatalogLookup } from '#lib/core/catalog.ts';
import type { Item, ModelType } from '#lib/core/schema.ts';
import { degToRad, MM, toWorld } from './coords.ts';
import { buildFurniture } from './furniture/index.ts';
import { railingRuns } from '#lib/core/outdoor.ts';
import { buildRoom } from './room/index.ts';
import type { RoomInfo } from './room/index.ts';
import {
	furnitureSpec,
	type RoomBuildOptions,
	type SceneContent,
	type SceneOptions
} from './types.ts';
import { disposeObject } from './viewer/dispose.ts';
import { roomFrames, sceneVariant, sharedOpenings, sharedSections } from './viewer/layout.ts';

export interface BuiltScene {
	root: Group;
	// Lookup from item id to its object for picking and selection.
	itemObjects: Map<string, Group>;
	roomGroups: Map<string, Group>;
	dispose(): void;
}

export interface SceneLamp {
	x: number;
	y: number;
	z: number;
	itemId?: string;
	height?: number;
}

const LAMP_HEIGHT: Partial<Record<ModelType, number>> = {
	floorLamp: 0.88,
	tableLamp: 0.75,
	pendantLamp: 0.2,
	wallLamp: 0.5
};

export function lampHeightFactor(model: ModelType): number | undefined {
	return LAMP_HEIGHT[model];
}

export function buildItemHolder(
	item: Item,
	lookup: CatalogLookup
): { holder: Group; model: ModelType } {
	const entry = item.catalogId ? lookup(item.catalogId) : undefined;
	const spec = furnitureSpec(item, entry);
	const object = buildFurniture(spec);
	const casts = item.category !== 'rug' && item.dims.h > 120;
	object.traverse((child) => {
		child.castShadow = casts;
		child.receiveShadow = true;
	});
	const holder = new Group();
	holder.name = `item-${item.id}`;
	holder.userData.itemId = item.id;
	holder.userData.dims = item.dims;
	holder.userData.model = spec.model;
	holder.add(object);
	holder.position.copy(toWorld({ x: item.x, y: item.y }, item.elevation));
	holder.rotation.y = degToRad(item.rotation);
	return { holder, model: spec.model };
}

export function buildScene(
	content: SceneContent,
	options: SceneOptions,
	lookup: CatalogLookup,
	wallHeightFactor = 1
): BuiltScene {
	const root = new Group();
	root.name = 'scene';
	const itemObjects = new Map<string, Group>();
	const roomGroups = new Map<string, Group>();
	const lamps: SceneLamp[] = [];
	const variant = sceneVariant(content);
	const shared = sharedOpenings(content);
	const sections = sharedSections(content);

	for (const frame of roomFrames(content)) {
		const { room } = frame;
		const group = new Group();
		group.name = `origin-${room.id}`;
		group.position.copy(frame.origin);
		group.rotation.y = frame.rotationY;
		const roomOptions: RoomBuildOptions = {
			...options,
			wallHeightFactor,
			shared: shared.get(room.id),
			sections: sections.get(room.id),
			railing: railingRuns(content.project.rooms, room)
		};
		const roomObject = buildRoom(room, roomOptions);
		group.add(roomObject);
		root.add(group);
		roomGroups.set(room.id, group);
		group.updateMatrixWorld(true);

		const info = roomObject.userData as RoomInfo;
		for (const lamp of info.lamps) {
			const world = group.localToWorld(new Vector3(lamp.x, lamp.y, lamp.z));
			lamps.push({ x: world.x, y: world.y, z: world.z });
		}

		for (const item of variant?.items ?? []) {
			if (item.roomId !== room.id) continue;
			const { holder, model } = buildItemHolder(item, lookup);
			group.add(holder);
			itemObjects.set(item.id, holder);

			const lampFactor = LAMP_HEIGHT[model];
			if (lampFactor !== undefined) {
				const height = item.dims.h * MM * lampFactor;
				const world = group.localToWorld(holder.position.clone().add(new Vector3(0, height, 0)));
				lamps.push({ x: world.x, y: world.y, z: world.z, itemId: item.id, height });
			}
		}
	}

	root.userData.lamps = lamps;
	const roomObjects = [...roomGroups.values()].map((group) => group.children[0]);
	return {
		root,
		itemObjects,
		roomGroups,
		dispose() {
			for (const roomObject of roomObjects) disposeObject(roomObject);
			root.removeFromParent();
		}
	};
}
