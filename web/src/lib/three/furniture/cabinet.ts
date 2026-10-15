import { Group } from 'three';
import { support } from './base.ts';
import { carcass } from './carcass.ts';
import { fronts } from './fronts.ts';
import { makePlan, type CabinetOptions } from './plan.ts';
import type { Palette } from './kit.ts';

export type { CabinetOptions, Fill } from './plan.ts';

export function cabinet(g: Group, p: Palette, o: CabinetOptions): void {
	const part = o.x ? new Group() : g;
	const plan = makePlan(part, p, o);
	support(plan);
	carcass(plan);
	fronts(plan);
	if (part !== g) {
		part.position.x = o.x ?? 0;
		g.add(part);
	}
}
