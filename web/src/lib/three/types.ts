import type { RailingRun } from '#lib/core/outdoor.ts';
import type { Vec } from '#lib/core/geometry.ts';
import type { Object3D } from 'three';
import type { CatalogEntry, Look } from '#lib/core/catalog.ts';
import type { Dims, Item, ModelType, Project, Room } from '#lib/core/schema.ts';

// World space: metres, Y up. A room point (x, y) in mm maps to X = x / 1000, Z = -y / 1000.
// Item rotation (degrees counter-clockwise in plan) equals rotation.y in radians; at 0 the front faces -Z.

export type WallMode = 'up' | 'cutaway' | 'down';
export type CameraMode = 'orbit' | 'walk';

export interface SceneContent {
	project: Project;
	// One id = single room in its own coordinates; several = apartment arranged by board position.
	roomIds: string[];
	variantId?: string;
}

export interface SceneOptions {
	wallMode: WallMode;
	ceiling: boolean;
	electrical: boolean;
	lightsOn: boolean;
}

export const DEFAULT_SCENE_OPTIONS: SceneOptions = {
	wallMode: 'cutaway',
	ceiling: false,
	electrical: true,
	lightsOn: false
};

export interface FloorHit {
	roomId: string;
	x: number;
	y: number;
	// True when the pointer was not over this room and the point was clamped to its boundary.
	outside?: boolean;
}

export interface FloorPickOptions {
	// Also return points outside all rooms, clamped to the nearest room or to `roomId`.
	clamp?: boolean;
	roomId?: string;
	// Height of the horizontal plane to intersect, in mm above the floor. Default 0.
	elevation?: number;
}

export interface ItemHit {
	itemId: string;
	// Height of the touched point above the floor in mm.
	height: number;
}

export interface ItemTransform {
	x: number;
	y: number;
	rotation: number;
	elevation: number;
	roomId?: string;
	// The item this one stands on; null clears it. Leave undefined to keep the stacking as is.
	onItemId?: string | null;
}

export interface ViewInsets {
	top?: number;
	right?: number;
	bottom?: number;
	left?: number;
}

export interface ContentSettings {
	animate?: boolean;
	// Items that should pop in after the rebuild.
	pop?: string[];
}

export interface SceneViewer {
	setContent(content: SceneContent, options?: ContentSettings): void;
	setOptions(options: Partial<SceneOptions>): void;
	setCameraMode(mode: CameraMode): void;
	setWalkInput(move: { forward: number; strafe: number }): void;
	setSelectedItem(itemId: string | null): void;
	setControlsEnabled(enabled: boolean): void;
	pickItem(clientX: number, clientY: number): string | null;
	pickItemHit(clientX: number, clientY: number): ItemHit | null;
	pickFloor(clientX: number, clientY: number, options?: FloorPickOptions): FloorHit | null;
	// Moves an existing item and everything stacked on it without rebuilding the scene.
	moveItem(itemId: string, transform: ItemTransform): void;
	addItem(item: Item, options?: { pop?: boolean }): void;
	removeItem(itemId: string, options?: { animate?: boolean }): void;
	popItem(itemId: string): void;
	// Keeps the scene centred in the part of the canvas that is not covered by UI.
	setViewInsets(insets: ViewInsets): void;
	// Horizontal viewing direction as a unit vector in plan coordinates (x right, y up).
	viewDirection(): { x: number; y: number };
	resetCamera(): void;
	requestRender(): void;
	screenshot(): Promise<Blob>;
	dispose(): void;
}

export interface SharedOpenings {
	// Openings in a shared wall whose door leaf or window the neighbour room builds; here only the hole is cut.
	silent: ReadonlySet<string>;
	// Openings that the neighbour room cuts at the very same place; their reveals sit slightly behind.
	covered: ReadonlySet<string>;
}

// Part of a wall (mm along the wall, from `from` to `to`) that a neighbour room shares. `thickness` is the whole
// distance between the two interior faces; each of the two rooms builds half of it.
// A shared stretch of wall. Without owner each room builds half of it; the indoor room next to an
// outdoor area builds it whole, the outdoor area (or conservatory) none of it.
export interface WallSection {
	wall: number;
	from: number;
	to: number;
	thickness: number;
	owner?: 'whole' | 'none';
}

export interface RoomBuildOptions extends SceneOptions {
	wallHeightFactor: number;
	shared?: SharedOpenings;
	sections?: readonly WallSection[];
	// Balcony railing along the free edges (railingRuns).
	railing?: readonly RailingRun[];
	// Stairwell openings (room coordinates) in this room's floor and ceiling.
	stairwell?: { floor: readonly Vec[][]; ceiling: readonly Vec[][] };
}

export type RoomBuilder = (room: Room, options: RoomBuildOptions) => Object3D;

export interface FurnitureSpec {
	model: ModelType;
	dims: Dims;
	color: string;
	look?: Look;
}

// Returns an object centred on its footprint, standing on y = 0, front towards -Z, sized in metres.
export type FurnitureBuilder = (spec: FurnitureSpec) => Object3D;

export function furnitureSpec(item: Item, entry: CatalogEntry | undefined): FurnitureSpec {
	const model = item.model ?? entry?.model ?? 'box';
	return {
		model,
		dims: item.dims,
		color: item.color ?? entry?.colors[0] ?? '#b8b2a7',
		...(entry?.look && entry.model === model ? { look: entry.look } : {})
	};
}

export interface RoomViews {
	top: Blob;
	iso: Blob[];
}
