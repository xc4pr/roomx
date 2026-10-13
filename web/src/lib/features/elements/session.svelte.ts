import type { ElementKind } from '#lib/core/schema.ts';

export interface DropRequest {
	kind: ElementKind;
	roomId: string;
	clientX: number;
	clientY: number;
}

export interface ElementsSession {
	elevationOpen: boolean;
	dragKind: ElementKind | null;
	dragRoomId: string | null;
	pointer: { clientX: number; clientY: number } | null;
	drop: DropRequest | null;
}

export const session = $state<ElementsSession>({
	elevationOpen: false,
	dragKind: null,
	dragRoomId: null,
	pointer: null,
	drop: null
});

export function endPaletteDrag(): void {
	session.dragKind = null;
	session.dragRoomId = null;
	session.pointer = null;
}
