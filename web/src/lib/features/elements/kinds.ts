import AppWindow from '@lucide/svelte/icons/app-window';
import Archive from '@lucide/svelte/icons/archive';
import DoorOpen from '@lucide/svelte/icons/door-open';
import Heater from '@lucide/svelte/icons/heater';
import LampCeiling from '@lucide/svelte/icons/lamp-ceiling';
import LampWallUp from '@lucide/svelte/icons/lamp-wall-up';
import Network from '@lucide/svelte/icons/network';
import Plug from '@lucide/svelte/icons/plug';
import SquareDashed from '@lucide/svelte/icons/square-dashed';
import ToggleRight from '@lucide/svelte/icons/toggle-right';
import type { Component } from 'svelte';
import type { ElementKind } from '#lib/core/schema.ts';

export const PALETTE_KINDS: readonly ElementKind[] = [
	'door',
	'window',
	'builtin',
	'obstacle',
	'radiator',
	'socket',
	'switch',
	'wallLamp',
	'dataPort',
	'ceilingLamp'
];

export const KIND_ICONS: Record<ElementKind, Component<{ class?: string }>> = {
	door: DoorOpen,
	window: AppWindow,
	builtin: Archive,
	obstacle: SquareDashed,
	radiator: Heater,
	socket: Plug,
	switch: ToggleRight,
	wallLamp: LampWallUp,
	dataPort: Network,
	ceilingLamp: LampCeiling
};

export function kindColor(kind: ElementKind): string {
	switch (kind) {
		case 'window':
			return 'var(--color-window)';
		case 'door':
			return 'var(--color-door)';
		case 'builtin':
		case 'obstacle':
		case 'radiator':
			return 'var(--color-fixture)';
		default:
			return 'var(--color-electric)';
	}
}
