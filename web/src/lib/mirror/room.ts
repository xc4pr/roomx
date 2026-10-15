import type { Perspective, Room } from '#lib/core/schema.ts';
import type { MirrorRoom } from './types.ts';

// A schema-valid Room for generateTour and MiniPlan on the phone. Element ids are `e<index>`.
export function roomFromMirror(room: MirrorRoom): Room {
	void room;
	throw new Error('not implemented');
}

// `element:<real id>` -> `element:e3` (same for `electric:`); other keys stay as they are.
export function toPhoneStepKey(stepKey: string, elementIds: readonly string[]): string {
	void stepKey;
	void elementIds;
	throw new Error('not implemented');
}

// Inverse of toPhoneStepKey; null when the key points to an element index that does not exist.
export function toHostStepKey(stepKey: string, elementIds: readonly string[]): string | null {
	void stepKey;
	void elementIds;
	throw new Error('not implemented');
}

// Perspective for a host step key in the room as it is now; a generic perspective when the step no longer exists.
export function perspectiveFor(room: Room, stepKey: string): Perspective {
	void room;
	void stepKey;
	throw new Error('not implemented');
}
