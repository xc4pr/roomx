import AirVent from '@lucide/svelte/icons/air-vent';
import AppWindow from '@lucide/svelte/icons/app-window';
import Archive from '@lucide/svelte/icons/archive';
import Bath from '@lucide/svelte/icons/bath';
import BrickWallFire from '@lucide/svelte/icons/brick-wall-fire';
import ChefHat from '@lucide/svelte/icons/chef-hat';
import Circle from '@lucide/svelte/icons/circle';
import DoorOpen from '@lucide/svelte/icons/door-open';
import Droplet from '@lucide/svelte/icons/droplet';
import Flame from '@lucide/svelte/icons/flame';
import Heater from '@lucide/svelte/icons/heater';
import LampCeiling from '@lucide/svelte/icons/lamp-ceiling';
import LampWallUp from '@lucide/svelte/icons/lamp-wall-up';
import Network from '@lucide/svelte/icons/network';
import Plug from '@lucide/svelte/icons/plug';
import ShowerHead from '@lucide/svelte/icons/shower-head';
import Toilet from '@lucide/svelte/icons/toilet';
import SquareDashed from '@lucide/svelte/icons/square-dashed';
import ToggleRight from '@lucide/svelte/icons/toggle-right';
import type { Component } from 'svelte';
import type { ElementKind } from '#lib/core/schema.ts';

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
	ceilingLamp: LampCeiling,
	roofWindow: AppWindow,
	acWall: AirVent,
	acFloor: AirVent,
	fireplace: Flame,
	stove: Flame,
	tiledStove: BrickWallFire,
	washbasin: Droplet,
	toilet: Toilet,
	shower: ShowerHead,
	bathtub: Bath,
	kitchenRun: ChefHat,
	column: Circle,
	freeObstacle: SquareDashed
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
		case 'acWall':
		case 'acFloor':
		case 'fireplace':
		case 'stove':
		case 'tiledStove':
		case 'washbasin':
		case 'toilet':
		case 'shower':
		case 'bathtub':
		case 'kitchenRun':
		case 'column':
		case 'freeObstacle':
			return 'var(--color-fixture)';
		default:
			return 'var(--color-electric)';
	}
}
