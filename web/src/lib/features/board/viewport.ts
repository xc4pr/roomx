import { getContext, setContext } from 'svelte';
import type { Vec } from '#lib/core/geometry.ts';
import type { Room } from '#lib/core/schema.ts';

// Layers render inside a group that is already in room coordinates (mm, y up).
// The parent flips y, so text must be drawn with the board's label helper or counter-flipped.
export interface Viewport {
	readonly pxPerMm: number;
	clientToBoard(clientX: number, clientY: number): Vec;
	clientToRoom(room: Pick<Room, 'boardPos'>, clientX: number, clientY: number): Vec;
	roomToClient(room: Pick<Room, 'boardPos'>, point: Vec): Vec;
}

const KEY = Symbol('viewport');

export function setViewport(viewport: Viewport): void {
	setContext(KEY, viewport);
}

export function getViewport(): Viewport {
	return getContext<Viewport>(KEY);
}

export interface RoomLayerProps {
	room: Room;
	interactive: boolean;
}
