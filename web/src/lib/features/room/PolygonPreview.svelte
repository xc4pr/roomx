<script lang="ts">
	import { boundingBox, cornerLabel, type Vec } from '#lib/core/geometry.ts';

	interface Props {
		points: Vec[];
		end?: Vec;
		closed?: boolean;
		label?: string;
		class?: string;
	}

	let { points, end, closed = true, label, class: extra = '' }: Props = $props();

	const W = 300;
	const H = 190;
	const PAD = 30;

	const all = $derived(end ? [...points, end] : points);
	const box = $derived(boundingBox([...all, { x: 0, y: 0 }]));
	const scale = $derived(
		Math.min(
			(W - 2 * PAD) / Math.max(box.maxX - box.minX, 1),
			(H - 2 * PAD) / Math.max(box.maxY - box.minY, 1)
		)
	);
	const offsetX = $derived((W - (box.maxX - box.minX) * scale) / 2);
	const offsetY = $derived((H - (box.maxY - box.minY) * scale) / 2);

	function project(p: Vec): Vec {
		return { x: offsetX + (p.x - box.minX) * scale, y: H - offsetY - (p.y - box.minY) * scale };
	}

	const screen = $derived(points.map((p) => project(p)));
	const path = $derived(
		screen.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ') + (closed ? ' Z' : '')
	);
	const gapFrom = $derived(end ? project(end) : undefined);
	const gapTo = $derived(project({ x: 0, y: 0 }));
	const centerX = $derived(screen.reduce((sum, p) => sum + p.x, 0) / Math.max(screen.length, 1));
	const centerY = $derived(screen.reduce((sum, p) => sum + p.y, 0) / Math.max(screen.length, 1));
</script>

<svg
	viewBox="0 0 {W} {H}"
	role="img"
	aria-label={label}
	class="mx-auto block h-auto max-h-48 w-full max-w-sm select-none {extra}"
>
	<path
		d={path}
		class="stroke-accent {closed ? 'fill-accent-soft' : 'fill-none'}"
		stroke-width="2.5"
		stroke-linejoin="round"
		stroke-linecap="round"
	/>
	{#if gapFrom && !closed}
		<line
			x1={gapFrom.x}
			y1={gapFrom.y}
			x2={gapTo.x}
			y2={gapTo.y}
			class="stroke-danger"
			stroke-width="2.5"
			stroke-dasharray="5 4"
			stroke-linecap="round"
		/>
		<circle cx={gapFrom.x} cy={gapFrom.y} r="4.5" class="fill-danger" />
	{/if}
	{#each screen as p, i (i)}
		{@const dx = p.x - centerX}
		{@const dy = p.y - centerY}
		{@const len = Math.hypot(dx, dy) || 1}
		<circle
			cx={p.x + (dx / len) * 14}
			cy={p.y + (dy / len) * 14}
			r="9.5"
			class="fill-surface stroke-border"
			stroke-width="1.5"
		/>
		<text
			x={p.x + (dx / len) * 14}
			y={p.y + (dy / len) * 14}
			text-anchor="middle"
			dominant-baseline="central"
			class="fill-text text-[11px] font-bold"
		>
			{cornerLabel(i)}
		</text>
	{/each}
</svg>
