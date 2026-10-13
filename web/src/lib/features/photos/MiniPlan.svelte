<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import { cornerLabel, isConvexCorner, walls, type Vec } from '#lib/core/geometry.ts';
	import { isWallElement, type Room } from '#lib/core/schema.ts';
	import { pick } from '#lib/i18n/index.svelte.ts';
	import type { TourStep } from './tour.ts';

	interface Props {
		room: Room;
		step: TourStep;
		class?: string;
	}

	let { room, step, class: extra = '' }: Props = $props();

	const WIDTH = 320;
	const HEIGHT = 240;
	const PAD = 34;
	const CONE_HALF_ANGLE = 34;
	const uid = $props.id();

	const frame = $derived.by(() => {
		const xs = room.polygon.map((p) => p.x);
		const ys = room.polygon.map((p) => p.y);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);
		const spanX = Math.max(1, maxX - minX);
		const spanY = Math.max(1, maxY - minY);
		const factor = Math.min((WIDTH - 2 * PAD) / spanX, (HEIGHT - 2 * PAD) / spanY);
		const left = (WIDTH - spanX * factor) / 2;
		const top = (HEIGHT - spanY * factor) / 2;
		return { minX, maxY, factor, left, top };
	});

	function project(p: Vec): Vec {
		return {
			x: frame.left + (p.x - frame.minX) * frame.factor,
			y: frame.top + (frame.maxY - p.y) * frame.factor
		};
	}

	function unit(v: Vec): Vec {
		const len = Math.hypot(v.x, v.y) || 1;
		return { x: v.x / len, y: v.y / len };
	}

	const wallList = $derived(walls(room.polygon));
	const points = $derived(room.polygon.map(project));
	const outline = $derived(points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));

	const corners = $derived(
		room.polygon.map((corner, i) => {
			const n = room.polygon.length;
			const incoming = wallList[(i - 1 + n) % n];
			const outgoing = wallList[i];
			const inward = unit({
				x: incoming.inward.x + outgoing.inward.x,
				y: incoming.inward.y + outgoing.inward.y
			});
			const at = project(corner);
			return {
				label: cornerLabel(i),
				x: at.x - inward.x * 15,
				y: at.y + inward.y * 15,
				convex: isConvexCorner(room.polygon, i)
			};
		})
	);

	const wallLabels = $derived(
		wallList.map((wall) => {
			const mid = project({
				x: wall.start.x + (wall.direction.x * wall.length) / 2,
				y: wall.start.y + (wall.direction.y * wall.length) / 2
			});
			return {
				number: wall.number,
				x: mid.x + wall.inward.x * 13,
				y: mid.y - wall.inward.y * 13
			};
		})
	);

	const marks = $derived(
		room.elements.filter(isWallElement).flatMap((element) => {
			const wall = wallList[element.wall - 1];
			if (!wall) return [];
			const from = project({
				x: wall.start.x + wall.direction.x * element.offset,
				y: wall.start.y + wall.direction.y * element.offset
			});
			const to = project({
				x: wall.start.x + wall.direction.x * (element.offset + element.width),
				y: wall.start.y + wall.direction.y * (element.offset + element.width)
			});
			return [{ id: element.id, kind: element.kind, from, to }];
		})
	);

	const activeWall = $derived.by(() => {
		const { kind, ref } = step.perspective;
		if (kind === 'wall') return Number(ref);
		if (kind === 'element') {
			const element = room.elements.find((candidate) => candidate.id === ref);
			return element && isWallElement(element) ? element.wall : 0;
		}
		return 0;
	});
	const activeCorner = $derived(step.perspective.kind === 'corner' ? step.perspective.ref : '');
	const flat = $derived(step.perspective.kind === 'ceiling' || step.perspective.kind === 'floor');

	const camera = $derived(project(step.position));
	const coneLength = $derived(Math.min(WIDTH, HEIGHT) * 0.5);
	const cone = $derived.by(() => {
		const screen = { x: step.direction.x, y: -step.direction.y };
		const spread = (CONE_HALF_ANGLE * Math.PI) / 180;
		const edge = (angle: number): string => {
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			const x = camera.x + (screen.x * cos - screen.y * sin) * coneLength;
			const y = camera.y + (screen.x * sin + screen.y * cos) * coneLength;
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		};
		return `${camera.x.toFixed(1)},${camera.y.toFixed(1)} ${edge(-spread)} ${edge(spread)}`;
	});
</script>

<svg
	viewBox="0 0 {WIDTH} {HEIGHT}"
	class="block h-auto w-full rounded-lg bg-surface-2 {extra}"
	role="img"
	aria-label={pick(step.perspective.caption)}
	data-testid="mini-plan"
>
	<defs>
		<clipPath id="clip-{uid}"><polygon points={outline} /></clipPath>
	</defs>
	<polygon points={outline} class="fill-surface stroke-none" />
	<g clip-path="url(#clip-{uid})">
		{#if flat}
			<circle cx={camera.x} cy={camera.y} r={coneLength * 0.5} class="fill-accent/15" />
		{:else}
			<polygon points={cone} class="fill-accent/25 stroke-accent" stroke-width="1.5" />
		{/if}
	</g>
	<polygon
		points={outline}
		class="fill-none stroke-text/60"
		stroke-width="2.5"
		stroke-linejoin="round"
	/>
	{#each marks as mark (mark.id)}
		<line
			x1={mark.from.x}
			y1={mark.from.y}
			x2={mark.to.x}
			y2={mark.to.y}
			stroke-width={mark.kind === 'socket' ||
			mark.kind === 'switch' ||
			mark.kind === 'dataPort' ||
			mark.kind === 'wallLamp'
				? 8
				: 6}
			class={mark.kind === 'window'
				? 'stroke-window'
				: mark.kind === 'door'
					? 'stroke-door'
					: mark.kind === 'builtin' || mark.kind === 'obstacle' || mark.kind === 'radiator'
						? 'stroke-fixture'
						: 'stroke-electric'}
		/>
	{/each}
	{#if activeWall}
		{@const wall = wallList[activeWall - 1]}
		{#if wall}
			{@const a = project(wall.start)}
			{@const b = project(wall.end)}
			<line
				x1={a.x}
				y1={a.y}
				x2={b.x}
				y2={b.y}
				class="stroke-accent"
				stroke-width="4"
				stroke-linecap="round"
				opacity="0.55"
			/>
		{/if}
	{/if}
	{#each wallLabels as label (label.number)}
		<text
			x={label.x}
			y={label.y}
			text-anchor="middle"
			dominant-baseline="central"
			font-size="10"
			class={label.number === activeWall ? 'fill-accent font-bold' : 'fill-muted'}
		>
			{label.number}
		</text>
	{/each}
	{#each corners as corner (corner.label)}
		<text
			x={corner.x}
			y={corner.y}
			text-anchor="middle"
			dominant-baseline="central"
			font-size="13"
			class={corner.label === activeCorner ? 'fill-accent font-extrabold' : 'fill-text font-bold'}
		>
			{corner.label}
		</text>
	{/each}
	<circle cx={camera.x} cy={camera.y} r="15" class="fill-accent stroke-surface" stroke-width="2" />
	<g transform="translate({camera.x - 9} {camera.y - 9})" class="text-accent-contrast">
		<Camera width="18" height="18" />
	</g>
</svg>
