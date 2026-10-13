export type KeyToken = 'mod' | 'shift' | 'esc' | 'del' | 'arrows' | (string & {});

export interface ShortcutEntry {
	id: string;
	keys: readonly (readonly KeyToken[])[];
}

export interface ShortcutGroup {
	id: 'general' | 'plan' | 'elements';
	entries: readonly ShortcutEntry[];
}

export const SHORTCUT_GROUPS = [
	{
		id: 'general',
		entries: [
			{ id: 'undo', keys: [['mod', 'Z']] },
			{ id: 'redo', keys: [['mod', 'shift', 'Z']] },
			{ id: 'escape', keys: [['esc']] },
			{ id: 'help', keys: [['?']] }
		]
	},
	{
		id: 'plan',
		entries: [
			{ id: 'nudgeRoom', keys: [['arrows']] },
			{ id: 'nudgeRoomBig', keys: [['shift', 'arrows']] },
			{ id: 'rotate', keys: [['R']] },
			{ id: 'rotateBack', keys: [['shift', 'R']] },
			{ id: 'deleteRoom', keys: [['del']] },
			{ id: 'zoom', keys: [['+'], ['-']] },
			{ id: 'fit', keys: [['0']] }
		]
	},
	{
		id: 'elements',
		entries: [
			{ id: 'nudgeElement', keys: [['arrows']] },
			{ id: 'nudgeElementBig', keys: [['shift', 'arrows']] },
			{ id: 'deleteElement', keys: [['del']] },
			{ id: 'cancelPlacing', keys: [['esc']] }
		]
	}
] as const satisfies readonly ShortcutGroup[];

export function isApplePlatform(platform: string, maxTouchPoints = 0): boolean {
	return /mac|iphone|ipad|ipod/i.test(platform) || (platform === '' && maxTouchPoints > 1);
}

export function isTypingTarget(target: EventTarget | null): boolean {
	return (
		target instanceof Element &&
		target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') !==
			null
	);
}
