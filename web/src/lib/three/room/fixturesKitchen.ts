import { kitchenModuleSpans, kitchenUpperSpans } from '#lib/core/elements.ts';
import type { KitchenAppliance, KitchenModuleKind, KitchenRun } from '#lib/core/schema.ts';
import { MM } from '../coords.ts';
import type { Draw } from './draw.ts';
import { PALETTE, type MaterialSpec } from './materials.ts';
import { tinted } from './parts.ts';

const PLINTH = 0.1;
const WORKTOP = 0.038;
const TABLE_TOP = 0.04;
const FRONT = 0.018;
const GAP = 0.004;
const LIP = 0.02;
const HOB_INSET = 0.03;
const APPLIANCE_HEIGHT: Record<KitchenAppliance, number> = {
	oven: 0.595,
	steamer: 0.455,
	microwave: 0.38,
	fridge: 0
};

interface Segment {
	from: number;
	to: number;
	kind: KitchenModuleKind;
	appliances: readonly KitchenAppliance[];
}

interface Style {
	carcass: MaterialSpec;
	front: MaterialSpec;
	worktop: MaterialSpec;
	plinth: MaterialSpec;
	handle: MaterialSpec;
	dark: MaterialSpec;
	glass: MaterialSpec;
	steel: MaterialSpec;
	zone: MaterialSpec;
}

function styleOf(status: KitchenRun['status']): Style {
	return {
		carcass: tinted({ color: PALETTE.builtinCarcass }, status),
		front: tinted({ color: PALETTE.builtin, roughness: 0.6 }, status),
		worktop: tinted({ color: PALETTE.worktop, roughness: 0.55 }, status),
		plinth: tinted({ color: PALETTE.dark, roughness: 0.8 }, status),
		handle: tinted({ color: PALETTE.chrome, roughness: 0.3, metalness: 0.6 }, status),
		dark: tinted({ color: PALETTE.appliance, roughness: 0.4 }, status),
		glass: tinted({ color: '#121417', roughness: 0.1, metalness: 0.2 }, status),
		steel: tinted({ color: PALETTE.steel, roughness: 0.3, metalness: 0.6 }, status),
		zone: tinted({ color: '#6b7078', roughness: 0.4 }, status)
	};
}

function segments(run: KitchenRun): Segment[] {
	const result: Segment[] = [];
	let cursor = 0;
	for (const span of kitchenModuleSpans(run)) {
		result.push({
			from: span.from * MM,
			to: span.to * MM,
			kind: span.module.kind,
			appliances: span.module.appliances ?? []
		});
		cursor = span.to;
	}
	if (cursor < run.width)
		result.push({ from: cursor * MM, to: run.width * MM, kind: 'base', appliances: [] });
	return result;
}

class Kitchen {
	readonly draw: Draw;
	readonly s: Style;
	readonly a: number;
	readonly depth: number;
	readonly front: number;

	constructor(draw: Draw, run: KitchenRun) {
		this.draw = draw;
		this.s = styleOf(run.status);
		this.a = run.offset * MM;
		this.depth = run.depth * MM;
		this.front = -this.depth + LIP;
	}

	panel(spec: MaterialSpec, u0: number, u1: number, y0: number, y1: number, lip = 0): void {
		const z = this.front;
		this.draw.box(
			spec,
			[this.a + u0 + GAP / 2, y0 + GAP / 2, z - lip],
			[this.a + u1 - GAP / 2, y1 - GAP / 2, z + FRONT]
		);
	}

	bar(u: number, y: number, vertical: boolean, length = 0.14): void {
		const z = this.front;
		const half = length / 2;
		this.draw.box(
			this.s.handle,
			vertical
				? [this.a + u - 0.007, y - half, z - 0.02]
				: [this.a + u - half, y - 0.007, z - 0.02],
			vertical ? [this.a + u + 0.007, y + half, z] : [this.a + u + half, y + 0.007, z]
		);
	}

	door(
		u0: number,
		u1: number,
		y0: number,
		y1: number,
		hinge: 'start' | 'end',
		handleY?: number
	): void {
		this.panel(this.s.front, u0, u1, y0, y1);
		const u = hinge === 'start' ? u1 - 0.05 : u0 + 0.05;
		this.bar(u, handleY ?? (y0 + y1) / 2, true, Math.min(0.14, (y1 - y0) * 0.5));
	}

	doors(u0: number, u1: number, y0: number, y1: number, handleY?: number): void {
		const count = u1 - u0 > 0.7 ? 2 : 1;
		const width = (u1 - u0) / count;
		for (let i = 0; i < count; i++) {
			this.door(u0 + i * width, u0 + (i + 1) * width, y0, y1, i === 0 ? 'start' : 'end', handleY);
		}
	}

	drawer(u0: number, u1: number, y0: number, y1: number): void {
		this.panel(this.s.front, u0, u1, y0, y1);
		this.bar((u0 + u1) / 2, y1 - 0.04, false, Math.min(0.2, (u1 - u0) * 0.5));
	}

	applianceFront(u0: number, u1: number, y0: number, y1: number, kind: KitchenAppliance): void {
		this.panel(this.s.dark, u0, u1, y0, y1, 0.002);
		const z = this.front - 0.002;
		const a = this.a;
		const height = y1 - y0;
		if (kind === 'oven' || kind === 'steamer') {
			this.draw.box(
				this.s.glass,
				[a + u0 + 0.05, y0 + height * 0.12, z - 0.002],
				[a + u1 - 0.05, y0 + height * 0.68, z]
			);
		} else {
			this.draw.box(
				this.s.glass,
				[a + u0 + 0.04, y0 + height * 0.15, z - 0.002],
				[a + u0 + (u1 - u0) * 0.68, y1 - height * 0.15, z]
			);
		}
		this.draw.box(
			this.s.handle,
			[a + u0 + 0.06, y1 - height * 0.1 - 0.012, z - 0.016],
			[a + u1 - 0.06, y1 - height * 0.1 + 0.012, z - 0.002]
		);
	}
}

function baseBody(k: Kitchen, seg: Segment, bottom: number, top: number): void {
	const { draw, s, a } = k;
	draw.box(
		s.carcass,
		[a + seg.from, bottom + PLINTH, -k.depth + 2 * LIP],
		[a + seg.to, top - WORKTOP, 0]
	);
}

function stackFronts(k: Kitchen, seg: Segment, y0: number, y1: number): void {
	const heights = seg.appliances.map((appliance) => APPLIANCE_HEIGHT[appliance]);
	const stacked = heights.reduce((sum, value) => sum + value, 0);
	const room = y1 - y0;
	const upright = seg.appliances.filter((appliance) => appliance !== 'fridge');
	if (upright.length === 0 || stacked > room - 0.05) {
		k.drawer(seg.from, seg.to, y0, y1);
		return;
	}
	const below = room - stacked;
	let y = y1;
	for (const appliance of seg.appliances) {
		if (appliance === 'fridge') continue;
		const next = y - APPLIANCE_HEIGHT[appliance];
		k.applianceFront(seg.from, seg.to, next, y, appliance);
		y = next;
	}
	if (below >= 0.05) k.drawer(seg.from, seg.to, y0, y);
}

function baseSegment(k: Kitchen, seg: Segment, bottom: number, top: number): void {
	const { draw, s, a } = k;
	baseBody(k, seg, bottom, top);
	const y0 = bottom + PLINTH;
	const y1 = top - WORKTOP;
	const drawerTop = Math.min(0.2, (y1 - y0) / 3);
	switch (seg.kind) {
		case 'sink':
			k.doors(seg.from, seg.to, y0, y1);
			break;
		case 'hob':
			stackFronts(k, seg, y0, y1);
			break;
		case 'dishwasher':
			k.panel(s.front, seg.from, seg.to, y0, y1);
			draw.box(
				s.handle,
				[a + seg.from + 0.06, y1 - 0.06, k.front - 0.02],
				[a + seg.to - 0.06, y1 - 0.046, k.front]
			);
			break;
		default:
			if (seg.appliances.includes('fridge')) {
				k.door(seg.from, seg.to, y0, y1, 'start');
			} else if (seg.appliances.length > 0) {
				stackFronts(k, seg, y0, y1);
			} else {
				k.drawer(seg.from, seg.to, y1 - drawerTop, y1);
				k.doors(seg.from, seg.to, y0, y1 - drawerTop);
			}
	}
}

function tallSegment(k: Kitchen, seg: Segment, bottom: number, top: number): void {
	const { draw, s, a } = k;
	draw.box(s.carcass, [a + seg.from, bottom + PLINTH, -k.depth + 2 * LIP], [a + seg.to, top, 0]);
	const y0 = bottom + PLINTH;
	if (seg.appliances.includes('fridge')) {
		const split = y0 + (top - y0) * 0.36;
		k.panel(s.front, seg.from, seg.to, y0, split);
		k.panel(s.front, seg.from, seg.to, split, top);
		k.bar(seg.to - 0.05, split - 0.18, true, 0.3);
		k.bar(seg.to - 0.05, split + 0.2, true, 0.3);
		return;
	}
	const upright = seg.appliances.filter((appliance) => appliance !== 'fridge');
	if (upright.length === 0) {
		const split = y0 + (top - y0) * 0.55;
		k.panel(s.front, seg.from, seg.to, y0, split);
		k.panel(s.front, seg.from, seg.to, split, top);
		k.bar(seg.to - 0.05, split - 0.15, true, 0.3);
		k.bar(seg.to - 0.05, split + 0.15, true, 0.3);
		return;
	}
	const stacked = upright.reduce((sum, appliance) => sum + APPLIANCE_HEIGHT[appliance], 0);
	const start = Math.min(y0 + 0.4, top - stacked - 0.1);
	k.drawer(seg.from, seg.to, y0, Math.max(y0 + 0.05, start));
	let y = Math.max(y0 + 0.05, start);
	for (const appliance of upright) {
		const next = y + APPLIANCE_HEIGHT[appliance];
		k.applianceFront(seg.from, seg.to, y, next, appliance);
		y = next;
	}
	if (top - y > 0.05) {
		k.panel(s.front, seg.from, seg.to, y, top);
		k.bar(seg.to - 0.05, y + 0.12, true, Math.min(0.2, top - y - 0.1));
	}
}

function tableSegment(k: Kitchen, seg: Segment, bottom: number, top: number): void {
	const { draw, s, a } = k;
	draw.box(s.worktop, [a + seg.from, top - TABLE_TOP, -k.depth], [a + seg.to, top, 0]);
	for (const u of [seg.from + 0.04, seg.to - 0.04]) {
		draw.box(
			s.steel,
			[a + u - 0.025, bottom, -k.depth + 0.03],
			[a + u + 0.025, top - TABLE_TOP, -k.depth + 0.08]
		);
	}
}

function sinkTop(k: Kitchen, seg: Segment, top: number): void {
	const { draw, s, a } = k;
	const u0 = a + seg.from + 0.06;
	const u1 = a + seg.to - 0.06;
	const z0 = -k.depth + 0.07;
	const z1 = -0.1;
	const width = u1 - u0;
	const basin = Math.min(width, 0.78);
	const start = u0 + (width - basin) / 2;
	draw.box(s.steel, [start, top, z0], [start + basin, top + 0.002, z1]);
	draw.box(
		s.dark,
		[start + 0.025, top + 0.002, z0 + 0.025],
		[start + basin - 0.025, top + 0.003, z1 - 0.025]
	);
	const tapU = start + basin / 2;
	draw.cylinder(s.handle, [tapU, top + 0.1, -0.05], 0.015, 0.2, 'y', 8);
	draw.box(s.handle, [tapU - 0.008, top + 0.19, -0.05], [tapU + 0.008, top + 0.208, -0.3]);
}

function hobTop(k: Kitchen, seg: Segment, top: number): void {
	const { draw, s, a } = k;
	const width = seg.to - seg.from;
	const u0 = a + seg.from + HOB_INSET;
	const u1 = a + seg.to - HOB_INSET;
	const z0 = -k.depth + 0.06;
	const z1 = -0.06;
	draw.box(s.glass, [u0, top, z0], [u1, top + 0.006, z1]);
	const radius = Math.min(0.09, (width - 2 * HOB_INSET) / 4.4, (z1 - z0) / 4.4);
	const cx = (u0 + u1) / 2;
	const cz = (z0 + z1) / 2;
	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) {
			draw.cylinder(
				s.zone,
				[cx + sx * radius * 1.15, top + 0.0065, cz + sz * radius * 1.15],
				radius,
				0.001,
				'y',
				12
			);
		}
	}
}

function hood(k: Kitchen, seg: Segment, run: KitchenRun): void {
	const upper = run.upper;
	if (!upper) return;
	const { draw, s, a } = k;
	const bottom = upper.elevation * MM;
	const top = bottom + upper.height * MM;
	const u0 = a + seg.from;
	const u1 = a + seg.to;
	draw.box(s.steel, [u0, bottom, -Math.min(0.5, upper.depth * MM + 0.1)], [u1, bottom + 0.1, 0]);
	const mid = (u0 + u1) / 2;
	draw.box(s.steel, [mid - 0.15, bottom + 0.1, -0.25], [mid + 0.15, top, 0]);
}

function uppers(k: Kitchen, run: KitchenRun, hobs: readonly Segment[]): void {
	const upper = run.upper;
	if (!upper) return;
	const { draw, s, a } = k;
	const bottom = upper.elevation * MM;
	const top = bottom + upper.height * MM;
	const depth = upper.depth * MM;
	const cuts = hobs.map((seg) => [seg.from, seg.to] as const);
	const free = kitchenUpperSpans(run).flatMap((span) => {
		let pieces: [number, number][] = [[span.from * MM, span.to * MM]];
		for (const [from, to] of cuts) {
			pieces = pieces.flatMap(([f, t]) => {
				if (to <= f || from >= t) return [[f, t] as [number, number]];
				const result: [number, number][] = [];
				if (from > f) result.push([f, from]);
				if (to < t) result.push([to, t]);
				return result;
			});
		}
		return pieces;
	});
	for (const [from, to] of free) {
		const u0 = a + from;
		const u1 = a + to;
		draw.box(s.carcass, [u0, bottom, -depth + 2 * LIP], [u1, top, 0]);
		const count = Math.max(1, Math.round((to - from) / 0.6));
		const width = (to - from) / count;
		for (let i = 0; i < count; i++) {
			const l = u0 + i * width + GAP / 2;
			const r = u0 + (i + 1) * width - GAP / 2;
			draw.box(
				s.front,
				[l, bottom + GAP / 2, -depth + LIP],
				[r, top - GAP / 2, -depth + LIP + FRONT]
			);
			const hu = i % 2 === 0 ? r - 0.05 : l + 0.05;
			draw.box(
				s.handle,
				[hu - 0.007, bottom + 0.04, -depth],
				[hu + 0.007, bottom + 0.18, -depth + LIP]
			);
		}
	}
}

export function addKitchenRun(draw: Draw, run: KitchenRun, ceiling: number): void {
	const k = new Kitchen(draw, run);
	const { s, a } = k;
	const bottom = run.elevation * MM;
	const top = (run.elevation + run.height) * MM;
	const tall = Math.min(bottom + run.tallHeight * MM, ceiling);
	const parts = segments(run);
	let worktopStart: number | undefined;
	const closeWorktop = (end: number): void => {
		if (worktopStart === undefined) return;
		draw.box(s.worktop, [a + worktopStart, top - WORKTOP, -k.depth], [a + end, top, 0]);
		worktopStart = undefined;
	};
	for (const seg of parts) {
		const carriesWorktop = seg.kind !== 'tall' && seg.kind !== 'table';
		if (seg.kind !== 'table') {
			draw.box(s.plinth, [a + seg.from, bottom, -k.depth + 0.06], [a + seg.to, bottom + PLINTH, 0]);
		}
		if (carriesWorktop) worktopStart ??= seg.from;
		else closeWorktop(seg.from);
		switch (seg.kind) {
			case 'tall':
				tallSegment(k, seg, bottom, tall);
				break;
			case 'table':
				tableSegment(k, seg, bottom, top);
				break;
			default:
				baseSegment(k, seg, bottom, top);
		}
	}
	closeWorktop(parts.length > 0 ? parts[parts.length - 1].to : run.width * MM);
	for (const seg of parts) {
		if (seg.kind === 'sink') sinkTop(k, seg, top);
		if (seg.kind === 'hob') hobTop(k, seg, top);
	}
	const hobs = parts.filter((seg) => seg.kind === 'hob');
	uppers(k, run, hobs);
	for (const seg of hobs) hood(k, seg, run);
}
